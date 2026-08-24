import { describe, expect, it } from "vitest";
import { isFlowMessage, redactFlowMessage } from "./messages";

describe("Flow content-script messages", () => {
  it("accepts only typed automation messages", () => {
    expect(isFlowMessage({ type: "SCAN_CAPABILITIES" })).toBe(true);
    expect(isFlowMessage({ type: "CONFIGURE_FLOW", job: { id: "job-1" } })).toBe(true);
    expect(isFlowMessage({ type: "CONFIGURE_FLOW", apiKey: "secret" })).toBe(false);
  });

  it("redacts accidental key-shaped fields before routing", () => {
    const safe = redactFlowMessage({ type: "FILL_PROMPT", prompt: "hello", apiKey: "secret", authorization: "Bearer secret" });
    expect(safe).toEqual({ type: "FILL_PROMPT", prompt: "hello" });
  });
});
