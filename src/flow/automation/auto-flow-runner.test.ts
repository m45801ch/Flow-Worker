import { describe, expect, it } from "vitest";
import type { AutoFlowBatch } from "./auto-flow-free-protocol";
import { autoFlowWaitMs, createAutoFlowRun, dispatchCurrentBatch, handleAutoFlowItemResult, handleAutoFlowItemStatus, handleAutoFlowRetry } from "./auto-flow-runner";

const batch = (jobId: string, index: number): AutoFlowBatch => ({
  config: { mode: "text2image", concurrency: 1, waitMin: 1, waitMax: 2, resumeIndex: 0, outputCount: 1, aspect: "16:9", imageModel: "Nano Banana 2", imageMode: "new", imageRes: "2k", charEnabled: false, charImageEnabled: false, charNames: [], charSelected: [], maxImages: 1 },
  queue: [{ id: 0, jobId, sourceEntityId: `char-${index}`, text: `prompt-${jobId}`, modelName: "Nano Banana 2", aspectRatio: "16:9", outputCount: 1, status: "pending", progress: 0, imageMode: "new" }]
});

describe("Auto-Flow run state", () => {
  it("calculates a deterministic inter-batch delay from the configured seconds", () => {
    const delayed = batch("job-delay", 1);
    delayed.config.waitMin = 5;
    delayed.config.waitMax = 5;
    expect(autoFlowWaitMs(delayed, 0.5)).toBe(5000);
    delayed.config.waitMin = 2;
    delayed.config.waitMax = 6;
    expect(autoFlowWaitMs(delayed, 0)).toBe(2000);
    expect(autoFlowWaitMs(delayed, 1)).toBe(6000);
  });
  it("dispatches the next settings group after the current group completes", () => {
    const initial = createAutoFlowRun("run-1", [batch("job-1", 1), batch("job-2", 2)]);
    expect(dispatchCurrentBatch(initial)).toMatchObject({ kind: "dispatch", batch: initial.batches[0] });
    const first = handleAutoFlowItemStatus(initial, 0, "running");
    expect(first.events).toContainEqual({ kind: "job-status", jobId: "job-1", status: "configuring" });
    const second = handleAutoFlowItemStatus(first.run, 0, "done");
    expect(second.events).toContainEqual({ kind: "job-status", jobId: "job-1", status: "completed" });
    expect(second.events).toContainEqual({ kind: "dispatch", batch: second.run.batches[1] });
    expect(second.run.batchIndex).toBe(1);
  });

  it("dispatches the next batch after one item reports an error", () => {
    const run = createAutoFlowRun("run-1", [batch("job-1", 1), batch("job-2", 2)]);
    const result = handleAutoFlowItemStatus(run, 0, "error", "Flow did not acknowledge the create button");
    expect(result.run.status).toBe("running");
    expect(result.run.error).toBe("Flow did not acknowledge the create button");
    expect(result.events).toContainEqual({ kind: "job-status", jobId: "job-1", status: "failed", error: "Flow did not acknowledge the create button" });
    expect(result.events).toContainEqual({ kind: "dispatch", batch: result.run.batches[1] });
  });

  it("reports the remembered failure only after every batch has finished", () => {
    const run = createAutoFlowRun("run-1", [batch("job-1", 1), batch("job-2", 2)]);
    const first = handleAutoFlowItemStatus(run, 0, "error", "first item failed");
    const second = handleAutoFlowItemStatus(first.run, 0, "done");
    expect(second.run.status).toBe("failed");
    expect(second.events).toContainEqual({ kind: "failed", error: "first item failed" });
    expect(second.events).toContainEqual({ kind: "job-status", jobId: "job-2", status: "completed" });
  });

  it("continues later Segment Cuts when an earlier Cut fails", () => {
    const firstBatch = batch("job-cut-1", 1);
    const secondBatch = batch("job-cut-2", 2);
    firstBatch.queue[0] = { ...firstBatch.queue[0], segmentId: "SEG-01", cutId: "CUT-01", durationSec: 4 };
    secondBatch.queue[0] = { ...secondBatch.queue[0], segmentId: "SEG-01", cutId: "CUT-02", durationSec: 8 };
    const run = createAutoFlowRun("run-1", [firstBatch, secondBatch]);
    const result = handleAutoFlowItemStatus(run, 0, "error");
    expect(result.run.status).toBe("running");
    expect(result.run.itemStatuses["1:0"]).toBe("pending");
    expect(result.events.some((event) => event.kind === "dispatch")).toBe(true);
  });

  it("maps ITEM_RESULT to the Cut asset metadata event", () => {
    const current = batch("job-cut-1", 1);
    current.queue[0] = { ...current.queue[0], segmentId: "SEG-01", cutId: "CUT-01", durationSec: 4 };
    const run = createAutoFlowRun("run-1", [current]);
    const result = handleAutoFlowItemResult(run, 0, { videoAssetId: "asset-1", localFileName: "CUT-01.mp4" });
    expect(result.events).toContainEqual({ kind: "item-result", jobId: "job-cut-1", segmentId: "SEG-01", cutId: "CUT-01", videoAssetId: "asset-1", localFileName: "CUT-01.mp4", durationSec: 4 });
    expect(result.run.itemResults["0:0"]).toMatchObject({ videoAssetId: "asset-1", localFileName: "CUT-01.mp4" });
  });

  it("finishes the final batch from ITEM_RESULT even if ITEM_STATUS done is late or missing", () => {
    const run = createAutoFlowRun("run-1", [batch("job-1", 1), batch("job-2", 2)]);
    const first = handleAutoFlowItemResult(run, 0, { videoUrl: "https://flow.test/first.png" });
    expect(first.run.status).toBe("running");
    expect(first.run.batchIndex).toBe(1);
    expect(first.events).toContainEqual({ kind: "dispatch", batch: first.run.batches[1] });

    const second = handleAutoFlowItemResult(first.run, 0, { videoUrl: "https://flow.test/second.png" });
    expect(second.run.status).toBe("completed");
    expect(second.events).toContainEqual({ kind: "job-status", jobId: "job-2", status: "completed" });
    expect(second.events).toContainEqual({ kind: "completed" });
  });

  it("maps Auto-Flow retry reports to a retrying job status", () => {
    const run = createAutoFlowRun("run-1", [batch("job-1", 1)]);
    expect(handleAutoFlowRetry(run, 0)).toEqual([{ kind: "job-status", jobId: "job-1", status: "retrying" }]);
  });
});
