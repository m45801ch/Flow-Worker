import { beforeEach, describe, expect, it, vi } from "vitest";

const database = { put: vi.fn(), get: vi.fn(), getAll: vi.fn() };

vi.mock("idb", () => ({ openDB: vi.fn(async () => database) }));

import { projectStore } from "./project-store";

const legacyProject = {
  schemaVersion: "1.0",
  project: { id: "legacy", title: "Legacy", settings: { theme: "", genre: "", era: "", location: "", visualStyle: "", language: "繁體中文", aspectRatio: "16:9", episodeDurationSec: 60, totalEpisodes: 1, shotsPerEpisode: 8, audience: "", pace: "", forbiddenElements: "", referenceStyle: "" }, provider: "gemini", model: "gemini-2.0-flash", status: "draft", updatedAt: "2026-08-23T00:00:00.000Z" },
  outline: null, artCompleted: false, characters: [], locations: [], props: [], costumes: [], episodes: [], spatialMaps: [], shotStates: [], continuityReports: [], promptVersions: []
};

describe("projectStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("migrates and persists a validated V1 record returned by get", async () => {
    database.get.mockResolvedValue(legacyProject);

    const project = await projectStore.get("legacy");

    expect(project?.schemaVersion).toBe("2.0");
    expect(project?.migration?.sourceBackup).toEqual(legacyProject);
    expect(database.put).toHaveBeenCalledWith("projects", expect.objectContaining({ schemaVersion: "2.0" }), "legacy");
  });

  it("validates every stored record returned by list", async () => {
    database.getAll.mockResolvedValue([legacyProject, { schemaVersion: "2.0", project: { id: "broken" } }]);

    await expect(projectStore.list()).rejects.toThrow("Invalid Flow Companion project JSON");
  });
});
