import { dispatchValueEvents, optionValues, queryFlowElement, readElementValue, type FlowRoot } from "./query";
import type { SetterResult } from "./mode-adapter";

export function selectFlowModel(modelName: string, root: FlowRoot = document): SetterResult {
  const match = queryFlowElement(root, "model");
  const select = match.element as HTMLSelectElement | null;
  if (!select) return { ok: false, expected: modelName, actual: "", candidates: match.candidates };
  const candidates = optionValues(select);
  if (!candidates.includes(modelName)) return { ok: false, expected: modelName, actual: readElementValue(select), candidates };
  select.value = modelName;
  dispatchValueEvents(select);
  return { ok: readElementValue(select) === modelName, expected: modelName, actual: readElementValue(select), candidates };
}
