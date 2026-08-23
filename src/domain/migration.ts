import type { ProjectDocument } from "./project";
import { emptyVersionHistory, type AssetRepositoryEntity, type ProjectDocumentV2, type VersionHistory } from "./project-v2";

const hasRecords = (value: unknown[]) => value.length > 0;
const migratedHistory = <T>(data: T, createdAt: string): VersionHistory<T> => ({ currentVersion: 1, stale: false, entries: [{ version: 1, createdAt, source: "migration", data }] });
const assetEntities = (kind: AssetRepositoryEntity["kind"], items: Array<{ id: string; name: string; referenceAssetIds: string[]; [key: string]: unknown }>) => items.map((item) => ({ id: item.id, kind, name: item.name, referenceAssetIds: item.referenceAssetIds, data: { ...item } }));

export function migrateProjectV1(input: ProjectDocument): ProjectDocumentV2 {
  const createdAt = input.project.updatedAt;
  return {
    schemaVersion: "2.0",
    project: { ...input.project, settings: { ...input.project.settings } },
    documents: {
      outline: input.outline ? migratedHistory(input.outline.data, input.outline.createdAt) : emptyVersionHistory(),
      cast: hasRecords(input.characters) ? migratedHistory({ characters: input.characters }, createdAt) : emptyVersionHistory(),
      art: input.artCompleted || hasRecords(input.locations) || hasRecords(input.props) || hasRecords(input.costumes) ? migratedHistory({ locations: input.locations, props: input.props, costumes: input.costumes, artCompleted: Boolean(input.artCompleted) }, createdAt) : emptyVersionHistory(),
      script: hasRecords(input.episodes) ? migratedHistory({ episodes: input.episodes }, createdAt) : emptyVersionHistory(),
      storyboard: hasRecords(input.spatialMaps) || hasRecords(input.shotStates) || hasRecords(input.continuityReports) || hasRecords(input.promptVersions) ? migratedHistory({ spatialMaps: input.spatialMaps, shotStates: input.shotStates, continuityReports: input.continuityReports, promptVersions: input.promptVersions }, createdAt) : emptyVersionHistory()
    },
    assets: { entities: [...assetEntities("character", input.characters), ...assetEntities("location", input.locations), ...assetEntities("prop", input.props), ...assetEntities("costume", input.costumes)] },
    flow: {},
    jobs: [],
    migration: { sourceSchemaVersion: "1.0", sourceBackup: structuredClone(input) }
  };
}

const isV1Project = (value: unknown): value is ProjectDocument => {
  if (!value || typeof value !== "object") return false;
  const project = (value as { project?: unknown }).project;
  return (value as { schemaVersion?: unknown }).schemaVersion === "1.0" && Boolean(project && typeof project === "object" && (project as { id?: unknown }).id && (project as { settings?: unknown }).settings) && ["characters", "locations", "props", "costumes", "episodes", "spatialMaps", "shotStates", "continuityReports", "promptVersions"].every((key) => Array.isArray((value as Record<string, unknown>)[key]));
};
const isV2Project = (value: unknown): value is ProjectDocumentV2 => {
  if (!value || typeof value !== "object") return false;
  const project = (value as { project?: unknown }).project;
  const documents = (value as { documents?: unknown }).documents;
  return (value as { schemaVersion?: unknown }).schemaVersion === "2.0" && Boolean(project && typeof project === "object" && (project as { id?: unknown }).id) && Boolean(documents && typeof documents === "object" && ["outline", "cast", "art", "script", "storyboard"].every((key) => key in documents));
};

export function parseProject(raw: string): ProjectDocumentV2 {
  const parsed: unknown = JSON.parse(raw);
  if (isV2Project(parsed)) return parsed;
  if (isV1Project(parsed)) return migrateProjectV1(parsed);
  if (parsed && typeof parsed === "object" && "schemaVersion" in parsed) throw new Error("Unsupported Flow Companion project schema");
  throw new Error("Invalid Flow Companion project JSON");
}
