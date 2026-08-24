import { describe, expect, it } from "vitest";
import { evaluateStoryboardContinuity } from "./storyboard-continuity-gates";
import type { ShotState } from "../contracts/storyboard-continuity";

const baseState = (overrides: Partial<ShotState> = {}): ShotState => ({
  characters: {
    "zhao-wang": {
      identityRef: "char-3",
      pose: "standing",
      position: "center-back",
      facing: "lin-xiangru",
      eyeLine: "toward lin-xiangru",
      scale: "42% frame height",
      costumeRef: "costume-royal",
      heldPropIds: [],
    },
  },
  environment: {
    sceneId: "scene-palace",
    spatialAnchors: [{ id: "throne", description: "dragon throne", worldPosition: "north wall, 1.8m behind", visible: false }],
    lighting: "cool palace daylight",
  },
  camera: {
    shotSize: "medium-wide",
    lensMm: 50,
    height: "eye level",
    angle: "frontal",
    distance: "4.5m",
    axis: "axis-A",
    movement: "static",
    framing: "centered",
  },
  ...overrides,
});

describe("storyboard continuity gates", () => {
  it("blocks a throne that appears without a spatial explanation", () => {
    const previous = baseState();
    const current = baseState({ environment: { ...previous.environment, spatialAnchors: [{ ...previous.environment.spatialAnchors[0], visible: true }] } });
    const result = evaluateStoryboardContinuity({ previous, current, allowedChanges: [], beatClaims: [], referenceAssetIds: ["char-3"] });
    expect(result.blockers.some((item) => item.code === "spatial.anchor")).toBe(true);
  });

  it("blocks character scale drift without a camera explanation", () => {
    const previous = baseState();
    const current = baseState({ characters: { "zhao-wang": { ...previous.characters["zhao-wang"], scale: "78% frame height" } } });
    const result = evaluateStoryboardContinuity({ previous, current, allowedChanges: [], beatClaims: [], referenceAssetIds: ["char-3"] });
    expect(result.blockers.some((item) => item.code === "scale.lock")).toBe(true);
  });

  it("blocks a 180-degree axis break without an explicit camera change", () => {
    const previous = baseState();
    const current = baseState({ camera: { ...previous.camera, axis: "axis-B" } });
    const result = evaluateStoryboardContinuity({ previous, current, allowedChanges: [], beatClaims: [], referenceAssetIds: ["char-3"] });
    expect(result.blockers.some((item) => item.code === "camera.axis")).toBe(true);
  });
});
