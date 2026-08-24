import type { FlowDuration } from "./types";

export type CutVideoPromptInput = {
  projectId: string;
  segmentId: string;
  cutId: string;
  styleWorld: string;
  referenceBindings: string[];
  previousState: string;
  continuityLocks: string[];
  currentAction: string;
  camera: string;
  allowedChanges: string[];
  forbiddenChanges: string[];
  dialogue?: string;
  audio?: string;
  negative: string[];
  durationSec: FlowDuration;
};

const required = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required for Cut video prompt compilation`);
  return normalized;
};

const list = (values: string[], fallback: string) => values.map((value) => value.trim()).filter(Boolean).join("; ") || fallback;
const isNativeDuration = (value: number): value is FlowDuration => value === 4 || value === 6 || value === 8;

export function compileCutVideoPrompt(input: CutVideoPromptInput): string {
  if (!isNativeDuration(Number(input.durationSec))) throw new Error("Cut video duration must be 4, 6, or 8 seconds");
  const project = required(input.projectId, "projectId");
  const segment = required(input.segmentId, "segmentId");
  const cut = required(input.cutId, "cutId");
  const styleWorld = required(input.styleWorld, "styleWorld");
  const previousState = required(input.previousState, "previousState");
  const currentAction = required(input.currentAction, "current action");
  const camera = required(input.camera, "camera");
  const references = list(input.referenceBindings, "none");
  const locks = list(input.continuityLocks, "Preserve all supplied visual identity and spatial relationships.");
  const allowed = list(input.allowedChanges, "Only the explicitly described camera and action changes are allowed.");
  const forbidden = list(input.forbiddenChanges, "No identity, costume, pose, scale, prop, environment, lighting, or axis drift.");
  const dialogue = input.dialogue?.trim() || "No spoken dialogue.";
  const audio = input.audio?.trim() || "Natural production sound only.";
  const negative = list(input.negative, "extra people, objects, text, watermark, face drift, costume drift, spatial discontinuity");
  return [
    `PROJECT / SEGMENT / CUT\n${project} / ${segment} / ${cut}`,
    `STYLE & WORLD\n${styleWorld}`,
    `REFERENCE BINDINGS\n${references}`,
    `PREVIOUS CUT STATE\n${previousState}`,
    `CONTINUITY LOCKS\n${locks}`,
    `CURRENT CUT ACTION\n${currentAction}`,
    `CAMERA & FRAMING\n${camera}`,
    `ALLOWED CHANGES\n${allowed}`,
    `FORBIDDEN CHANGES\n${forbidden}`,
    `DIALOGUE & AUDIO\nDialogue: ${dialogue}\nAudio: ${audio}`,
    `GENERATION CONSTRAINTS\nsingle continuous video, exactly ${input.durationSec} seconds, preserve character identity, body proportions, spatial relationships, and continuity from the previous Cut`,
    `NEGATIVE\n${negative}`,
  ].join("\n\n");
}
