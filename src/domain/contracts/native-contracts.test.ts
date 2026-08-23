import { describe, expect, it } from "vitest";
import { artDocumentSchema } from "./art";
import { castDocumentSchema } from "./cast";
import { outlineDocumentSchema } from "./outline";
import { scriptDocumentSchema } from "./script";
import { storyboardDocumentSchema } from "./storyboard";

const cases = [
  ["outline", outlineDocumentSchema, { adaptation: { source: "novel" }, characters: [], scenes: [], props: [], beats: [], episodes: [], params: {} }],
  ["cast", castDocumentSchema, { characters: [{ id: "C01", name: "Mara", persona: { role: "detective" }, relationships: [], evidence: [], image: { prompt: "portrait", sheetPrompt: "sheet", negativePrompt: "text" }, voice: { prompt: "calm" } }] }],
  ["art", artDocumentSchema, { scenes: [{ id: "S01", name: "Harbor", anchors: [], lightingStates: [], variants: [], imagePrompt: "empty harbor" }], props: [{ id: "P01", name: "Key", scale: "handheld", states: [], imagePrompt: "white background key" }], costumes: [] }],
  ["script", scriptDocumentSchema, { source: "outline", episodes: [{ id: "E01", title: "Opening", scenes: [{ id: "E01-S01", flow: [{ kind: "action", action: "Mara enters", durationSec: 4 }, { kind: "dialogue", speaker: "Mara", line: "誰在那裡？", delivery: "quietly", durationSec: 2 }] }] }] }],
  ["storyboard", storyboardDocumentSchema, { source: "script", episodes: [{ id: "E01", segments: [{ id: "E01-01", sceneId: "S01", h3Prompt: "wide harbor", veoPrompt: "Mara enters the harbor", cuts: [{ id: "E01-01-C01", beats: ["B01"], durationSec: 4 }] }] }] }]
] as const;

describe("native document contracts", () => {
  for (const [name, schema, validDocument] of cases) {
    it(`accepts a valid ${name} document`, () => {
      expect(schema.safeParse(validDocument).success).toBe(true);
    });

    it(`rejects an invalid ${name} document`, () => {
      expect(schema.safeParse({ totallyWrong: 123 }).success).toBe(false);
    });
  }
});
