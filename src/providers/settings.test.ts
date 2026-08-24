import { describe, expect, it } from "vitest";
import { normalizeProviderSettings, resolveStageConfig, type StoredProviderSettings } from "./settings";

describe("provider settings", () => {
  it("stores a separate API key and model for Gemini, OpenAI, Groq and OpenRouter", () => {
    const settings = normalizeProviderSettings({
      apiKeys: { gemini: "gem-key", openai: "open-key", groq: "groq-key", openrouter: "router-key" },
      models: { gemini: "gemini-2.5-flash", openai: "gpt-4.1-mini", groq: "llama-3.3-70b-versatile", openrouter: "openai/gpt-4.1-mini" },
      temperatures: { gemini: 0.3, openai: 0.5, groq: 0.6, openrouter: 0.4 },
      stageRoutes: { script: { provider: "openai", model: "gpt-4.1-mini", temperature: 0.4 } }
    });
    expect(settings.apiKeys).toEqual({ gemini: "gem-key", openai: "open-key", groq: "groq-key", openrouter: "router-key" });
    expect(resolveStageConfig(settings, "script")).toMatchObject({ provider: "openai", apiKey: "open-key", model: "gpt-4.1-mini", temperature: 0.4 });
  });

  it("migrates the old single-provider setting without losing the key", () => {
    const settings = normalizeProviderSettings({ provider: "groq", apiKey: "legacy-key", model: "legacy-model", temperature: 0.7 });
    expect(settings.apiKeys.groq).toBe("legacy-key");
    expect(resolveStageConfig(settings, "outline")).toMatchObject({ provider: "groq", apiKey: "legacy-key", model: "legacy-model", temperature: 0.7 });
  });

  it("does not silently call a stage with a missing API key", () => {
    const settings: StoredProviderSettings = normalizeProviderSettings({ apiKeys: { openai: "" }, models: { openai: "gpt-4.1-mini" }, stageRoutes: { storyboard: { provider: "openai", model: "gpt-4.1-mini" } } });
    expect(() => resolveStageConfig(settings, "storyboard")).toThrow(/API Key/i);
  });
});
