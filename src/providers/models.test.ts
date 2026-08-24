import { describe, expect, it } from "vitest";
import { listModels, normalizeModels } from "./models";

describe("provider model catalog", () => {
  it("normalizes OpenAI-compatible model responses", () => {
    expect(normalizeModels({ data: [{ id: "gpt-test", owned_by: "openai" }, { id: "embedding-only" }] }, "openai")).toEqual([{ id: "gpt-test", label: "gpt-test", provider: "openai" }, { id: "embedding-only", label: "embedding-only", provider: "openai" }]);
  });

  it("filters Gemini models to generateContent capable models", () => {
    expect(normalizeModels({ models: [{ name: "models/gemini-a", displayName: "Gemini A", supportedGenerationMethods: ["generateContent"] }, { name: "models/embed-a", displayName: "Embed", supportedGenerationMethods: ["embedContent"] }] }, "gemini")).toEqual([{ id: "gemini-a", label: "Gemini A", provider: "gemini" }]);
  });

  it("uses the provider API key when fetching a model list", async () => {
    const calls: { url: string; headers?: HeadersInit }[] = [];
    await listModels("openrouter", "secret-key", async (url, init) => { calls.push({ url: String(url), headers: init?.headers }); return new Response(JSON.stringify({ data: [{ id: "openrouter/model" }] }), { status: 200 }); });
    const url = new URL(calls[0].url);
    expect(`${url.origin}${url.pathname}`).toBe("https://openrouter.ai/api/v1/models");
    expect(url.searchParams.get("limit")).toBe("1000");
    expect(calls[0].headers).toMatchObject({ Authorization: "Bearer secret-key" });
  });
});
