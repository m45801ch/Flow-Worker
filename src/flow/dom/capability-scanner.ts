import { queryFlowElement, optionValues, type FlowRoot } from "./query";

export type FlowCapabilities = { imageModels: string[]; videoModels: string[]; aspectRatios: Array<"16:9" | "9:16">; modes: Array<"image" | "video">; scannedAt: string; source: "dom" | "cache" };

const imageSeeds = ["Nano Banana Pro", "Nano Banana 2", "Nano Banana 2 Lite"];
const videoSeeds = ["Omni Flash", "Veo 3.1 - Lite", "Veo 3.1 - Fast", "Veo 3.1 - Quality"];

export function scanFlowCapabilities(root: FlowRoot = document): FlowCapabilities {
  const model = queryFlowElement(root, "model").element as HTMLSelectElement | null;
  const aspect = queryFlowElement(root, "aspect").element as HTMLSelectElement | null;
  const models = optionValues(model);
  const imageModels = models.filter((name) => /nano|image|banana/i.test(name));
  const videoModels = models.filter((name) => /veo|omni|video/i.test(name));
  return {
    imageModels: [...new Set([...imageModels, ...imageSeeds.filter((name) => models.includes(name))])],
    videoModels: [...new Set([...videoModels, ...videoSeeds.filter((name) => models.includes(name))])],
    aspectRatios: optionValues(aspect).filter((value): value is "16:9" | "9:16" => value === "16:9" || value === "9:16"),
    modes: ["image", "video"].filter((mode) => mode === "image" || mode === "video"),
    scannedAt: new Date().toISOString(),
    source: model || aspect ? "dom" : "cache"
  };
}
