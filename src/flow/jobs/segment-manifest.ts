import { segmentManifestSchema, type SegmentManifest } from "../../domain/contracts/storyboard-continuity";
import type { FlowJobManifest, FlowDuration } from "./types";

type CreateSegmentManifestInput = {
  projectId: string;
  episodeId: string;
  sceneId: string;
  segmentId: string;
  jobs: FlowJobManifest[];
  outputFileName?: string;
  concatListFileName?: string;
  now?: string;
};

type SegmentCutResult = {
  cutId: string;
  videoAssetId?: string;
  localFileName?: string;
  updatedAt?: string;
};

const nativeDuration = (value: unknown): FlowDuration => {
  if (value === 4 || value === 6 || value === 8) return value;
  throw new Error("Segment Manifest Cut duration must be 4, 6, or 8 seconds");
};
const nonEmpty = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required for Segment Manifest`);
  return normalized;
};
const nowIso = (value?: string) => value || new Date().toISOString();

export function createSegmentManifest(input: CreateSegmentManifestInput): SegmentManifest {
  const projectId = nonEmpty(input.projectId, "projectId");
  const episodeId = nonEmpty(input.episodeId, "episodeId");
  const sceneId = nonEmpty(input.sceneId, "sceneId");
  const segmentId = nonEmpty(input.segmentId, "segmentId");
  if (!input.jobs.length) throw new Error("A Segment Manifest requires at least one Cut job");
  let cursor = 0;
  const blockers: string[] = [];
  const cutOrder = input.jobs.map((job) => {
    if (job.kind !== "veo-segment" || job.outputMode !== "video") throw new Error(`Job ${job.id} is not a Cut video job`);
    if (job.projectId !== projectId) throw new Error(`Job ${job.id} belongs to a different project`);
    if (job.segmentId !== segmentId) throw new Error(`Job ${job.id} belongs to a different segment`);
    const cutId = nonEmpty(job.cutId || job.sourceEntityId, "cutId");
    const durationSec = nativeDuration(job.durationSec);
    const startTimeSec = cursor;
    cursor += durationSec;
    blockers.push(...(job.continuityBlockers || []).map((blocker) => `${cutId}: ${blocker}`));
    return {
      cutId,
      jobId: nonEmpty(job.id, "jobId"),
      durationSec,
      startTimeSec,
      endTimeSec: cursor,
      continuityScore: typeof job.continuityScore === "number" ? job.continuityScore : 100,
    };
  });
  const timestamp = nowIso(input.now);
  return segmentManifestSchema.parse({
    id: segmentId,
    projectId,
    episodeId,
    sceneId,
    status: blockers.length ? "blocked" : "planned",
    cutOrder,
    totalDurationSec: cursor,
    assembly: {
      tool: "external-ffmpeg",
      outputFileName: input.outputFileName || `${segmentId}.mp4`,
      concatListFileName: input.concatListFileName || `${segmentId}.concat.txt`,
    },
    blockers,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function recordSegmentCutResult(manifest: SegmentManifest, result: SegmentCutResult): SegmentManifest {
  const cutId = nonEmpty(result.cutId, "cutId");
  const videoAssetId = result.videoAssetId?.trim();
  const localFileName = result.localFileName?.trim();
  if (!videoAssetId && !localFileName) throw new Error("A Cut result requires a videoAssetId or localFileName");
  const index = manifest.cutOrder.findIndex((cut) => cut.cutId === cutId);
  if (index < 0) throw new Error(`Cut ${cutId} is not part of Segment ${manifest.id}`);
  const cutOrder = manifest.cutOrder.map((cut, cutIndex) => cutIndex === index ? { ...cut, ...(videoAssetId ? { videoAssetId } : {}), ...(localFileName ? { localFileName } : {}) } : cut);
  const complete = cutOrder.every((cut) => Boolean(cut.videoAssetId && cut.localFileName));
  return segmentManifestSchema.parse({
    ...manifest,
    cutOrder,
    status: manifest.blockers.length ? "blocked" : complete ? "ready-to-assemble" : "generating",
    updatedAt: nowIso(result.updatedAt),
  });
}

export function segmentManifestToJson(manifest: SegmentManifest): string {
  return JSON.stringify(segmentManifestSchema.parse(manifest), null, 2);
}
