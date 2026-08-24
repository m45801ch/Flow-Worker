import { describe, expect, it } from "vitest";
import type { FlowJobManifest } from "../flow/jobs/types";
import { toStoredJobRecord } from "./job-record";

const manifest: FlowJobManifest = {
  id: "job-1",
  projectId: "project-1",
  kind: "character-sheet",
  sourceDocumentVersion: 2,
  sourceEntityId: "char-1",
  prompt: "Cinematic close-up of Lin Xiangru. CHARACTER SHEET / 16:9.",
  negativePrompt: "text, watermark",
  assetBindings: ["char-1"],
  inputAssetIds: ["ref-1"],
  outputMode: "image",
  modelName: "Nano Banana 2",
  aspectRatio: "9:16",
  outputCount: 3,
  promptMetadata: {
    characterDescription: "趙國大夫",
    visualPrompt: "Cinematic close-up of Lin Xiangru",
    sheetPrompt: "CHARACTER SHEET / 16:9"
  },
  dependencies: [],
  retryPolicy: { maxAttempts: 2, backoffMs: 1200 }
};

describe("Stored job record mapping", () => {
  it("persists the complete manifest snapshot for a character material job", () => {
    const record = toStoredJobRecord(manifest, "2026-08-24T00:00:00.000Z");
    expect(record).toMatchObject({
      id: "job-1",
      status: "pending",
      modelName: "Nano Banana 2",
      aspectRatio: "9:16",
      outputCount: 3,
      prompt: manifest.prompt,
      negativePrompt: manifest.negativePrompt,
      promptMetadata: manifest.promptMetadata,
      manifest,
      inputAssetIds: ["ref-1"],
      assetBindings: ["char-1"]
    });
  });

  it("keeps video Cut metadata at the record boundary", () => {
    const video = { ...manifest, id: "job-cut-1", kind: "veo-segment" as const, sourceEntityId: "CUT-01", outputMode: "video" as const, modelName: "Veo 3.1 - Fast", aspectRatio: "16:9" as const, durationSec: 4 as const, segmentId: "SEG-01", cutId: "CUT-01", beatClaims: ["B01"], previousState: "Lin stands", currentState: "Lin walks" };
    const record = toStoredJobRecord(video, "2026-08-24T00:00:00.000Z");
    expect(record).toMatchObject({ segmentId: "SEG-01", cutId: "CUT-01", durationSec: 4, manifest: expect.objectContaining({ segmentId: "SEG-01", cutId: "CUT-01", beatClaims: ["B01"] }) });
  });
});
