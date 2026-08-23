import { describe, expect, it } from "vitest";
import { compileShotPrompt } from "./prompt-compiler";
import type { ShotState } from "./types";

const state: ShotState = {
  shotId: "shot.02.v1", sceneId: "location.office.v1", characters: [], props: [],
  environment: { lighting: "night", weather: "rain", anchors: ["broken window", "desk"] },
  camera: { shotSize: "close-up", lensMm: 85, distanceM: 2, angle: "front", movement: "static" },
  lighting: { source: "streetlamp", intensity: "hard", color: "blue" },
  continuity: { locks: ["identity", "costume", "props", "environment"], allowedChanges: ["shotSize", "lensMm"] }
};

describe("prompt compiler", () => {
  it("emits a single line prompt with the continuity contract", () => {
    const prompt = compileShotPrompt({ previous: state, current: state, characterRefs: ["character.detective_01.v1"], locationRef: state.sceneId, propRefs: ["prop.old_key.v1"] });
    expect(prompt).not.toMatch(/\n/);
    expect(prompt).toContain("Cinematic video shot");
    expect(prompt).toContain("Camera:");
    expect(prompt).toContain("location.office.v1");
  });
});
