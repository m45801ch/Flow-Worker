import type { FlowJobManifest, FlowAutomationResult } from "../jobs/types";
import { queryFlowElement, optionValues, dispatchValueEvents, readElementValue, type FlowRoot } from "./query";
import { detectFlowPage } from "./page-detector";

export type SetterResult = { ok: boolean; expected: string; actual: string; candidates: string[] };

function setSelect(root: FlowRoot, role: string, expected: string): SetterResult {
  const match = queryFlowElement(root, role);
  const select = match.element as HTMLSelectElement | null;
  if (!select) return { ok: false, expected, actual: "", candidates: match.candidates };
  const candidates = optionValues(select);
  if (!candidates.includes(expected)) return { ok: false, expected, actual: readElementValue(select), candidates };
  select.value = expected;
  dispatchValueEvents(select);
  const actual = readElementValue(select);
  return { ok: actual === expected, expected, actual, candidates };
}

export async function configureFlow(job: FlowJobManifest, root: FlowRoot = document): Promise<FlowAutomationResult & { mode?: SetterResult; model?: SetterResult; aspect?: SetterResult }> {
  const page = detectFlowPage(root);
  if (!page.isFlowPage) return { ok: false, jobId: job.id, status: "paused", error: "Current page is not a supported labs.google Flow page" };
  const mode = setSelect(root, "mode", job.outputMode);
  if (!mode.ok) return { ok: false, jobId: job.id, status: "paused", error: `Flow mode mismatch: expected ${mode.expected}, actual ${mode.actual}`, candidates: mode.candidates, mode };
  const model = setSelect(root, "model", job.modelName);
  if (!model.ok) return { ok: false, jobId: job.id, status: "paused", error: `Flow model not found: ${job.modelName}`, candidates: model.candidates, mode, model };
  const aspect = setSelect(root, "aspect", job.aspectRatio);
  if (!aspect.ok) return { ok: false, jobId: job.id, status: "paused", error: `Flow aspect ratio mismatch: expected ${aspect.expected}, actual ${aspect.actual}`, candidates: aspect.candidates, mode, model, aspect };
  return { ok: true, jobId: job.id, status: "configuring", mode, model, aspect };
}
