import { describe, expect, it } from "vitest";
import { redactSecrets, safeJson } from "./redaction";

describe("security redaction", () => {
  it("removes API keys and authorization headers recursively", () => {
    const safe = redactSecrets({ apiKey: "sk-live-secret", Authorization: "Bearer secret", nested: { token: "abc", password: "pw" }, message: "normal" });
    expect(JSON.stringify(safe)).not.toContain("sk-live-secret");
    expect(JSON.stringify(safe)).not.toContain("Bearer secret");
    expect(safe).toMatchObject({ message: "normal", nested: { token: "[REDACTED]" } });
  });

  it("removes data URLs and raw provider response fields from safe JSON", () => {
    const safe = safeJson({ prompt: "normal prompt", dataUrl: "data:image/png;base64,secret", rawResponse: "provider secret", apiKey: "secret" });
    expect(safe).toEqual({ prompt: "normal prompt" });
  });
});
