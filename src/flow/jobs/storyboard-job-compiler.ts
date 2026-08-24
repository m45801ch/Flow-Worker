import { compileCutVideoPrompt } from "./cut-video-prompt-compiler";
import { evaluateStoryboardContinuity } from "../../domain/gates/storyboard-continuity-gates";
import { shotStateSchema, type ShotState } from "../../domain/contracts/storyboard-continuity";
import type { FlowAspectRatio, FlowDuration, FlowJobManifest } from "./types";

export type StoryboardAssetReference = { id: string; name: string; aliases?: string[]; kind?: string; referenceAssetIds?: string[] };
type StoryboardContext = { projectId: string; sourceDocumentVersion: number; videoModel: string; aspectRatio: FlowAspectRatio; assetCatalog?: StoryboardAssetReference[] };
type Cut = { id?: string; beats?: unknown[]; durationSec?: number; seconds?: number; action?: string; camera?: string; startState?: string; previousState?: unknown; currentState?: unknown; previousShotState?: unknown; currentShotState?: unknown; dialogue?: string; audio?: string; continuityLocks?: string[]; allowedChanges?: string[]; forbiddenChanges?: string[]; continuityScore?: number; continuityBlockers?: string[]; negative?: string[]; inputAssetIds?: string[]; assetBindings?: string[]; assetNames?: string[]; characters?: string[]; props?: string[] };
type Segment = { id?: string; sceneId?: string; h3Prompt?: string; veoPrompt?: string; styleWorld?: string; startState?: string; camera?: string; dialogue?: string; audio?: string; continuityLocks?: string[]; allowedChanges?: string[]; forbiddenChanges?: string[]; negative?: string[]; assetBindings?: string[]; assetNames?: string[]; characters?: string[]; props?: string[]; cuts?: Cut[] };
type Episode = { id?: string; segments?: Segment[] };
const asText = (value: unknown) => typeof value === "string" ? value.trim() : "";
const asList = (value: unknown) => Array.isArray(value) ? value.map(asText).filter(Boolean) : [];
const parseShotState = (value: unknown): ShotState | undefined => { const parsed = shotStateSchema.safeParse(value); return parsed.success ? parsed.data : undefined; };
const stateText = (value: unknown) => typeof value === "string" ? value.trim() : value && typeof value === "object" ? JSON.stringify(value) : "";
const makeId = () => typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const normalized = (value: string) => value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase();
const unique = (values: string[]) => [...new Set(values.map(asText).filter(Boolean))];
const resolveCutAssets = (segment: Segment, cut: Cut, catalog: StoryboardAssetReference[]) => {
  const explicit = unique([...asList(cut.assetNames), ...asList(cut.characters), ...asList(cut.props), ...asList(segment.assetNames), ...asList(segment.characters), ...asList(segment.props)]);
  const cueText = normalized([cut.action, cut.dialogue, cut.currentState, cut.previousState, segment.h3Prompt, segment.veoPrompt].map(stateText).join(" "));
  const matches = catalog.filter((asset) => {
    const assetNames = [asset.name, ...(asset.aliases || [])].map(normalized).filter(Boolean);
    const assetId = normalized(asset.id);
    return explicit.some((value) => assetNames.includes(normalized(value)) || normalized(value) === assetId) || assetNames.some((assetName) => cueText.includes(assetName));
  });
  const matchedNames = unique([...explicit, ...matches.map((asset) => asset.name)]).slice(0, 3);
  const matched = matches.filter((asset) => matchedNames.some((name) => normalized(name) === normalized(asset.name) || normalized(name) === normalized(asset.id))).slice(0, 3);
  return { names: matchedNames, bindings: unique([...asList(segment.assetBindings), ...asList(cut.assetBindings), ...matched.map((asset) => asset.id)]), inputAssetIds: unique([...asList(cut.inputAssetIds), ...matched.flatMap((asset) => asset.referenceAssetIds || [])]) };
};
const duration = (value: number): FlowDuration => {
  if (!Number.isFinite(value) || value <= 0) throw new Error("A storyboard cut requires a positive duration");
  if (value !== 4 && value !== 6 && value !== 8) throw new Error("Cut video duration must be 4, 6, or 8 seconds");
  return value;
};

export function compileStoryboardJobs(storyboard: unknown, context: StoryboardContext): FlowJobManifest[] {
  if (!context.videoModel.trim()) throw new Error("A video model must be selected before creating Flow jobs");
  if (context.aspectRatio !== "16:9" && context.aspectRatio !== "9:16") throw new Error("Flow video aspect ratio must be 16:9 or 9:16");
  const root = storyboard && typeof storyboard === "object" ? storyboard as Record<string, unknown> : {};
  const episodes = Array.isArray(root.episodes) ? root.episodes as Episode[] : [];
  const jobs: FlowJobManifest[] = [];
  let lastSceneId = "";
  let lastJobId = "";
  for (const episode of episodes) {
    for (const segment of episode.segments ?? []) {
      const segmentId = asText(segment.id);
      if (!segmentId) throw new Error("Every storyboard segment requires a stable id");
      for (const cut of segment.cuts ?? []) {
        const cutId = asText(cut.id);
        if (!cutId) throw new Error("Every storyboard cut requires a stable id");
        const beats = asList(cut.beats);
        if (!beats.length) throw new Error(`Cut ${cutId} must claim at least one script beat`);
        const durationSec = duration(Number(cut.durationSec ?? cut.seconds));
        const assets = resolveCutAssets(segment, cut, context.assetCatalog || []);
        const previousStructuredState = parseShotState(cut.previousShotState ?? cut.previousState);
        const currentStructuredState = parseShotState(cut.currentShotState ?? cut.currentState);
        const previousState = stateText(cut.previousState ?? cut.previousShotState) || asText(segment.startState) || "Begin from the supplied storyboard frame and preserve its established character and environment state.";
        const currentState = stateText(cut.currentState ?? cut.currentShotState) || previousState;
        const allowedChanges = asList(cut.allowedChanges ?? segment.allowedChanges);
        const forbiddenChanges = asList(cut.forbiddenChanges ?? segment.forbiddenChanges);
        const action = asText(cut.action) || asText(segment.veoPrompt) || asText(segment.h3Prompt);
        const camera = asText(cut.camera) || asText(segment.camera) || "Use the storyboard camera and keep the composition stable.";
        const gate = previousStructuredState && currentStructuredState ? evaluateStoryboardContinuity({ previous: previousStructuredState, current: currentStructuredState, allowedChanges, beatClaims: beats.map((beat) => ({ action: beat })), referenceAssetIds: assets.inputAssetIds }) : undefined;
        const continuityBlockers = [...(cut.continuityBlockers || []), ...(gate?.blockers.map((blocker) => `${blocker.code}: ${blocker.message}`) || [])];
        const continuityScore = typeof cut.continuityScore === "number" ? cut.continuityScore : gate?.score.overall;
        const prompt = compileCutVideoPrompt({
          projectId: context.projectId,
          segmentId,
          cutId,
          styleWorld: asText(segment.styleWorld) || "Continuity-safe cinematic world with the supplied art direction.",
          referenceBindings: assets.bindings,
          previousState,
          continuityLocks: asList(cut.continuityLocks ?? segment.continuityLocks),
          currentAction: action,
          camera,
          allowedChanges,
          forbiddenChanges,
          dialogue: asText(cut.dialogue) || asText(segment.dialogue),
          audio: asText(cut.audio) || asText(segment.audio),
          negative: asList(cut.negative ?? segment.negative),
          durationSec,
        });
        const id = makeId();
        jobs.push({
          id,
          projectId: context.projectId,
          kind: "veo-segment",
          sourceDocumentVersion: context.sourceDocumentVersion,
          sourceEntityId: cutId,
          sourceEntityName: cutId,
          prompt,
          negativePrompt: "extra people, objects, text, watermark, face drift, costume drift, spatial discontinuity",
          assetBindings: assets.bindings,
          inputAssetIds: assets.inputAssetIds,
          assetNames: assets.names,
          outputMode: "video",
          modelName: context.videoModel,
          aspectRatio: context.aspectRatio,
          durationSec,
          segmentId,
          cutId,
          beatClaims: beats,
          previousState,
          currentState,
          allowedChanges,
          forbiddenChanges,
          continuityScore,
          continuityBlockers,
          dependencies: lastSceneId === asText(segment.sceneId) && lastJobId ? [lastJobId] : [],
          retryPolicy: { maxAttempts: 2, backoffMs: 1600 },
        });
        lastSceneId = asText(segment.sceneId);
        lastJobId = id;
      }
    }
  }
  return jobs;
}
