import type { FlowAspectRatio, FlowDuration, FlowJobManifest, FlowOutputCount, FlowPromptMetadata, FlowOutputMode } from "../jobs/types";

export type AutoFlowMode = "text2image" | "text2video";
export type AutoFlowQueueItem = {
  id: number;
  jobId: string;
  sourceEntityId: string;
  text: string;
  negativePrompt?: string;
  promptMetadata?: FlowPromptMetadata;
  modelName: string;
  aspectRatio: FlowAspectRatio;
  outputCount: FlowOutputCount;
  status: "pending";
  progress: 0;
  imageMode?: "new";
  segmentId?: string;
  cutId?: string;
  durationSec?: FlowDuration;
  beatClaims?: string[];
  previousState?: string;
  currentState?: string;
  allowedChanges?: string[];
  forbiddenChanges?: string[];
  continuityScore?: number;
};

export type AutoFlowBatchConfig = {
  mode: AutoFlowMode;
  concurrency: 1;
  waitMin: number;
  waitMax: number;
  resumeIndex: 0;
  outputCount: FlowOutputCount;
  aspect: FlowAspectRatio;
  model?: string;
  imageModel?: string;
  imageMode?: "new";
  imageRes?: string;
  videoRes?: string;
  charEnabled: false;
  charImageEnabled: false;
  charNames: string[];
  charSelected: string[];
  maxImages: 1;
};

export type AutoFlowBatch = {
  config: AutoFlowBatchConfig;
  queue: AutoFlowQueueItem[];
};

type BatchOptions = {
  waitMinSec?: number;
  waitMaxSec?: number;
  imageRes?: string;
  videoRes?: string;
};

const outputCount = (job: FlowJobManifest): FlowOutputCount => {
  const value = job.outputCount ?? 1;
  return Math.max(1, Math.min(4, value)) as FlowOutputCount;
};

const modeFor = (outputMode: FlowOutputMode): AutoFlowMode => outputMode === "image" ? "text2image" : "text2video";

const batchKey = (job: FlowJobManifest): string => `${job.outputMode}|${job.modelName}|${job.aspectRatio}|${outputCount(job)}${job.outputMode === "video" ? `|${job.segmentId || "unassigned-segment"}` : ""}`;

const orderVideoJobs = (jobs: FlowJobManifest[]) => {
  const remaining = [...jobs];
  const ordered: FlowJobManifest[] = [];
  while (remaining.length) {
    const nextIndex = remaining.findIndex((job) => (job.dependencies || []).every((dependency) => ordered.some((done) => done.id === dependency) || !jobs.some((candidate) => candidate.id === dependency)));
    const index = nextIndex < 0 ? 0 : nextIndex;
    ordered.push(remaining[index]);
    remaining.splice(index, 1);
  }
  return ordered;
};

export function buildAutoFlowBatches(jobs: FlowJobManifest[], options: BatchOptions = {}): AutoFlowBatch[] {
  const groups = new Map<string, FlowJobManifest[]>();
  for (const job of jobs) {
    const group = groups.get(batchKey(job)) ?? [];
    group.push(job);
    groups.set(batchKey(job), group);
  }
  return [...groups.values()].map((group) => buildAutoFlowBatch(group[0].outputMode === "video" ? orderVideoJobs(group) : group, options));
}

export function buildAutoFlowBatch(jobs: FlowJobManifest[], options: BatchOptions = {}): AutoFlowBatch {
  if (!jobs.length) throw new Error("At least one Flow job is required to start an Auto-Flow batch");
  const first = jobs[0];
  const mode = modeFor(first.outputMode);
  const signature = batchKey(first);
  if (jobs.some((job) => batchKey(job) !== signature)) {
    throw new Error("Auto-Flow batch jobs must share output mode, model, aspect ratio, and output count");
  }
  const count = outputCount(first);
  if (mode === "text2video" && jobs.some((job) => (job.continuityBlockers || []).length > 0)) throw new Error("Cannot dispatch a video Cut with continuity blockers");
  if (mode === "text2video" && first.durationSec !== 4 && first.durationSec !== 6 && first.durationSec !== 8) throw new Error("Every video Cut requires a native 4, 6, or 8 second duration");
  return {
    config: {
      mode,
      concurrency: 1,
      waitMin: Math.max(0, options.waitMinSec ?? 1),
      waitMax: Math.max(options.waitMinSec ?? 1, options.waitMaxSec ?? 2),
      resumeIndex: 0,
      outputCount: count,
      aspect: first.aspectRatio,
      ...(mode === "text2image" ? { imageModel: first.modelName, imageMode: "new" as const, imageRes: options.imageRes ?? "2k" } : { model: first.modelName, videoRes: options.videoRes ?? "1080p" }),
      charEnabled: false,
      charImageEnabled: false,
      charNames: [],
      charSelected: [],
      maxImages: 1
    },
    queue: jobs.map((job, id) => ({
      id,
      jobId: job.id,
      sourceEntityId: job.sourceEntityId,
      text: job.prompt,
      negativePrompt: job.negativePrompt,
      promptMetadata: job.promptMetadata,
      modelName: job.modelName,
      aspectRatio: job.aspectRatio,
      outputCount: outputCount(job),
      status: "pending",
      progress: 0,
      ...(mode === "text2image" ? { imageMode: "new" as const } : {
        segmentId: job.segmentId,
        cutId: job.cutId || job.sourceEntityId,
        durationSec: job.durationSec,
        beatClaims: job.beatClaims,
        previousState: job.previousState,
        currentState: job.currentState,
        allowedChanges: job.allowedChanges,
        forbiddenChanges: job.forbiddenChanges,
        continuityScore: job.continuityScore,
      })
    }))
  };
}
