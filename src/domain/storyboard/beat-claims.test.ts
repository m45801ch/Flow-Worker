import { describe, expect, it } from "vitest";
import { validateBeatCoverage } from "./beat-claims";

const beats = [
  { episodeId: "E01", sceneId: "S01", beatId: "B01", order: 0 },
  { episodeId: "E01", sceneId: "S01", beatId: "B02", order: 1 },
  { episodeId: "E01", sceneId: "S01", beatId: "B03", order: 2 },
];

describe("storyboard beat claims", () => {
  it("rejects duplicated and skipped beat claims", () => {
    const result = validateBeatCoverage(beats, [["B01"], ["B01"]]);
    expect(result.blockers.map((item) => item.code)).toEqual(expect.arrayContaining(["beat.duplicate", "beat.missing"]));
  });

  it("rejects a cut that crosses scenes", () => {
    const result = validateBeatCoverage(
      [{ ...beats[0] }, { episodeId: "E01", sceneId: "S02", beatId: "B04", order: 3 }],
      [["B01", "B04"]],
    );
    expect(result.blockers.some((item) => item.code === "cut.cross-scene")).toBe(true);
  });

  it("rejects claims that are not contiguous in script order", () => {
    const result = validateBeatCoverage(beats, [["B01", "B03"], ["B02"]]);
    expect(result.blockers.some((item) => item.code === "beat.order")).toBe(true);
  });
});
