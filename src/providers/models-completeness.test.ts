import { describe, expect, it, vi } from "vitest";
import { listModels, normalizeModels } from "./models";

describe("complete non-Gemini model catalogs", () => {
  it("follows OpenRouter pagination links and keeps every page", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: "provider/model-1", name: "Model 1" }],
        total_count: 2,
        links: { next: "/api/v1/models?offset=1&limit=1000" }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: "provider/model-2", name: "Model 2" }],
        total_count: 2,
        links: { next: null }
      }), { status: 200 }));

    const models = await listModels("openrouter", "key", fetchImpl as unknown as typeof fetch);

    expect(models.map((model) => model.id)).toEqual(["provider/model-1", "provider/model-2"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get("limit")).toBe("1000");
    expect(String(fetchImpl.mock.calls[1][0])).toContain("offset=1");
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it.each(["openai", "groq"] as const)("keeps a complete de-duplicated %s catalog", (provider) => {
    expect(normalizeModels({ data: [
      { id: `${provider}-model-1` },
      { id: `${provider}-model-2`, name: `${provider} Model 2` },
      { id: `${provider}-model-1` }
    ] }, provider).map((model) => model.id)).toEqual([`${provider}-model-1`, `${provider}-model-2`]);
  });
});
