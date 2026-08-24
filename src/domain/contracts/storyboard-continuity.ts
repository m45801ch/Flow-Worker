import { z } from "zod";

const nonEmpty = z.string().trim().min(1);

export const shotCharacterStateSchema = z.object({
  identityRef: nonEmpty,
  pose: nonEmpty,
  position: nonEmpty,
  facing: nonEmpty,
  eyeLine: nonEmpty,
  scale: nonEmpty,
  costumeRef: nonEmpty,
  heldPropIds: z.array(nonEmpty),
});

export const spatialAnchorSchema = z.object({
  id: nonEmpty,
  description: nonEmpty,
  worldPosition: nonEmpty.optional(),
  visible: z.boolean(),
});

export const shotEnvironmentStateSchema = z.object({
  sceneId: nonEmpty,
  spatialAnchors: z.array(spatialAnchorSchema),
  lighting: nonEmpty,
  weather: nonEmpty.optional(),
});

export const shotCameraStateSchema = z.object({
  shotSize: nonEmpty,
  lensMm: z.number().positive().optional(),
  height: nonEmpty.optional(),
  angle: nonEmpty.optional(),
  distance: nonEmpty.optional(),
  axis: nonEmpty,
  movement: nonEmpty,
  framing: nonEmpty,
});

export const shotStateSchema = z.object({
  characters: z.record(z.string(), shotCharacterStateSchema),
  environment: shotEnvironmentStateSchema,
  camera: shotCameraStateSchema,
});

export const beatClaimSchema = z.object({
  episodeId: nonEmpty,
  sceneId: nonEmpty,
  beatId: nonEmpty,
  order: z.number().int().nonnegative(),
});

export const storyboardContinuitySchema = z.object({
  segmentId: nonEmpty,
  cutId: nonEmpty,
  durationSec: z.union([z.literal(4), z.literal(6), z.literal(8)]),
  beatClaims: z.array(beatClaimSchema).min(1),
  previousState: shotStateSchema,
  currentState: shotStateSchema,
  continuityLocks: z.array(nonEmpty),
  allowedChanges: z.array(nonEmpty),
  forbiddenChanges: z.array(nonEmpty),
});

export const cutContinuitySchema = storyboardContinuitySchema;

export const segmentManifestCutSchema = z.object({
  cutId: nonEmpty,
  jobId: nonEmpty,
  durationSec: z.union([z.literal(4), z.literal(6), z.literal(8)]),
  videoAssetId: nonEmpty.optional(),
  localFileName: nonEmpty.optional(),
  startTimeSec: z.number().nonnegative(),
  endTimeSec: z.number().positive(),
  continuityScore: z.number().min(0).max(100),
});

export const segmentManifestSchema = z.object({
  id: nonEmpty,
  projectId: nonEmpty,
  episodeId: nonEmpty,
  sceneId: nonEmpty,
  status: z.enum(["planned", "generating", "ready-to-assemble", "assembled", "blocked"]),
  cutOrder: z.array(segmentManifestCutSchema),
  totalDurationSec: z.number().positive(),
  assembly: z.object({
    tool: z.enum(["external-ffmpeg", "external-tool"]),
    outputFileName: nonEmpty,
    concatListFileName: nonEmpty,
  }),
  blockers: z.array(nonEmpty),
  createdAt: nonEmpty,
  updatedAt: nonEmpty,
});

export type ShotState = z.infer<typeof shotStateSchema>;
export type BeatClaim = z.infer<typeof beatClaimSchema>;
export type StoryboardContinuity = z.infer<typeof storyboardContinuitySchema>;
export type SegmentManifest = z.infer<typeof segmentManifestSchema>;
