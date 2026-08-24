import { bindFlowAssets } from "./dom/asset-binder";
import { scanFlowCapabilities } from "./dom/capability-scanner";
import { detectFlowPage } from "./dom/page-detector";
import { configureFlow } from "./dom/mode-adapter";
import { fillFlowPrompt } from "./dom/prompt-adapter";
import { queryFlowElement, dispatchValueEvents } from "./dom/query";
import { isFlowMessage, redactFlowMessage, type FlowMessage } from "./messages";

export async function handleFlowMessage(message: unknown): Promise<unknown> {
  if (!isFlowMessage(message)) return { ok: false, status: "paused", error: "Invalid or unsafe Flow message" };
  const safe = redactFlowMessage(message) as FlowMessage;
  if (!detectFlowPage(document).isFlowPage) return { ok: false, status: "paused", error: "Not a supported Flow page" };
  switch (safe.type) {
    case "SCAN_CAPABILITIES": return { ok: true, capabilities: scanFlowCapabilities(document) };
    case "CONFIGURE_FLOW": return configureFlow(safe.job, document);
    case "FILL_PROMPT": { const result = fillFlowPrompt(safe.prompt, document); return { ok: result.ok, prompt: result }; }
    case "BIND_ASSETS": return bindFlowAssets(safe.assetIds, document);
    case "SUBMIT_FLOW_JOB": {
      const match = queryFlowElement(document, "submit", ["Generate", "生成", "產生"]);
      if (!match.element) return { ok: false, status: "paused", error: "Flow submit control not found", candidates: match.candidates };
      (match.element as HTMLElement).click();
      dispatchValueEvents(match.element);
      return { ok: true, status: "waiting", jobId: safe.job.id };
    }
  }
}

declare const chrome: any;
chrome.runtime?.onMessage?.addListener((message: unknown, _sender: unknown, sendResponse: (response: unknown) => void) => {
  void handleFlowMessage(message).then(sendResponse).catch((error) => sendResponse({ ok: false, status: "failed", error: error instanceof Error ? error.message : "Flow automation failed" }));
  return true;
});
