import type { ShotState } from "../contracts/storyboard-continuity";

export type ShotStateCandidate = Partial<Omit<ShotState, "characters" | "environment" | "camera">> & {
  characters?: Partial<ShotState["characters"]>;
  environment?: Partial<ShotState["environment"]>;
  camera?: Partial<ShotState["camera"]>;
};

export type TransitionResult = { blockers: string[]; transitionRequired: boolean };

export function inheritShotState(previous: ShotState, candidate: ShotStateCandidate): ShotState {
  const characters = { ...previous.characters };
  for (const [id, nextCharacter] of Object.entries(candidate.characters ?? {})) {
    characters[id] = { ...previous.characters[id], ...nextCharacter } as ShotState["characters"][string];
  }
  return {
    characters,
    environment: { ...previous.environment, ...candidate.environment, spatialAnchors: candidate.environment?.spatialAnchors ?? previous.environment.spatialAnchors },
    camera: { ...previous.camera, ...candidate.camera },
  };
}

const containsAny = (text: string, words: string[]) => words.some((word) => text.includes(word));

export function detectActionTransition(previous: ShotState, current: ShotState, beatClaims: Array<{ action?: string; text?: string }>): TransitionResult {
  const actions = beatClaims.map((beat) => `${beat.action ?? ""} ${beat.text ?? ""}`.toLowerCase()).join(" ");
  const blockers: string[] = [];
  const previousPoses = Object.values(previous.characters).map((character) => character.pose.toLowerCase());
  const currentPoses = Object.values(current.characters).map((character) => character.pose.toLowerCase());
  const standingToSeated = previousPoses.some((pose) => containsAny(pose, ["standing", "站立"])) && currentPoses.some((pose) => containsAny(pose, ["seated", "sitting", "坐"]));
  if (standingToSeated) {
    const hasTurn = containsAny(actions, ["turn", "轉身", "转身"]);
    const hasWalk = containsAny(actions, ["walk", "走向", "走到", "走"]);
    const hasSit = containsAny(actions, ["sit", "坐下", "坐在"]);
    if (!(hasTurn && hasWalk && hasSit)) blockers.push("action-transition");
  }
  return { blockers, transitionRequired: blockers.length > 0 };
}
