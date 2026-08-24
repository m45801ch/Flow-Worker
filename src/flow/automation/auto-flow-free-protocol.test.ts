import { describe, expect, it } from "vitest";
import type { FlowJobManifest } from "../jobs/types";
import { buildAutoFlowBatch, buildAutoFlowBatches } from "./auto-flow-free-protocol";

const job: FlowJobManifest = {
  id: "job-character-1",
  projectId: "project-1",
  kind: "character-sheet",
  sourceDocumentVersion: 2,
  sourceEntityId: "char-1",
  prompt: "CHARACTER SHEET. CANONICAL VISUAL DESCRIPTION: Cinematic close-up of Lin Xiangru, dignified diplomat, sharp resolute eyes, dark blue silk robes, historical period lighting, highly detailed facial features.",
  negativePrompt: "text, watermark",
  assetBindings: ["char-1"],
  inputAssetIds: [],
  outputMode: "image",
  modelName: "Nano Banana 2",
  aspectRatio: "9:16",
  outputCount: 3,
  promptMetadata: {
    characterDescription: "趙國大夫，氣宇軒昂，眼神堅毅，舉止沉穩。",
    visualPrompt: "Cinematic close-up of Lin Xiangru, a dignified Warring States diplomat, sharp resolute eyes, calm and composed expression, wearing traditional dark blue silk robes with clean lines, historical period drama lighting, 8k resolution, highly detailed facial features.",
    sheetPrompt: "16:9 HORIZONTAL CHARACTER SHEET. LEFT 34% FRONT HALF-BODY PORTRAIT. RIGHT-TOP FRONT, SIDE, BACK VIEWS."
  },
  dependencies: [],
  retryPolicy: { maxAttempts: 2, backoffMs: 1000 }
};

const videoJob: FlowJobManifest = {
  ...job,
  id: "job-cut-1",
  kind: "veo-segment",
  sourceEntityId: "CUT-01",
  outputMode: "video",
  modelName: "Veo 3.1 - Fast",
  aspectRatio: "16:9",
  outputCount: 1,
  durationSec: 8,
  segmentId: "SEG-01",
  cutId: "CUT-01",
  beatClaims: ["B01"],
  previousState: "Lin stands at center",
  currentState: "Lin takes one step",
  continuityScore: 96,
};

describe("Auto-Flow-Free batch protocol", () => {
  it("groups jobs with different settings without losing each job configuration", () => {
    const second = { ...job, id: "job-character-2", sourceEntityId: "char-2", aspectRatio: "16:9" as const, outputCount: 1 as const };
    const batches = buildAutoFlowBatches([job, second]);
    expect(batches).toHaveLength(2);
    expect(batches[0].config.aspect).toBe("9:16");
    expect(batches[0].config.outputCount).toBe(3);
    expect(batches[1].config.aspect).toBe("16:9");
    expect(batches[1].config.outputCount).toBe(1);
  });

  it("orders same-Segment video Cuts by dependency before building the queue", () => {
    const later = { ...videoJob, id: "job-cut-2", sourceEntityId: "CUT-02", cutId: "CUT-02", dependencies: ["job-cut-1"], durationSec: 6 as const };
    const batches = buildAutoFlowBatches([later, videoJob]);
    expect(batches).toHaveLength(1);
    expect(batches[0].queue.map((item) => item.cutId)).toEqual(["CUT-01", "CUT-02"]);
  });

  it("rejects a video Cut with continuity blockers before Flow dispatch", () => {
    expect(() => buildAutoFlowBatch([{ ...videoJob, continuityBlockers: ["spatial.anchor: throne appeared"] }])).toThrow(/連續性/);
  });

  it("preserves Cut metadata in a sequential video queue item", () => {
    const batch = buildAutoFlowBatch([videoJob], { waitMinSec: 1, waitMaxSec: 2, videoRes: "1080p" });
    expect(batch.config).toMatchObject({ mode: "text2video", model: "Veo 3.1 - Fast", aspect: "16:9", videoRes: "1080p", concurrency: 1 });
    expect(batch.queue[0]).toMatchObject({ jobId: "job-cut-1", sourceEntityId: "CUT-01", segmentId: "SEG-01", cutId: "CUT-01", durationSec: 8, beatClaims: ["B01"], previousState: "Lin stands at center", currentState: "Lin takes one step", continuityScore: 96 });
  });

  it("maps character jobs to a complete image batch config and queue item", () => {
    const batch = buildAutoFlowBatch([job], { waitMinSec: 1, waitMaxSec: 2, imageRes: "2k" });
    expect(batch.config).toMatchObject({
      mode: "text2image",
      imageModel: "Nano Banana 2",
      aspect: "9:16",
      outputCount: 3,
      concurrency: 1,
      imageRes: "2k"
    });
    expect(batch.queue).toHaveLength(1);
    expect(batch.queue[0]).toMatchObject({
      id: 0,
      jobId: "job-character-1",
      text: expect.stringContaining("Cinematic close-up of Lin Xiangru"),
      outputCount: 3,
      promptMetadata: expect.objectContaining({ sheetPrompt: expect.stringContaining("CHARACTER SHEET") }),
      status: "pending",
      progress: 0
    });
  });
});


describe("asset naming and references", () => {
  it("passes source name, output name and asset names to the Flow queue", () => {
    const imageJob = { ...job, sourceEntityName: "林相如", outputName: "林相如", assetNames: ["林相如"], inputAssetIds: ["ref-lin"] };
    const batch = buildAutoFlowBatch([imageJob]);
    expect(batch.queue[0]).toMatchObject({ sourceEntityName: "林相如", outputName: "林相如", assetNames: ["林相如"], text: expect.stringContaining("Cinematic") });
  });

  it("passes referenced materials on a video queue item", () => {
    const batch = buildAutoFlowBatch([{ ...videoJob, assetNames: ["趙王", "和氏璧"], assetBindings: ["char-zhao", "prop-he-shi-bi"], inputAssetIds: ["ref-zhao", "ref-jade"] }]);
    expect(batch.queue[0]).toMatchObject({ assetNames: ["趙王", "和氏璧"] });
  });
});
