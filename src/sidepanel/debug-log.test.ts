import { beforeEach, describe, expect, it } from "vitest";
import { clearDebugLogs, readDebugLogs, recordDebugLog } from "./debug-log";

describe("debug log", () => {
  beforeEach(() => clearDebugLogs());
  it("stores redacted diagnostic metadata without request secrets", () => {
    recordDebugLog("error", "art", "invalid structured JSON", { provider: "gemini", model: "test-model" });
    const logs = readDebugLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].stage).toBe("art");
    expect(JSON.stringify(logs)).not.toContain("apiKey");
  });
});
