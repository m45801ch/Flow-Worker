import { describe, expect, it } from "vitest";
import { parseProject } from "./migration";
import { createProjectV2 } from "./project-v2";

const legacyProject = {
  schemaVersion: "1.0",
  project: { id: "legacy", title: "Legacy", settings: { theme: "", genre: "", era: "", location: "", visualStyle: "", language: "繁體中文", aspectRatio: "16:9", episodeDurationSec: 60, totalEpisodes: 1, shotsPerEpisode: 8, audience: "", pace: "", forbiddenElements: "", referenceStyle: "" }, provider: "gemini", model: "gemini-2.0-flash", status: "draft", updatedAt: "2026-08-23T00:00:00.000Z" },
  outline: null, artCompleted: false, characters: [{ id: "char-1", name: "Detective", aliases: [], description: "", prompts: {}, referenceAssetIds: [] }], locations: [], props: [], costumes: [], episodes: [], spatialMaps: [], shotStates: [], continuityReports: [], promptVersions: []
};

describe("parseProject validation", () => {
  it("round-trips a fully formed V2 document", () => {
    const project = createProjectV2("V2");

    expect(parseProject(JSON.stringify(project))).toEqual(project);
  });

  it("rejects malformed V1 metadata and malformed V2 histories", () => {
    expect(() => parseProject(JSON.stringify({ ...legacyProject, project: { ...legacyProject.project, settings: true } }))).toThrow("Invalid Flow Companion project JSON");
    expect(() => parseProject(JSON.stringify({ schemaVersion: "2.0", project: { id: "broken" }, documents: { outline: null, cast: 1, art: false, script: "bad", storyboard: [] } }))).toThrow("Invalid Flow Companion project JSON");
  });

  it("does not share migrated document data with the V1 input", () => {
    const source = structuredClone(legacyProject);
    const migrated = parseProject(JSON.stringify(source));
    source.characters[0].name = "Changed after migration";

    expect((migrated.documents.cast.entries[0].data as { characters: Array<{ name: string }> }).characters[0].name).toBe("Detective");
  });
});
