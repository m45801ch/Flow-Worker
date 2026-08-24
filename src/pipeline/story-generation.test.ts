import { describe, expect, it } from "vitest";
import { buildStoryGenerationInput } from "./story-generation";
import { defaultSettings } from "../domain/project";

describe("story generation request", () => {
  it("keeps the user theme and settings in a provider-safe JSON request", () => {
    const request = buildStoryGenerationInput("一名失憶偵探追查城市火災", defaultSettings());
    expect(request.userPrompt).toContain("失憶偵探");
    expect(request.schema).toContain("logline");
    expect(request.systemPrompt).not.toContain("趙王");
    expect(request.userPrompt).toContain('"targetDurationSec":60');
    expect(request.userPrompt).toContain("影片目標時長為 60 秒");
  });
});
