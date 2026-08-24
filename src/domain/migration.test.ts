import { describe, expect, it } from "vitest";
import { migrateProjectV1, parseProject } from "./migration";
import type { ProjectDocument } from "./project";

const v1Fixture: ProjectDocument = {
  schemaVersion: "1.0",
  project: {
    id: "project-1",
    title: "Legacy project",
    settings: {
      theme: "Mystery",
      genre: "",
      era: "",
      location: "",
      visualStyle: "",
      language: "繁體中文",
      aspectRatio: "16:9",
      episodeDurationSec: 60,
      totalEpisodes: 1,
      shotsPerEpisode: 8,
      audience: "",
      pace: "",
      forbiddenElements: "",
      referenceStyle: ""
    },
    provider: "gemini",
    model: "gemini-2.0-flash",
    status: "draft",
    updatedAt: "2026-08-23T00:00:00.000Z"
  },
  outline: { version: 1, createdAt: "2026-08-23T00:00:00.000Z", source: "human", data: { title: "Legacy outline" } },
  characters: [{ id: "char-1", name: "Detective", aliases: [], description: "", prompts: {}, referenceAssetIds: [] }],
  locations: [],
  props: [],
  costumes: [],
  episodes: [],
  spatialMaps: [],
  shotStates: [],
  continuityReports: [],
  promptVersions: []
};

describe("project migration", () => {
  it("backs up and migrates v1 stable ids", () => {
    const migrated = migrateProjectV1(v1Fixture);

    expect(migrated.migration?.sourceSchemaVersion).toBe("1.0");
    expect(migrated.migration?.sourceBackup).toEqual(v1Fixture);
    expect(migrated.assets.entities.some((entity) => entity.id === "char-1")).toBe(true);
  });

  it("marks legacy storyboard cuts for state review instead of treating them as continuity-safe", () => {
    const legacy = { ...v1Fixture, shotStates: [{ shotId: "legacy-shot-1", sceneId: "scene-1", action: "Zhao Wang stands" }] };
    const migrated = migrateProjectV1(legacy);
    const cuts = migrated.documents.storyboard.entries[0]?.data.episodes[0]?.segments[0]?.cuts;
    expect(cuts?.[0]).toMatchObject({ continuityStatus: "needs-state-review" });
    expect(cuts?.[0]).not.toHaveProperty("previousState");
    expect(cuts?.[0]).not.toHaveProperty("currentState");
  });

  it("parses V2 projects and migrates validated V1 JSON without mutating the input", () => {
    const raw = JSON.stringify(v1Fixture);
    const migrated = parseProject(raw);

    expect(migrated.schemaVersion).toBe("2.0");
    expect(JSON.parse(raw)).toEqual(v1Fixture);
    expect(() => parseProject(JSON.stringify({ schemaVersion: "3.0" }))).toThrow("Unsupported Flow Companion project schema");
  });
});
