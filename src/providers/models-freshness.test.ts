import { describe, expect, it, vi } from "vitest";
import { listModels, normalizeModels } from "./models";

describe("fresh Gemini model catalog", () => {
  it("accepts current supportedActions and baseModelId metadata", () => {
    const models = normalizeModels({ models: [
      { name: "models/gemini-3.7-flash-001", baseModelId: "gemini-3.7-flash", displayName: "Gemini 3.7 Flash", supportedActions: ["generateContent"] },
      { name: "models/gemini-3.6-flash", displayName: "Gemini 3.6 Flash", supportedGenerationMethods: ["generateContent"] }
    ] }, "gemini");
    expect(models.map((model) => model.id)).toEqual(["gemini-3.7-flash", "gemini-3.6-flash"]);
    expect(models[0].label).toBe("Gemini 3.7 Flash");
  });

  it("fetches every models.list page without browser caching", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: "models/gemini-3.7-flash", displayName: "Gemini 3.7 Flash", supportedActions: ["generateContent"] }], nextPageToken: "page-2" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: "models/gemini-3.5-flash", displayName: "Gemini 3.5 Flash", supportedActions: ["generateContent"] }] }), { status: 200 }));
    const models = await listModels("gemini", "key", fetchImpl as unknown as typeof fetch);
    expect(models.map((model) => model.id)).toEqual(["gemini-3.7-flash", "gemini-3.5-flash"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const first = new URL(String(fetchImpl.mock.calls[0][0]));
    const second = new URL(String(fetchImpl.mock.calls[1][0]));
    expect(first.searchParams.get("pageSize")).toBe("1000");
    expect(first.searchParams.get("pageToken")).toBeNull();
    expect(second.searchParams.get("pageToken")).toBe("page-2");
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
    expect((fetchImpl.mock.calls[0][1]?.headers as Record<string, string>)["Cache-Control"]).toContain("no-cache");
  });
});
