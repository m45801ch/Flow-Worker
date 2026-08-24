import { describe, expect, it } from "vitest";
import { routeGenerationRequest } from "./request-routing";

describe("generation request routing", () => {
  it("routes script to the configured OpenAI model", () => {
    const result = routeGenerationRequest({ stage: "script" }, { flowProviderSettings: { apiKeys: { openai: "open-key" }, models: { openai: "gpt-4.1-mini" }, stageRoutes: { script: { provider: "openai", model: "gpt-4.1-mini", temperature: 0.45 } } } });
    expect(result).toEqual({ provider: "openai", apiKey: "open-key", model: "gpt-4.1-mini", temperature: 0.45 });
  });

  it("keeps legacy direct requests compatible", () => {
    expect(routeGenerationRequest({ provider: "groq", apiKey: "groq-key", model: "llama", temperature: 0.2 }, {})).toEqual({ provider: "groq", apiKey: "groq-key", model: "llama", temperature: 0.2 });
  });
});
