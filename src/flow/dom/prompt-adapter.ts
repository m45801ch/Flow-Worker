import { queryFlowElement, dispatchValueEvents, readElementValue, type FlowRoot } from "./query";
import type { SetterResult } from "./mode-adapter";

export function fillFlowPrompt(prompt: string, root: FlowRoot = document): SetterResult {
  const match = queryFlowElement(root, "prompt");
  const element = match.element;
  if (!element) return { ok: false, expected: prompt, actual: "", candidates: match.candidates };
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, "value")?.set;
    setter?.call(element, prompt);
  } else {
    element.textContent = prompt;
  }
  dispatchValueEvents(element);
  const actual = readElementValue(element);
  return { ok: actual === prompt, expected: prompt, actual, candidates: [] };
}
