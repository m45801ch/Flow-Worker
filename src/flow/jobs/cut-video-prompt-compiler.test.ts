import { describe, expect, it } from "vitest";
import { compileCutVideoPrompt, type CutVideoPromptInput } from "./cut-video-prompt-compiler";

const stateText = "Zhao Wang remains standing at center-back; the dragon throne stays 1.8 meters behind him; preserve identity, costume, and body scale.";
const validInput = (overrides: Partial<CutVideoPromptInput> = {}): CutVideoPromptInput => ({
  projectId: "project-1",
  segmentId: "SEG-01",
  cutId: "CUT-01",
  styleWorld: "Historical Warring States palace drama, grounded cinematic realism.",
  referenceBindings: ["char-3", "scene-palace"],
  previousState: stateText,
  continuityLocks: ["Zhao Wang remains standing", "Preserve the throne anchor"],
  currentAction: "Zhao Wang listens in silence while Lin Xiangru holds the jade bi.",
  camera: "Left-side medium shot, eye level, 50mm lens, stable 180-degree axis.",
  allowedChanges: ["Only the camera changes from frontal to left-side medium shot."],
  forbiddenChanges: ["Zhao Wang sits on the throne", "No costume or facial identity drift"],
  dialogue: "No spoken dialogue.",
  audio: "Quiet palace room tone.",
  negative: ["extra people", "text", "watermark"],
  durationSec: 8,
  ...overrides,
});

describe("Cut video prompt compiler", () => {
  it("writes continuity sections in deterministic order with exact duration", () => {
    const prompt = compileCutVideoPrompt(validInput());
    expect(prompt.indexOf("PREVIOUS CUT STATE")).toBeLessThan(prompt.indexOf("CURRENT CUT ACTION"));
    expect(prompt.indexOf("CURRENT CUT ACTION")).toBeLessThan(prompt.indexOf("CAMERA & FRAMING"));
    expect(prompt).toContain("Zhao Wang remains standing");
    expect(prompt).toContain("FORBIDDEN CHANGES\nZhao Wang sits on the throne; No costume or facial identity drift");
    expect(prompt).toContain("single continuous video, exactly 8 seconds");
  });

  it("rejects a prompt with no current action or camera", () => {
    expect(() => compileCutVideoPrompt(validInput({ currentAction: "", camera: "" }))).toThrow();
  });

  it.each([2, 3, 5, 7, 9])("rejects non-native duration %s", (durationSec) => {
    expect(() => compileCutVideoPrompt(validInput({ durationSec: durationSec as 4 | 6 | 8 }))).toThrow(/4, 6, or 8/);
  });
});
