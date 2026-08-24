import { describe, expect, it, vi } from "vitest";
import { createProvider } from "./provider";

describe("multi-provider generation", () => {
  it.each([
    ["gemini", "https://generativelanguage.googleapis.com/v1beta/models/gemini-model:generateContent?key=key-gemini"],
    ["openai", "https://api.openai.com/v1/chat/completions"],
    ["groq", "https://api.groq.com/openai/v1/chat/completions"],
    ["openrouter", "https://openrouter.ai/api/v1/chat/completions"]
  ] as const)("calls %s with its configured model and auth", async (kind, endpoint) => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(endpoint);
      const headers = init?.headers as Record<string, string>;
      if (kind === "gemini") expect(headers.Authorization).toBeUndefined();
      else expect(headers.Authorization).toBe(`Bearer key-${kind}`);
      const body = JSON.parse(String(init?.body));
      if (kind === "gemini") expect(body.contents[0].parts[0].text).toContain("hello");
      else expect(body.model).toBe("gemini-model");
      return new Response(JSON.stringify(kind === "gemini" ? { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] } : { id: `${kind}-request`, choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const result = await createProvider(kind, { apiKey: `key-${kind}`, model: "gemini-model", temperature: 0.4 }, fetchImpl as unknown as typeof fetch).generateText({ systemPrompt: "system", userPrompt: "hello", schema: "{ok:boolean}", language: "繁體中文", model: "ignored", temperature: 0.4 });
    expect(result.json).toEqual({ ok: true });
    if (kind === "gemini") expect(result.providerRequestId).toBeUndefined(); else expect(result.providerRequestId).toBe(`${kind}-request`);
  });
});
