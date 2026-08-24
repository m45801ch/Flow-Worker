import type { AutoFlowBatch } from "./auto-flow-free-protocol";

export type AutoFlowRunStatus = "running" | "completed" | "failed" | "stopped";
export type AutoFlowItemResultPayload = { videoAssetId?: string; localFileName?: string; videoUrl?: string; dataURL?: string };
export type AutoFlowItemResult = AutoFlowItemResultPayload & { jobId: string; segmentId?: string; cutId?: string; durationSec?: 4 | 6 | 8 };
export type AutoFlowRun = {
  runId: string;
  batches: AutoFlowBatch[];
  batchIndex: number;
  itemStatuses: Record<string, "pending" | "running" | "done" | "error">;
  itemResults: Record<string, AutoFlowItemResult>;
  status: AutoFlowRunStatus;
  error?: string;
};

export type AutoFlowRunEvent =
  | { kind: "job-status"; jobId: string; status: "preflight" | "configuring" | "completed" | "failed" | "retrying"; error?: string }
  | { kind: "item-result"; jobId: string; segmentId?: string; cutId?: string; videoAssetId?: string; localFileName?: string; videoUrl?: string; dataURL?: string; durationSec?: 4 | 6 | 8 }
  | { kind: "dispatch"; batch: AutoFlowBatch }
  | { kind: "completed" }
  | { kind: "failed"; error: string }
  | { kind: "stopped" };

const key = (batchIndex: number, itemId: number) => `${batchIndex}:${itemId}`;

export function createAutoFlowRun(runId: string, batches: AutoFlowBatch[]): AutoFlowRun {
  if (!batches.length) throw new Error("At least one Auto-Flow batch is required");
  const itemStatuses: AutoFlowRun["itemStatuses"] = {};
  batches.forEach((batch, batchIndex) => batch.queue.forEach((item) => { itemStatuses[key(batchIndex, item.id)] = "pending"; }));
  return { runId, batches, batchIndex: 0, itemStatuses, itemResults: {}, status: "running" };
}

export function dispatchCurrentBatch(run: AutoFlowRun): AutoFlowRunEvent {
  if (run.status !== "running") return run.status === "completed" ? { kind: "completed" } : run.status === "stopped" ? { kind: "stopped" } : { kind: "failed", error: run.error || "Auto-Flow run failed" };
  return { kind: "dispatch", batch: run.batches[run.batchIndex] };
}

export function markRunStopped(run: AutoFlowRun): { run: AutoFlowRun; event: AutoFlowRunEvent } {
  return { run: { ...run, status: "stopped" }, event: { kind: "stopped" } };
}

export function handleAutoFlowItemResult(run: AutoFlowRun, itemId: number, payload: AutoFlowItemResultPayload): { run: AutoFlowRun; events: AutoFlowRunEvent[] } {
  if (run.status !== "running") return { run, events: [] };
  const current = run.batches[run.batchIndex];
  const item = current?.queue.find((candidate) => candidate.id === itemId);
  if (!item) return { run, events: [] };
  const result: AutoFlowItemResult = {
    jobId: item.jobId,
    ...(item.segmentId ? { segmentId: item.segmentId } : {}),
    ...(item.cutId || item.sourceEntityId ? { cutId: item.cutId || item.sourceEntityId } : {}),
    ...(item.durationSec ? { durationSec: item.durationSec } : {}),
    ...payload,
  };
  const nextRun = { ...run, itemResults: { ...run.itemResults, [key(run.batchIndex, itemId)]: result } };
  const event: AutoFlowRunEvent = {
    kind: "item-result",
    jobId: result.jobId,
    ...(result.segmentId ? { segmentId: result.segmentId } : {}),
    ...(result.cutId ? { cutId: result.cutId } : {}),
    ...(result.videoAssetId ? { videoAssetId: result.videoAssetId } : {}),
    ...(result.localFileName ? { localFileName: result.localFileName } : {}),
    ...(result.videoUrl ? { videoUrl: result.videoUrl } : {}),
    ...(result.dataURL ? { dataURL: result.dataURL } : {}),
    ...(result.durationSec ? { durationSec: result.durationSec } : {}),
  };
  return { run: nextRun, events: [event] };
}

export function handleAutoFlowItemStatus(run: AutoFlowRun, itemId: number, status: "running" | "done" | "error", error?: string): { run: AutoFlowRun; events: AutoFlowRunEvent[] } {
  if (run.status !== "running") return { run, events: [] };
  const current = run.batches[run.batchIndex];
  const item = current.queue.find((candidate) => candidate.id === itemId);
  if (!item) return { run, events: [] };
  const nextStatuses = { ...run.itemStatuses, [key(run.batchIndex, itemId)]: status };
  const jobStatus = status === "running" ? "configuring" : status === "done" ? "completed" : "failed";
  const events: AutoFlowRunEvent[] = [{ kind: "job-status", jobId: item.jobId, status: jobStatus, ...(error && status === "error" ? { error } : {}) }];
  if (status === "running") return { run: { ...run, itemStatuses: nextStatuses }, events };
  const terminal = current.queue.every((candidate) => ["done", "error"].includes(nextStatuses[key(run.batchIndex, candidate.id)]));
  if (!terminal) return { run: { ...run, itemStatuses: nextStatuses }, events };
  if (current.queue.some((candidate) => nextStatuses[key(run.batchIndex, candidate.id)] === "error")) {
    const failedJob = current.queue.find((candidate) => nextStatuses[key(run.batchIndex, candidate.id)] === "error");
    const failureMessage = error || `Auto-Flow failed for job ${failedJob?.jobId || itemId}`;
    const failedRun = { ...run, itemStatuses: nextStatuses, status: "failed" as const, error: failureMessage };
    events.push({ kind: "failed", error: failedRun.error });
    return { run: failedRun, events };
  }
  const nextIndex = run.batchIndex + 1;
  if (nextIndex >= run.batches.length) {
    const completedRun = { ...run, itemStatuses: nextStatuses, status: "completed" as const };
    events.push({ kind: "completed" });
    return { run: completedRun, events };
  }
  const nextRun = { ...run, itemStatuses: nextStatuses, batchIndex: nextIndex };
  events.push({ kind: "dispatch", batch: nextRun.batches[nextIndex] });
  return { run: nextRun, events };
}

export function handleAutoFlowRetry(run: AutoFlowRun, itemId: number): AutoFlowRunEvent[] {
  const item = run.batches[run.batchIndex]?.queue.find((candidate) => candidate.id === itemId);
  return item ? [{ kind: "job-status", jobId: item.jobId, status: "retrying" }] : [];
}
