import type { FlowJobManifest, FlowAutomationResult } from "../jobs/types";
import { queryFlowElement, optionLabels, findOptionIndex, dispatchValueEvents, readElementValue, type FlowRoot } from "./query";
import { detectFlowPage } from "./page-detector";

export type SetterResult = { ok: boolean; expected: string; actual: string; candidates: string[] };

function setSelect(root: FlowRoot, role: string, expected: string): SetterResult {
  const match = queryFlowElement(root, role);
  const select = match.element as HTMLSelectElement | null;
  if (!select) return { ok: false, expected, actual: "", candidates: match.candidates };
  const candidates = optionLabels(select);
  const optionIndex = findOptionIndex(select, expected);
  if (optionIndex < 0) return { ok: false, expected, actual: readElementValue(select), candidates };
  select.selectedIndex = optionIndex;
  dispatchValueEvents(select);
  const actual = readElementValue(select);
  return { ok: findOptionIndex(select, expected) === select.selectedIndex, expected, actual, candidates };
}

export async function configureFlow(job: FlowJobManifest, root: FlowRoot = document): Promise<FlowAutomationResult & { mode?: SetterResult; model?: SetterResult; aspect?: SetterResult }> {
  const page = detectFlowPage(root);
  if (!page.isFlowPage) return { ok: false, jobId: job.id, status: "paused", error: "目前頁面不是支援的 labs.google Flow 頁面" };
  const mode = setSelect(root, "mode", job.outputMode);
  if (!mode.ok) return { ok: false, jobId: job.id, status: "paused", error: `Flow 模式不符：預期 ${mode.expected}，實際為 ${mode.actual}`, candidates: mode.candidates, mode };
  const model = setSelect(root, "model", job.modelName);
  if (!model.ok) return { ok: false, jobId: job.id, status: "paused", error: `Flow 找不到模型：${job.modelName}`, candidates: model.candidates, mode, model };
  const aspect = setSelect(root, "aspect", job.aspectRatio);
  if (!aspect.ok) return { ok: false, jobId: job.id, status: "paused", error: `Flow 畫面比例不符：預期 ${aspect.expected}，實際為 ${aspect.actual}`, candidates: aspect.candidates, mode, model, aspect };
  return { ok: true, jobId: job.id, status: "configuring", mode, model, aspect };
}
