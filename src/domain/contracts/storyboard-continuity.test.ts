import { describe, expect, it } from "vitest";
import { storyboardContinuitySchema } from "./storyboard-continuity";

const minimalShotState = (pose: string) => ({
  characters: {
    "zhao-wang": {
      identityRef: "char-3",
      pose,
      position: "center-back",
      facing: "lin-xiangru",
      eyeLine: "toward lin-xiangru",
      scale: "full body occupies 42% of frame height",
      costumeRef: "costume-zhao-royal",
      heldPropIds: [],
    },
  },
  environment: {
    sceneId: "scene-palace",
    spatialAnchors: [{ id: "throne", description: "dragon throne behind Zhao Wang", worldPosition: "north wall, 1.8m behind", visible: false }],
    lighting: "cool palace daylight from the east",
  },
  camera: {
    shotSize: "medium-wide",
    lensMm: 50,
    height: "eye level",
    angle: "frontal",
    distance: "4.5m",
    axis: "palace north-south axis",
    movement: "static",
    framing: "Zhao Wang centered with negative space toward Lin Xiangru",
  },
});

const validCut = {
  cutId: "CUT-01",
  segmentId: "SEG-01",
  durationSec: 4,
  beatClaims: [{ episodeId: "E01", sceneId: "S01", beatId: "B01", order: 0 }],
  previousState: minimalShotState("standing"),
  currentState: minimalShotState("standing"),
  continuityLocks: ["Zhao Wang remains standing", "Preserve the throne anchor"],
  allowedChanges: ["camera moves from frontal to left-side medium shot"],
  forbiddenChanges: ["Zhao Wang sits on the throne"],
};

describe("storyboard continuity contract", () => {
  it("accepts a Cut with structured Shot State and a native Flow duration", () => {
    const result = storyboardContinuitySchema.safeParse(validCut);
    expect(result.success).toBe(true);
  });

  it.each([2, 3, 5, 7, 9])("rejects non-native Flow duration %s", (durationSec) => {
    const result = storyboardContinuitySchema.safeParse({ ...validCut, durationSec });
    expect(result.success).toBe(false);
  });

  it("requires identity, environment, and camera state", () => {
    const { previousState: _previousState, ...missingState } = validCut;
    const result = storyboardContinuitySchema.safeParse(missingState);
    expect(result.success).toBe(false);
  });
});
