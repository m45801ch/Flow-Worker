import { describe, expect, it } from "vitest";
import { normalizeScriptBeats } from "./script-duration";

describe("script duration normalization", () => {
  it.each([
    [12, [8, 4]],
    [15, [8, 6]],
    [18, [8, 6, 4]],
  ])("splits %s seconds into native Flow durations", (durationSec, expected) => {
    const beats = normalizeScriptBeats([{ id: "B01", action: "同一個連續動作", durationSec }], "scene-1");
    expect(beats.map((beat) => beat.durationSec)).toEqual(expected);
    expect(beats.every((beat) => [4, 6, 8].includes(beat.durationSec))).toBe(true);
    expect(beats.every((beat) => beat.action.trim() || beat.dialogue.trim())).toBe(true);
  });

  it("removes duration-only beats instead of creating blank actions", () => {
    const beats = normalizeScriptBeats([
      { id: "B01", action: "趙王閱讀書信", durationSec: 4 },
      { id: "B02", action: "", durationSec: 15 },
      { id: "B03", speaker: "趙王", line: "這該如何是好？", durationSec: 4 },
    ], "scene-1");
    expect(beats).toHaveLength(2);
    expect(beats.every((beat) => beat.action.trim() || beat.dialogue.trim())).toBe(true);
    expect(beats.map((beat) => beat.id)).toEqual(["B01", "B03"]);
  });
});
