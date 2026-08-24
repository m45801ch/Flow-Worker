import { describe, expect, it } from "vitest";
import { selectNextFrameStrategy } from "./continuity-linker";

describe("continuity frame strategy", () => {
  it("uses the tail frame for a same-camera continuation", () => {
    expect(selectNextFrameStrategy({ previous: { sceneId: "S01", cameraKey: "wide-50mm" }, current: { sceneId: "S01", cameraKey: "wide-50mm" } })).toBe("use-tail-frame");
  });

  it("rebuilds the start frame for a new camera in the same scene", () => {
    expect(selectNextFrameStrategy({ previous: { sceneId: "S01", cameraKey: "wide-50mm" }, current: { sceneId: "S01", cameraKey: "close-85mm" } })).toBe("rebuild-start-frame");
  });

  it("uses the new scene start frame after a scene change", () => {
    expect(selectNextFrameStrategy({ previous: { sceneId: "S01", cameraKey: "wide-50mm" }, current: { sceneId: "S02", cameraKey: "wide-50mm" } })).toBe("use-scene-start-frame");
  });
});
