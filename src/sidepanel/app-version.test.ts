import packageJson from "../../package.json";
import { afterEach, describe, expect, it } from "vitest";
import { getAppVersion } from "./app-version";

const originalChrome = (globalThis as { chrome?: unknown }).chrome;

afterEach(() => {
  (globalThis as { chrome?: unknown }).chrome = originalChrome;
});

describe("getAppVersion", () => {
  it("uses the extension manifest version when Chrome provides it", () => {
    (globalThis as { chrome?: unknown }).chrome = { runtime: { getManifest: () => ({ version: "9.9.9" }) } };

    expect(getAppVersion()).toBe("9.9.9");
  });

  it("uses the injected package version outside Chrome", () => {
    (globalThis as { chrome?: unknown }).chrome = undefined;

    expect(getAppVersion()).toBe(packageJson.version);
  });
});
