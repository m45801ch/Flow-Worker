export type FlowJobKind = "character-sheet" | "scene-sheet" | "prop-sheet" | "storyboard-frame" | "veo-segment";
export type FlowOutputMode = "image" | "video";
export type FlowAspectRatio = "16:9" | "9:16";
export type FlowDuration = 4 | 6 | 8;
export type FlowOutputCount = 1 | 2 | 3 | 4;
export type FlowPromptMetadata = {
  characterDescription?: string;
  visualPrompt?: string;
  sheetPrompt?: string;
};
export type RetryPolicy = { maxAttempts: number; backoffMs: number };

export type FlowJobManifest = {
  id: string;
  projectId: string;
  kind: FlowJobKind;
  sourceDocumentVersion: number;
  sourceEntityId: string;
  prompt: string;
  negativePrompt?: string;
  assetBindings: string[];
  inputAssetIds: string[];
  outputMode: FlowOutputMode;
  modelName: string;
  aspectRatio: FlowAspectRatio;
  outputCount?: FlowOutputCount;
  durationSec?: FlowDuration;
  promptMetadata?: FlowPromptMetadata;
  segmentId?: string;
  cutId?: string;
  beatClaims?: string[];
  previousState?: string;
  currentState?: string;
  allowedChanges?: string[];
  forbiddenChanges?: string[];
  continuityScore?: number;
  continuityBlockers?: string[];
  dependencies: string[];
  retryPolicy: RetryPolicy;
};

export type FlowJobStatus = "pending" | "preflight" | "configuring" | "binding-assets" | "submitting" | "waiting" | "capturing" | "validating" | "completed" | "paused" | "retrying" | "failed" | "cancelled" | "needs-user-selection";

export type FlowAutomationResult = { ok: boolean; jobId: string; status: FlowJobStatus; assetIds?: string[]; error?: string; candidates?: string[] };
