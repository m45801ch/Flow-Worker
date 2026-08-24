import { createProvider, listModels } from "../providers";
import { isFlowMessage, redactFlowMessage } from "../flow/messages";
import { routeGenerationRequest } from "../providers/request-routing";
import { createAutoFlowRun, dispatchCurrentBatch, handleAutoFlowItemResult, handleAutoFlowItemStatus, handleAutoFlowRetry, markRunStopped, type AutoFlowRun, type AutoFlowRunEvent } from "../flow/automation/auto-flow-runner";
import type { AutoFlowBatch } from "../flow/automation/auto-flow-free-protocol";
import { jobStore } from "../storage/job-store";
import { segmentManifestStore } from "../storage/segment-manifest-store";
import { recordSegmentCutResult } from "../flow/jobs/segment-manifest";

declare const chrome: any;

const enableActionToOpenPanel = () => chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
const flowUrl = (url: unknown) => typeof url === "string" && /https:\/\/labs\.google\/(?:fx\/)?[^ ]*tools\/flow/i.test(url);
const runId = () => typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `auto-flow-${Date.now()}`;

let activeAutoFlowRun: AutoFlowRun | null = null;
let activeFlowTabId: number | null = null;

chrome.runtime?.onInstalled?.addListener(() => { void enableActionToOpenPanel(); });
void enableActionToOpenPanel();

async function currentFlowTab(): Promise<number> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs?.find((candidate: any) => typeof candidate?.id === "number" && flowUrl(candidate?.url));
  if (typeof tab?.id !== "number") throw new Error("請先開啟 Google Flow 專案頁面，再執行素材佇列");
  return tab.id;
}

async function setJobStatus(jobId: string, status: "preflight" | "configuring" | "completed" | "failed" | "retrying" | "paused", error?: string) {
  const record = await jobStore.get(jobId);
  if (!record) return;
  const patch = { checkpoint: status, error: error || undefined, ...(status === "retrying" ? { attempts: record.attempts + 1 } : {}) };
  await jobStore.updateStatus(jobId, status, patch);
  try { chrome.runtime.sendMessage({ type: "AUTO_FLOW_JOB_STATUS", jobId, status, error }); } catch { /* side panel may be closed */ }
}

async function sendBatchToFlow(batch: AutoFlowBatch): Promise<number> {
  const tabId = await currentFlowTab();
  activeFlowTabId = tabId;
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["auto-flow-free.js"] });
  } catch (error) {
    throw new Error(`無法載入 Flow 自動化腳本：${error instanceof Error ? error.message : "scripting failed"}`);
  }
  await chrome.tabs.sendMessage(tabId, { type: "START_BATCH", config: batch.config, queue: batch.queue });
  return tabId;
}

async function emitRunStatus(status: "running" | "completed" | "failed" | "stopped", details: Record<string, unknown> = {}) {
  try { chrome.runtime.sendMessage({ type: "AUTO_FLOW_RUN_STATUS", runId: activeAutoFlowRun?.runId, status, ...details }); } catch { /* side panel may be closed */ }
}

async function applyRunnerEvent(event: AutoFlowRunEvent) {
  if (event.kind === "item-result") {
    const record = await jobStore.get(event.jobId);
    const assetId = event.videoAssetId || event.videoUrl;
    if (record && assetId) {
      const outputAssetIds = [...new Set([...record.outputAssetIds, assetId])];
      await jobStore.updateStatus(event.jobId, "completed", { outputAssetIds, videoAssetId: event.videoAssetId, localFileName: event.localFileName, segmentId: event.segmentId, cutId: event.cutId });
    }
    if (event.segmentId && event.cutId && assetId) {
      const manifest = await segmentManifestStore.get(event.segmentId);
      if (manifest) {
        const updated = recordSegmentCutResult(manifest, { cutId: event.cutId, videoAssetId: assetId, localFileName: event.localFileName, updatedAt: new Date().toISOString() });
        await segmentManifestStore.save(updated);
        try { chrome.runtime.sendMessage({ type: "SEGMENT_MANIFEST_UPDATED", manifest: updated }); } catch { /* side panel may be closed */ }
      }
    }
    return;
  }
  if (event.kind === "job-status") {
    await setJobStatus(event.jobId, event.status, event.status === "failed" ? "Google Flow 生成失敗，請查看 Flow 頁面與除錯紀錄" : undefined);
    return;
  }
  if (event.kind === "dispatch") {
    for (const item of event.batch.queue) await setJobStatus(item.jobId, "preflight");
    await sendBatchToFlow(event.batch);
    await emitRunStatus("running", { batchIndex: activeAutoFlowRun?.batchIndex, batchSize: event.batch.queue.length });
    return;
  }
  if (event.kind === "completed") { await emitRunStatus("completed"); activeAutoFlowRun = null; activeFlowTabId = null; return; }
  if (event.kind === "failed") {
    const failedRun = activeAutoFlowRun;
    if (activeFlowTabId !== null) { try { await chrome.tabs.sendMessage(activeFlowTabId, { type: "STOP_BATCH" }); } catch { /* tab may have navigated */ } }
    if (failedRun) {
      for (const [batchIndex, batch] of failedRun.batches.entries()) {
        for (const item of batch.queue) {
          const status = failedRun.itemStatuses[`${batchIndex}:${item.id}`];
          if (status === "pending" || status === "running") await setJobStatus(item.jobId, "paused", "前一個 Cut 失敗，後續 Cut 已暫停");
        }
      }
    }
    await emitRunStatus("failed", { error: event.error });
    activeAutoFlowRun = null;
    activeFlowTabId = null;
    return;
  }
  if (event.kind === "stopped") { await emitRunStatus("stopped"); activeAutoFlowRun = null; activeFlowTabId = null; }
}

async function startAutoFlowBatch(message: any, sendResponse: (response: unknown) => void) {
  if (activeAutoFlowRun?.status === "running") { sendResponse({ ok: false, error: "已有 Auto-Flow 佇列正在執行" }); return; }
  const batches = Array.isArray(message.batches) ? message.batches as AutoFlowBatch[] : [];
  if (!batches.length) { sendResponse({ ok: false, error: "沒有可執行的 Flow job" }); return; }
  try {
    activeAutoFlowRun = createAutoFlowRun(typeof message.runId === "string" ? message.runId : runId(), batches);
    const startedRunId = activeAutoFlowRun.runId;
    await applyRunnerEvent(dispatchCurrentBatch(activeAutoFlowRun));
    sendResponse({ ok: true, runId: startedRunId, batchCount: batches.length });
  } catch (error) {
    const failedRun = activeAutoFlowRun;
    activeAutoFlowRun = null;
    activeFlowTabId = null;
    if (failedRun) for (const batch of failedRun.batches.slice(failedRun.batchIndex)) for (const item of batch.queue) await setJobStatus(item.jobId, "failed", error instanceof Error ? error.message : "Unable to start Auto-Flow");
    sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unable to start Auto-Flow" });
  }
}

async function stopAutoFlow(sendResponse: (response: unknown) => void) {
  if (!activeAutoFlowRun) { sendResponse({ ok: true, status: "idle" }); return; }
  const stopped = markRunStopped(activeAutoFlowRun);
  activeAutoFlowRun = stopped.run;
  if (activeFlowTabId !== null) { try { await chrome.tabs.sendMessage(activeFlowTabId, { type: "STOP_BATCH" }); } catch { /* tab may have navigated */ } }
  for (const batch of activeAutoFlowRun.batches.slice(activeAutoFlowRun.batchIndex)) {
    for (const item of batch.queue) {
      if (activeAutoFlowRun.itemStatuses[`${activeAutoFlowRun.batches.indexOf(batch)}:${item.id}`] !== "done") await setJobStatus(item.jobId, "paused", "使用者停止 Auto-Flow 佇列");
    }
  }
  await applyRunnerEvent(stopped.event);
  sendResponse({ ok: true, status: "stopped" });
}

async function handleAutoFlowEvent(message: any, sender: any) {
  if (!activeAutoFlowRun || activeAutoFlowRun.status !== "running") return;
  if (activeFlowTabId !== null && sender?.tab?.id !== activeFlowTabId) return;
  if (message.type === "ITEM_RETRY") {
    for (const event of handleAutoFlowRetry(activeAutoFlowRun, Number(message.id))) await applyRunnerEvent(event);
    return;
  }
  if (message.type === "ITEM_RESULT") {
    const result = handleAutoFlowItemResult(activeAutoFlowRun, Number(message.id), { videoAssetId: message.videoAssetId, localFileName: message.localFileName, videoUrl: message.videoUrl, dataURL: message.dataURL });
    activeAutoFlowRun = result.run;
    for (const event of result.events) await applyRunnerEvent(event);
    return;
  }
  if (message.type !== "ITEM_STATUS") return;
  const result = handleAutoFlowItemStatus(activeAutoFlowRun, Number(message.id), message.status === "done" ? "done" : message.status === "error" ? "error" : "running");
  activeAutoFlowRun = result.run;
  for (const event of result.events) await applyRunnerEvent(event);
}

async function routeFlowMessage(message: unknown, sendResponse: (response: unknown) => void) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs?.[0]?.id;
    if (typeof tabId !== "number") { sendResponse({ ok: false, status: "paused", error: "No active Flow tab found" }); return; }
    chrome.tabs.sendMessage(tabId, redactFlowMessage(message), sendResponse);
  } catch (error) {
    sendResponse({ ok: false, status: "failed", error: error instanceof Error ? error.message : "Unable to route Flow message" });
  }
}

async function dispatchTrustedClick(tabId: number, x: number, y: number) {
  if (!Number.isInteger(tabId) || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) throw new Error("invalid trusted-click target");
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  } finally {
    if (attached) { try { await chrome.debugger.detach(target); } catch { /* already detached */ } }
  }
}

chrome.runtime?.onMessage?.addListener((message: any, sender: any, sendResponse: (response: unknown) => void) => {
  if (isFlowMessage(message)) { void routeFlowMessage(message, sendResponse); return true; }
  if (message?.type === "START_AUTO_FLOW_BATCH") { void startAutoFlowBatch(message, sendResponse); return true; }
  if (message?.type === "STOP_AUTO_FLOW") { void stopAutoFlow(sendResponse); return true; }
  if (["ITEM_STATUS", "ITEM_RETRY", "ITEM_RESULT", "DEBUG_LOG"].includes(message?.type)) { void handleAutoFlowEvent(message, sender); return false; }
  if (message?.type === "TRUSTED_CLICK") {
    void dispatchTrustedClick(sender?.tab?.id, Number(message.x), Number(message.y)).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Trusted click failed" }));
    return true;
  }
  if (message?.type !== "GENERATE_TEXT" && message?.type !== "LIST_MODELS") return false;
  (async () => {
    try {
      const saved = await chrome.storage.local.get(["flowProviderSettings", "provider", "apiKey", "model", "temperature"]);
      if (message.type === "LIST_MODELS") {
        const provider = message.provider ?? saved.provider ?? "gemini";
        const apiKey = message.apiKey ?? saved.apiKey;
        if (!apiKey) throw new Error("請先輸入 API Key");
        sendResponse({ ok: true, models: await listModels(provider, apiKey) });
        return;
      }
      const routed = routeGenerationRequest(message, saved);
      const provider = createProvider(routed.provider, { apiKey: routed.apiKey, model: routed.model, temperature: routed.temperature });
      sendResponse({ ok: true, result: await provider.generateText({ ...message.input, model: routed.model, temperature: routed.temperature }) });
    } catch (error) { sendResponse({ ok: false, error: error instanceof Error ? error.message : "Provider request failed" }); }
  })();
  return true;
});
