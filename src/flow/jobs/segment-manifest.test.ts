import { describe, expect, it } from "vitest";
import { createSegmentManifest, recordSegmentCutResult, segmentManifestToJson } from "./segment-manifest";
import type { FlowJobManifest } from "./types";

const job = (overrides: Partial<FlowJobManifest> = {}): FlowJobManifest => ({
  id: "job-1",
  projectId: "project-1",
  kind: "veo-segment",
  sourceDocumentVersion: 3,
  sourceEntityId: "CUT-01",
  prompt: "prompt",
  negativePrompt: "negative",
  assetBindings: [],
  inputAssetIds: [],
  outputMode: "video",
  modelName: "Veo 3.1 - Fast",
  aspectRatio: "16:9",
  durationSec: 4,
  segmentId: "SEG-01",
  cutId: "CUT-01",
  beatClaims: ["B01"],
  continuityScore: 96,
  dependencies: [],
  retryPolicy: { maxAttempts: 2, backoffMs: 1600 },
  ...overrides,
});

const jobs = [job(), job({ id: "job-2", cutId: "CUT-02", sourceEntityId: "CUT-02", durationSec: 6, beatClaims: ["B02"], dependencies: ["job-1"], continuityScore: 91 })];

describe("Segment Manifest", () => {
  it("creates an ordered external-assembly manifest with native Cut timeline", () => {
    const manifest = createSegmentManifest({ projectId: "project-1", episodeId: "E01", sceneId: "S01", segmentId: "SEG-01", jobs, now: "2026-08-24T00:00:00.000Z" });
    expect(manifest).toMatchObject({ id: "SEG-01", projectId: "project-1", episodeId: "E01", sceneId: "S01", status: "planned", totalDurationSec: 10, assembly: { tool: "external-ffmpeg", outputFileName: "SEG-01.mp4", concatListFileName: "SEG-01.concat.txt" } });
    expect(manifest.cutOrder).toEqual([
      expect.objectContaining({ cutId: "CUT-01", jobId: "job-1", durationSec: 4, startTimeSec: 0, endTimeSec: 4, continuityScore: 96 }),
      expect.objectContaining({ cutId: "CUT-02", jobId: "job-2", durationSec: 6, startTimeSec: 4, endTimeSec: 10, continuityScore: 91 }),
    ]);
  });

  it("becomes ready-to-assemble only after every Cut has a generated asset", () => {
    const planned = createSegmentManifest({ projectId: "project-1", episodeId: "E01", sceneId: "S01", segmentId: "SEG-01", jobs, now: "2026-08-24T00:00:00.000Z" });
    const oneDone = recordSegmentCutResult(planned, { cutId: "CUT-01", videoAssetId: "asset-1", localFileName: "CUT-01.mp4", updatedAt: "2026-08-24T00:01:00.000Z" });
    expect(oneDone.status).toBe("generating");
    const ready = recordSegmentCutResult(oneDone, { cutId: "CUT-02", videoAssetId: "asset-2", localFileName: "CUT-02.mp4", updatedAt: "2026-08-24T00:02:00.000Z" });
    expect(ready.status).toBe("ready-to-assemble");
    expect(ready.cutOrder[1]).toMatchObject({ videoAssetId: "asset-2", localFileName: "CUT-02.mp4" });
  });

  it("serializes a manifest as exportable JSON without changing its schema", () => {
    const manifest = createSegmentManifest({ projectId: "project-1", episodeId: "E01", sceneId: "S01", segmentId: "SEG-01", jobs, now: "2026-08-24T00:00:00.000Z" });
    const parsed = JSON.parse(segmentManifestToJson(manifest));
    expect(parsed).toEqual(manifest);
  });

  it("rejects mixed segments and invalid durations before export", () => {
    expect(() => createSegmentManifest({ projectId: "project-1", episodeId: "E01", sceneId: "S01", segmentId: "SEG-01", jobs: [job({ durationSec: 5 as 4 }), job({ id: "job-2", segmentId: "SEG-02" })] })).toThrow(/4, 6, or 8|segment/i);
  });
});
