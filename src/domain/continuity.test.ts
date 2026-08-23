import { describe, expect, it } from "vitest";
import { evaluateContinuity } from "./continuity";
import type { ShotState } from "./types";

const shot = (overrides: Partial<ShotState> = {}): ShotState => ({
  shotId: "shot.01.v1",
  sceneId: "location.office.v1",
  characters: [{ id: "character.detective_01.v1", heightCm: 178, pose: "standing", position: { x: 0, y: 0, z: 0 }, facing: "east", screenRegion: "center", relativeScale: 1, heldProps: [], costumeId: "costume.detective.coat.v1", expression: "neutral" }],
  props: [{ id: "prop.old_key.v1", position: { x: 0.5, y: 0, z: 0 }, heldBy: null, state: "closed" }],
  environment: { lighting: "day", weather: "clear", anchors: ["desk"] },
  camera: { shotSize: "medium", lensMm: 50, distanceM: 4, angle: "front", movement: "static" },
  lighting: { source: "window", intensity: "soft", color: "daylight" },
  continuity: { locks: ["identity", "face", "height", "costume", "pose", "position", "props", "environment", "lighting"], allowedChanges: ["shotSize", "lensMm", "distanceM", "angle", "movement"] },
  ...overrides
});

describe("continuity engine", () => {
  it("allows a camera-only change without changing shot state", () => {
    const report = evaluateContinuity(shot(), shot({ camera: { shotSize: "close-up", lensMm: 85, distanceM: 2, angle: "three-quarter", movement: "push-in" } }));
    expect(report.blockers).toHaveLength(0);
    expect(report.score).toBeGreaterThanOrEqual(90);
  });

  it("blocks standing to sitting without an explicit transition", () => {
    const report = evaluateContinuity(shot(), shot({ characters: [{ ...shot().characters[0], pose: "sitting" }] }));
    expect(report.blockers.some((item) => item.code === "ACTION_JUMP")).toBe(true);
  });

  it("allows a justified action transition", () => {
    const report = evaluateContinuity(shot(), shot({ characters: [{ ...shot().characters[0], pose: "sitting" }], transition: { steps: ["turn", "walk_to_chair", "arrive", "turn", "sit"], reason: "The detective reaches the chair." } }));
    expect(report.blockers).toHaveLength(0);
  });
});
