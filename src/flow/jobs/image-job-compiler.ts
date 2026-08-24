import type { FlowAspectRatio, FlowJobManifest, FlowOutputCount, RetryPolicy } from "./types";

const retryPolicy: RetryPolicy = { maxAttempts: 2, backoffMs: 1200 };
const requireModel = (model: string) => {
  if (!model.trim()) throw new Error("An image model must be selected before creating a Flow job");
  return model.trim();
};
const makeId = () => typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const asText = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const dataText = (value: unknown): string => value && typeof value === "object" ? Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${asText(item)}`).filter(Boolean).join("; ") : asText(value);

export type ImageContext = { projectId: string; sourceDocumentVersion: number; imageModel: string; aspectRatio?: FlowAspectRatio; outputCount?: FlowOutputCount };
type ImageEntity = { id: string; name?: string; image?: { prompt?: string; sheetPrompt?: string; negativePrompt?: string }; imagePrompt?: string; prompt?: string; negativePrompt?: string; description?: string; persona?: unknown; anchors?: unknown[]; lightingStates?: unknown[]; scale?: string; states?: unknown[]; referenceAssetIds?: string[] };

function createImageJob(entity: ImageEntity, context: ImageContext, kind: FlowJobManifest["kind"], prompt: string, negativePrompt: string, promptMetadata?: FlowJobManifest["promptMetadata"]): FlowJobManifest {
  const modelName = requireModel(context.imageModel);
  if (!asText(entity.id)) throw new Error("An image job requires a stable source entity id");
  return {
    id: makeId(), projectId: context.projectId, kind, sourceDocumentVersion: context.sourceDocumentVersion, sourceEntityId: entity.id,
    prompt, negativePrompt, assetBindings: [entity.id], inputAssetIds: entity.referenceAssetIds ?? [], outputMode: "image", modelName, aspectRatio: context.aspectRatio ?? "16:9", outputCount: context.outputCount ?? 1, promptMetadata, dependencies: [], retryPolicy: { ...retryPolicy }
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
