import { dispatchValueEvents, findOptionIndex, optionLabels, queryFlowElement, readElementValue, type FlowRoot } from "./query";
import type { SetterResult } from "./mode-adapter";

export function selectFlowModel(modelName: string, root: FlowRoot = document): SetterResult {
  const match = queryFlowElement(root, "model");
  const select = match.element as HTMLSelectElement | null;
  if (!select) return { ok: false, expected: modelName, actual: "", candidates: match.candidates };
  const candidates = optionLabels(select);
  const optionIndex = findOptionIndex(select, modelName);
  if (optionIndex < 0) return { ok: false, expected: modelName, actual: readElementValue(select), candidates };
  select.selectedIndex = optionIndex;
  dispatchValueEvents(select);
  return { ok: findOptionIndex(select, modelName) === select.selectedIndex, expected: modelName, actual: readElementValue(select), candidates };
}
