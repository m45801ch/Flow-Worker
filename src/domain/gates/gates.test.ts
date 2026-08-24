import { describe, expect, it } from "vitest";
import { runArtGates } from "./art-gates";
import { runCastGates } from "./cast-gates";
import { runOutlineGates } from "./outline-gates";
import { runScriptGates } from "./script-gates";
import { runStoryboardGates } from "./storyboard-gates";

const validCast = {
  characters: [{
    id: "C01",
    name: "Mara",
    persona: { role: "detective", appearance: "short black hair" },
    relationships: [],
    evidence: [],
    image: {
      prompt: "Cinematic close-up of Mara, a disciplined detective with sharp observant eyes, short black hair, calm focused expression, wearing a tailored charcoal detective coat over a dark shirt, cinematic noir lighting, 8k resolution, highly detailed facial features.",
      sheetPrompt: "16:9 HORIZONTAL CHARACTER SHEET. LEFT 34% FRONT HALF-BODY PORTRAIT. RIGHT-TOP ZONE: FRONT, SIDE, BACK FULL-BODY VIEWS. RIGHT-BOTTOM ZONE: 4 COSTUME DETAILS. SAME FACE, SAME HAIR, SAME CLOTHING. PROPORTIONS ARE CRITICAL.",
      negativePrompt: "text, watermark, extra people, malformed limbs"
    },
    voice: { prompt: "calm and low" }
  }]
};

const validArt = {
  scenes: [{ id: "S01", name: "Harbor", anchors: ["lighthouse"], lightingStates: ["dawn"], variants: [], imagePrompt: "empty harbor, no people" }],
  props: [{ id: "P01", name: "Key", scale: "handheld", states: ["clean"], imagePrompt: "white background prop key, no hand" }],
  costumes: []
};

const validScript = {
  source: "outline",
  episodes: [{ id: "E01", title: "Opening", scenes: [{ id: "E01-S01", flow: [{ kind: "action", action: "Mara enters", durationSec: 4 }, { kind: "dialogue", speaker: "Mara", line: "誰在那裡？", delivery: "quietly", durationSec: 2 }] }] }]
};

const validStoryboard = {
  source: "script",
  episodes: [{ id: "E01", segments: [{ id: "E01-01", sceneId: "S01", h3Prompt: "wide harbor", veoPrompt: "Mara enters the harbor", cuts: [{ id: "E01-01-C01", beats: ["B01"], durationSec: 4 }] }] }]
};

describe("deterministic quality gates", () => {
  it("rejects a character sheet prompt without three-view layout", () => {
    const invalid = { ...validCast, characters: [{ ...validCast.characters[0], image: { ...validCast.characters[0].image, sheetPrompt: "portrait" } }] };
    const report = runCastGates(invalid);
    expect(report.passed).toBe(false);
    expect(report.blockers.map((item) => item.code)).toContain("cast.sheet-layout");
  });

  it("rejects a character image prompt that is only a short role description", () => {
    const invalid = { ...validCast, characters: [{ ...validCast.characters[0], image: { ...validCast.characters[0].image, prompt: "趙國君主，面容憂慮，神態顯得焦慮不安。" } }] };
    const report = runCastGates(invalid);
    expect(report.passed).toBe(false);
    expect(report.blockers.map((item) => item.code)).toContain("cast.image-prompt-quality");
  });

  it("accepts a complete character sheet prompt", () => {
    expect(runCastGates(validCast).passed).toBe(true);
  });

  it("rejects a scene prompt that includes people", () => {
    const invalid = { ...validArt, scenes: [{ ...validArt.scenes[0], imagePrompt: "harbor with a person" }] };
    expect(runArtGates(invalid).blockers.map((item) => item.code)).toContain("art.scene-no-people");
  });

  it("rejects a script without an action beat", () => {
    const invalid = { ...validScript, episodes: [{ ...validScript.episodes[0], scenes: [{ ...validScript.episodes[0].scenes[0], flow: [{ kind: "dialogue", speaker: "Mara", line: "你好", delivery: "calm", durationSec: 2 }] }] }] };
    expect(runScriptGates(invalid).blockers.map((item) => item.code)).toContain("script.action-beat");
  });

  it("rejects storyboard cuts over eight seconds", () => {
    const invalid = { ...validStoryboard, episodes: [{ ...validStoryboard.episodes[0], segments: [{ ...validStoryboard.episodes[0].segments[0], cuts: [{ ...validStoryboard.episodes[0].segments[0].cuts[0], durationSec: 9 }] }] }] };
    expect(runStoryboardGates(invalid).blockers.map((item) => item.code)).toContain("storyboard.flow-max-8s");
  });

  it("rejects an outline with duplicate stable ids", () => {
    const report = runOutlineGates({ characters: [{ id: "C01" }, { id: "C01" }], scenes: [], props: [], beats: [], episodes: [], adaptation: {}, params: {} });
    expect(report.blockers.map((item) => item.code)).toContain("outline.duplicate-id");
  });
});
