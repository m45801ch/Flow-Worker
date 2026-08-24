import type { FlowAutomationResult } from "../jobs/types";
import type { FlowRoot } from "./query";

export type AssetBindingResult = FlowAutomationResult & { bindings?: Record<string, string> };

export function bindFlowAssets(assetIds: string[], root: FlowRoot = document): AssetBindingResult {
  const bindings: Record<string, string> = {};
  for (const assetId of assetIds) {
    const candidates = Array.from(root.querySelectorAll<HTMLElement>(`[data-flow-asset-id="${assetId}"]`));
    if (candidates.length !== 1) return { ok: false, jobId: "", status: "needs-user-selection", error: candidates.length ? `Multiple Flow assets match ${assetId}` : `Flow asset not found: ${assetId}`, candidates: candidates.map((candidate) => candidate.textContent?.trim() || assetId), bindings };
    bindings[assetId] = assetId;
    candidates[0].setAttribute("data-flow-selected", "true");
  }
  return { ok: true, jobId: "", status: "binding-assets", bindings };
}
