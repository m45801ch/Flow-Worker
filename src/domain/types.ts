export type AssetKind = "character" | "location" | "prop" | "costume" | "accessory";
export type Position = { x: number; y: number; z: number };

export type CharacterShotState = {
  id: string; heightCm: number; pose: string; position: Position; facing: string;
  screenRegion: string; relativeScale: number; heldProps: string[]; costumeId: string; expression: string;
};
export type PropShotState = { id: string; position: Position; heldBy: string | null; state: string };
export type CameraState = { shotSize: string; lensMm: number; distanceM: number; angle: string; movement: string };
export type LightingState = { source: string; intensity: string; color: string };
export type ContinuityLocks = { locks: string[]; allowedChanges: string[] };
export type ShotState = {
  shotId: string; sceneId: string; characters: CharacterShotState[]; props: PropShotState[];
  environment: { lighting: string; weather: string; anchors: string[] };
  camera: CameraState; lighting: LightingState; continuity: ContinuityLocks;
  transition?: { steps: string[]; reason: string };
};

export type ContinuityIssue = { code: string; severity: "blocker" | "warning"; message: string };
export type ContinuityReport = { score: number; blockers: ContinuityIssue[]; warnings: ContinuityIssue[]; changedFields: string[] };
export type AssetCandidate = { id: string; name: string; aliases: string[] };
export type ProjectContext = { projectId: string; language: string; outputFormat: "json" | "text" };
