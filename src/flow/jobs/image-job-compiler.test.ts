import { describe, expect, it } from "vitest";
import { compileCharacterSheetJob, compilePropSheetJob, compileSceneSheetJob } from "./image-job-compiler";

const context = { projectId: "project-1", sourceDocumentVersion: 2, imageModel: "Nano Banana 2" };
const character = { id: "C01", name: "Mara", persona: { role: "detective", appearance: "short black hair" }, relationships: [], evidence: [], image: { prompt: "Cinematic close-up of Mara, a disciplined detective with sharp observant eyes, short black hair, calm focused expression, wearing a tailored charcoal detective coat over a dark shirt, cinematic noir lighting, 8k resolution, highly detailed facial features.", sheetPrompt: "16:9 horizontal character sheet left 34% front right-top side back right-bottom 4 details same face same hair proportions", negativePrompt: "text, watermark" }, voice: { prompt: "calm" } };
const scene = { id: "S01", name: "Harbor", anchors: ["lighthouse"], lightingStates: ["dawn"], variants: [], imagePrompt: "empty harbor, no people" };
const prop = { id: "P01", name: "Key", scale: "handheld", states: ["clean"], imagePrompt: "white background prop key, no hand" };

describe("image Flow job compiler", () => {
  it("compiles a 16:9 character sheet job with the selected image model", () => {
    const job = compileCharacterSheetJob(character, context);
    expect(job).toMatchObject({ kind: "character-sheet", outputMode: "image", modelName: "Nano Banana 2", aspectRatio: "16:9", sourceEntityId: "C01", sourceEntityName: "Mara", outputName: "Mara", outputVariantLabels: ["正面", "側臉", "背面"], assetBindings: ["C01"] });
    expect(job.prompt).toContain("RIGHT-TOP ZONE");
    expect(job.prompt).toContain("PROPORTIONS ARE CRITICAL");
    expect(job.prompt).toContain("Cinematic close-up of Mara");
  });

  it("compiles scene and prop sheets without changing their stable ids", () => {
    const sceneJob = compileSceneSheetJob(scene, context);
    const propJob = compilePropSheetJob(prop, context);
    expect(sceneJob).toMatchObject({ kind: "scene-sheet", sourceEntityId: "S01", aspectRatio: "16:9" });
    expect(propJob).toMatchObject({ kind: "prop-sheet", sourceEntityId: "P01", aspectRatio: "16:9" });
    expect(propJob.prompt).toContain("WHITE BACKGROUND");
  });

  it("preserves configured image settings and canonical character prompt metadata", () => {
    const job = compileCharacterSheetJob(character, { ...context, aspectRatio: "9:16", outputCount: 3 });
    expect(job.aspectRatio).toBe("9:16");
    expect((job as any).outputCount).toBe(3);
    expect((job as any).promptMetadata).toMatchObject({
      characterDescription: "role: detective; appearance: short black hair",
      visualPrompt: expect.stringContaining("Cinematic close-up of Mara"),
      sheetPrompt: expect.stringContaining("right-top")
    });
  });

  it("rejects an image job without an explicitly selected model", () => {
    expect(() => compileCharacterSheetJob(character, { ...context, imageModel: "" })).toThrow(/圖片模型/);
  });
});


describe("image output naming", () => {
  it("keeps the character name on the image job for Flow download naming", () => {
    const job = compileCharacterSheetJob({ ...character, referenceAssetIds: ["REF-C01"] }, context);
    expect(job).toMatchObject({ sourceEntityName: "Mara", outputName: "Mara", inputAssetIds: ["REF-C01"] });
  });
});
