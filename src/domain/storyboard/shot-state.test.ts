import { describe, expect, it } from "vitest";
import { detectActionTransition, inheritShotState } from "./shot-state";
import type { ShotState } from "../contracts/storyboard-continuity";

const previousState: ShotState = {
  characters: {
    "zhao-wang": {
      identityRef: "char-3",
      pose: "standing",
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
};

const seatedState: ShotState = {
  ...previousState,
  characters: { ...previousState.characters, "zhao-wang": { ...previousState.characters["zhao-wang"], pose: "seated on the throne", position: "on throne" } },
};

describe("shot state continuity", () => {
  it("inherits identity, scale, prop anchors, and lighting when only camera changes", () => {
    const next = inheritShotState(previousState, { camera: { shotSize: "medium", axis: "palace north-south axis", movement: "dolly-in", framing: "Zhao Wang remains centered" } });
    expect(next.characters["zhao-wang"].scale).toBe(previousState.characters["zhao-wang"].scale);
    expect(next.characters["zhao-wang"].identityRef).toBe(previousState.characters["zhao-wang"].identityRef);
    expect(next.environment.spatialAnchors).toEqual(previousState.environment.spatialAnchors);
    expect(next.environment.lighting).toBe(previousState.environment.lighting);
    expect(next.camera.movement).toBe("dolly-in");
  });

  it("blocks standing to seated without a transition beat", () => {
    const result = detectActionTransition(previousState, seatedState, [{ action: "Zhao Wang is seated" }]);
    expect(result.blockers).toContain("action-transition");
  });

  it("allows seated state after explicit turn, walk, and sit beats", () => {
    const result = detectActionTransition(previousState, seatedState, [
      { action: "Zhao Wang turns toward the throne" },
      { action: "Zhao Wang walks to the throne" },
      { action: "Zhao Wang sits down on the throne" },
    ]);
    expect(result.blockers).not.toContain("action-transition");
  });
});
