import { describe, expect, it } from "vitest";
import { compileVeoPrompt } from "./veo-prompt-compiler";

describe("Veo prompt compiler", () => {
  it("compiles every locked section and exact dialogue", () => {
    const fixture = {
      styleWorld: "cinematic coastal noir, 1990s Taiwan, wet concrete, blue dawn",
      referenceBindings: ["C01", "S01", "P01"],
      startState: "Mara stands beside the lighthouse, holding the key, looking east",
      action: "0s-3s Mara walks toward the door; 3s-6s she raises the key",
      camera: "medium shot, eye level, 50mm lens, slow dolly in",
      dialogue: "誰在那裡？",
      audio: "quiet waves and restrained strings",
      continuityLocks: ["Mara's face and coat", "lighthouse position", "key in right hand"],
      negative: ["extra people", "text", "watermark"]
    };
    const prompt = compileVeoPrompt(fixture);
    for (const heading of ["STYLE & WORLD", "REFERENCE BINDINGS", "START STATE", "0–8 SECOND ACTION", "CAMERA", "DIALOGUE & AUDIO", "CONTINUITY LOCKS", "NEGATIVE"]) expect(prompt).toContain(heading);
    expect(prompt).toContain(fixture.dialogue);
    expect(prompt).toContain("C01, S01, P01");
  });

  it("rejects an empty action timeline", () => {
    expect(() => compileVeoPrompt({ styleWorld: "noir", referenceBindings: [], startState: "ready", action: "", camera: "wide", dialogue: "", audio: "", continuityLocks: [], negative: [] })).toThrow(/action/i);
  });
});
