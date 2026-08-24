import type { FlowAspectRatio, FlowJobManifest, FlowOutputCount, RetryPolicy } from "./types";

const retryPolicy: RetryPolicy = { maxAttempts: 2, backoffMs: 1200 };
const requireModel = (model: string) => {
  if (!model.trim()) throw new Error("建立 Flow 任務前必須先選擇圖片模型");
  return model.trim();
};
const makeId = () => typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const asText = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const dataText = (value: unknown): string => value && typeof value === "object" ? Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${asText(item)}`).filter(Boolean).join("; ") : asText(value);
const extractVariantLabels = (prompt: string): string[] => {
  const labels: string[] = [];
  const add = (label: string) => { if (!labels.includes(label)) labels.push(label); };
  if (/front|正面|正視|正面像/i.test(prompt)) add("正面");
  if (/side|profile|側臉|側面/i.test(prompt)) add("側臉");
  if (/back|rear|背面|背影/i.test(prompt)) add("背面");
  if (/three|三視圖|character sheet|reference sheet/i.test(prompt)) add("三視圖");
  if (/smil|微笑|笑容/i.test(prompt)) add("微笑");
  if (/angry|怒|憤怒/i.test(prompt)) add("憤怒");
  if (/sad|悲傷|哭/i.test(prompt)) add("悲傷");
  if (/different expressions|multiple expressions|多種表情|不同表情|表情變化/i.test(prompt) && labels.filter((label) => ["微笑", "憤怒", "悲傷"].includes(label)).length === 0) return ["平靜", "微笑", "憤怒"];
  if (labels.includes("三視圖") && labels.length === 1) return ["正面", "側臉", "背面"];
  return labels.filter((label) => label !== "三視圖");
};

export type ImageContext = { projectId: string; sourceDocumentVersion: number; imageModel: string; aspectRatio?: FlowAspectRatio; outputCount?: FlowOutputCount };
type ImageEntity = { id: string; name?: string; image?: { prompt?: string; sheetPrompt?: string; negativePrompt?: string }; imagePrompt?: string; prompt?: string; negativePrompt?: string; description?: string; persona?: unknown; anchors?: unknown[]; lightingStates?: unknown[]; scale?: string; states?: unknown[]; referenceAssetIds?: string[] };

function createImageJob(entity: ImageEntity, context: ImageContext, kind: FlowJobManifest["kind"], prompt: string, negativePrompt: string, promptMetadata?: FlowJobManifest["promptMetadata"]): FlowJobManifest {
  const modelName = requireModel(context.imageModel);
  if (!asText(entity.id)) throw new Error("圖片任務需要穩定的來源項目 ID");
  return {
    id: makeId(), projectId: context.projectId, kind, sourceDocumentVersion: context.sourceDocumentVersion, sourceEntityId: entity.id,
    sourceEntityName: asText(entity.name) || entity.id, prompt, negativePrompt, assetBindings: [entity.id], inputAssetIds: entity.referenceAssetIds ?? [], outputName: asText(entity.name) || entity.id, outputVariantLabels: extractVariantLabels(prompt), outputMode: "image", modelName, aspectRatio: context.aspectRatio ?? "16:9", outputCount: context.outputCount ?? 1, promptMetadata, dependencies: [], retryPolicy: { ...retryPolicy }
  };
}

export function compileCharacterSheetJob(character: ImageEntity, context: ImageContext): FlowJobManifest {
  const visualPrompt = asText(character.image?.prompt);
  const persona = dataText(character.persona);
  const supplied = asText(character.image?.sheetPrompt);
  const prompt = [
    "CHARACTER SHEET / 16:9 HORIZONTAL CANVAS.",
    "LEFT 34%: FRONT HALF-BODY PORTRAIT, THE FACIAL BASELINE.",
    "RIGHT-TOP ZONE: FRONT, SIDE, BACK FULL-BODY VIEWS AT THE SAME HEIGHT.",
    "RIGHT-BOTTOM ZONE: 4-5 COSTUME, ACCESSORY, HAIRSTYLE OR SHOE DETAILS.",
    "SAME FACE, SAME HAIR, SAME CLOTHING ACROSS ALL VIEWS. PROPORTIONS ARE CRITICAL.",
    `CHARACTER ID ${character.id}. ${asText(character.name)}.`, visualPrompt ? `CANONICAL VISUAL DESCRIPTION: ${visualPrompt}` : `CHARACTER CONTEXT: ${persona}.`, supplied
  ].filter(Boolean).join(" ");
  const negativePrompt = [asText(character.image?.negativePrompt), "text, watermark, extra people, extra limbs, cropped views, compressed body proportions, face drift"].filter(Boolean).join(", ");
  return createImageJob(character, context, "character-sheet", prompt, negativePrompt, { characterDescription: persona, visualPrompt, sheetPrompt: supplied });
}

export function compileSceneSheetJob(scene: ImageEntity, context: ImageContext): FlowJobManifest {
  const prompt = ["SCENE SHEET / 16:9 HORIZONTAL.", "EMPTY SCENE, NO PEOPLE, NO CHARACTERS.", asText(scene.name), asText(scene.imagePrompt || scene.prompt), scene.anchors?.length ? `ANCHORS: ${scene.anchors.map(String).join(", ")}.` : "", scene.lightingStates?.length ? `LIGHTING STATES: ${scene.lightingStates.map(String).join(", ")}.` : ""].filter(Boolean).join(" ");
  return createImageJob(scene, context, "scene-sheet", prompt, "people, characters, text, watermark, distorted architecture");
}

export function compilePropSheetJob(prop: ImageEntity, context: ImageContext): FlowJobManifest {
  const prompt = ["PROP SHEET / 16:9 HORIZONTAL.", "WHITE BACKGROUND, SINGLE OBJECT, NO HANDS, NO PEOPLE.", asText(prop.name), asText(prop.imagePrompt || prop.prompt), prop.scale ? `SCALE: ${prop.scale}.` : "", prop.states?.length ? `STATES: ${prop.states.map(String).join(", ")}.` : ""].filter(Boolean).join(" ");
  return createImageJob(prop, context, "prop-sheet", prompt, "hands, people, text, watermark, duplicate objects");
}
