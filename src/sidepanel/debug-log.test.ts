import { beforeEach, describe, expect, it } from "vitest";
import { clearDebugLogs, getDebugLogMode, readDebugLogs, recordDebugLog, setDebugLogMode } from "./debug-log";

describe("debug log", () => {
  beforeEach(() => { clearDebugLogs(); setDebugLogMode("important"); clearDebugLogs(); });
  it("stores redacted diagnostic metadata without request secrets", () => {
    recordDebugLog("error", "art", "invalid structured JSON", { provider: "gemini", model: "test-model" });
    const logs = readDebugLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].stage).toBe("art");
    expect(JSON.stringify(logs)).not.toContain("apiKey");
  });

  it("keeps errors but filters low-signal info in important mode", () => {
    expect(getDebugLogMode()).toBe("important");
    recordDebugLog("info", "queue", "[Panel] all (1-8): generic DOM dump");
    recordDebugLog("error", "queue", "Google Flow 建立失敗：點數不足");
    expect(readDebugLogs().map((entry) => entry.message)).toEqual(["Google Flow 建立失敗：點數不足"]);
  });

  it("keeps ordinary info after switching to verbose mode", () => {
    setDebugLogMode("verbose");
    recordDebugLog("info", "queue", "[Panel] all (1-8): generic DOM dump");
    expect(getDebugLogMode()).toBe("verbose");
    expect(readDebugLogs().some((entry) => entry.message.includes("generic DOM dump"))).toBe(true);
  });
});
