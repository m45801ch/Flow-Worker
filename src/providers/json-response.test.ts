import { describe, expect, it } from "vitest";
import { parseStructuredJson } from "./json-response";
import { retryProviderRequest } from "./provider";

describe("structured provider responses", () => {
  it("parses fenced JSON and rejects invalid output", () => {
    expect(parseStructuredJson<{ title: string }>("```json\n{\"title\":\"A\"}\n```")).toEqual({ title: "A" });
    expect(parseStructuredJson<{ assetPrompts: unknown[] }>("Here is the result:\n{\"assetPrompts\":[]}\nDone.")).toEqual({ assetPrompts: [] });
    expect(parseStructuredJson<unknown[]>("```json\n[{\"id\":1}]\n```")).toEqual([{ id: 1 }]);
    expect(() => parseStructuredJson("not json")).toThrow("structured JSON");
  });

  it("retries transient provider failures with bounded backoff", async () => {
    let attempts = 0;
    const result = await retryProviderRequest(async () => { attempts += 1; if (attempts < 3) throw Object.assign(new Error("busy"), { retryable: true }); return "ok"; }, 3, 1);
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });
});
