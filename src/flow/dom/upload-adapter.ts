import { dispatchValueEvents, queryFlowElement, type FlowRoot } from "./query";
import type { SetterResult } from "./mode-adapter";

export async function uploadFlowAsset(file: File, root: FlowRoot = document): Promise<SetterResult> {
  const match = queryFlowElement(root, "asset-input");
  const input = match.element as HTMLInputElement | null;
  if (!input || input.type !== "file") return { ok: false, expected: file.name, actual: "", candidates: match.candidates };
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  dispatchValueEvents(input);
  const actual = input.files?.[0]?.name || "";
  return { ok: actual === file.name, expected: file.name, actual, candidates: [] };
}
