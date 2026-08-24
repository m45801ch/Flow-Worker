import type { FlowJobManifest } from "../flow/jobs/types";
import type { StoredJobRecord } from "./job-store";

export function toStoredJobRecord(job: FlowJobManifest, updatedAt = new Date().toISOString()): StoredJobRecord {
  return {
    id: job.id,
    projectId: job.projectId,
    kind: job.kind,
    sourceEntityId: job.sourceEntityId,
    status: "pending",
    modelName: job.modelName,
    aspectRatio: job.aspectRatio,
    outputCount: job.outputCount,
    durationSec: job.durationSec,
    prompt: job.prompt,
    negativePrompt: job.negativePrompt,
    promptMetadata: job.promptMetadata,
    assetBindings: [...job.assetBindings],
    inputAssetIds: [...job.inputAssetIds],
    manifest: structuredClone(job),
    segmentId: job.segmentId,
    cutId: job.cutId,
    attempts: 0,
    outputAssetIds: [],
    checkpoint: "pending",
    updatedAt
  };
}
