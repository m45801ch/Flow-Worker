import { describe, expect, it, vi } from "vitest";
import { createProjectV2 } from "../../domain/project-v2";
import { createStageRunners } from "./index";

const context = { projectId: "project-1", language: "繁體中文", outputFormat: "json" as const };

const castDocument = {
  characters: [{ id: "C01", name: "Mara", persona: { role: "detective" }, relationships: [], evidence: [], image: { prompt: "Cinematic close-up of Mara, a disciplined detective with sharp observant eyes, short black hair, calm focused expression, wearing a tailored charcoal detective coat over a dark shirt, cinematic noir lighting, 8k resolution, highly detailed facial features.", sheetPrompt: "16:9 horizontal character sheet left 34% front right-top side back right-bottom 4 details same face same hair proportions", negativePrompt: "text" }, voice: { prompt: "calm" } }]
};

describe("stage runners", () => {
  it("sends the exact native contract instead of a generic data schema", async () => {
    const generateText = vi.fn().mockResolvedValue({ json: castDocument, text: JSON.stringify(castDocument) });
    const runner = createStageRunners({ generateText }, createProjectV2("Test")).cast;
    const result = await runner.run({ outline: { characters: [] } }, context);
    expect(result.output).toEqual(castDocument);
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ schema: expect.stringContaining("characters"), systemPrompt: expect.stringContaining("cast") }));
    expect(generateText.mock.calls[0][0].systemPrompt).toContain("complete English cinematic image.prompt");
    expect(generateText.mock.calls[0][0].schema).not.toContain('"data":{}');
  });

  it("does not store malformed output when a stage gate blocks it", async () => {
    const invalidCast = { characters: [{ id: "C01", name: "Mara", persona: "detective", relationships: [], evidence: [], image: { prompt: "portrait", sheetPrompt: "portrait", negativePrompt: "text" }, voice: { prompt: "calm" } }] };
    const generateText = vi.fn().mockResolvedValue({ json: invalidCast, text: JSON.stringify(invalidCast) });
    const runner = createStageRunners({ generateText }, createProjectV2("Test")).cast;
    await expect(runner.run({}, context)).rejects.toThrow(/cast\.sheet-layout/);
  });

  it("returns the requested native stage name and a one-based version", async () => {
    const outline = { adaptation: { source: "original" }, characters: [], scenes: [], props: [], beats: [], episodes: [], params: {} };
    const generateText = vi.fn().mockResolvedValue({ json: outline, text: JSON.stringify(outline) });
    const runner = createStageRunners({ generateText }, createProjectV2("Test")).outline;
    const result = await runner.run({}, context);
    expect(result.stage).toBe("outline");
    expect(result.version).toBe(1);
  });
});
