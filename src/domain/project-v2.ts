import type { ArtDocument } from "./contracts/art";
import type { CastDocument } from "./contracts/cast";
import type { OutlineDocument } from "./contracts/outline";
import type { ScriptDocument } from "./contracts/script";
import type { StoryboardDocument } from "./contracts/storyboard";
import { defaultSettings, type ProviderName, type StorySettings } from "./project";

export type VersionEntry<T> = { version: number; createdAt: string; source: "ai" | "human" | "migration"; data: T };
export type VersionHistory<T> = { currentVersion: number | null; stale: boolean; entries: VersionEntry<T>[] };
export type ProjectDocuments = {
  outline: VersionHistory<OutlineDocument>;
  cast: VersionHistory<CastDocument>;
  art: VersionHistory<ArtDocument>;
  script: VersionHistory<ScriptDocument>;
  storyboard: VersionHistory<StoryboardDocument>;
};
export type ProjectMetadata = { id: string; title: string; settings: StorySettings; provider: ProviderName; model: string; status: "draft" | "generated"; updatedAt: string };
export type AssetRepositoryEntity = { id: string; kind: "character" | "location" | "prop" | "costume"; name: string; referenceAssetIds: string[]; data: Record<string, unknown> };
export type AssetRepositoryIndex = { entities: AssetRepositoryEntity[] };
export type FlowWorkspaceState = Record<string, never>;
export type FlowJobRecord = { id: string; status: string; data?: Record<string, unknown> };
export interface ProjectDocumentV2 {
  schemaVersion: "2.0";
  project: ProjectMetadata;
  documents: ProjectDocuments;
  assets: AssetRepositoryIndex;
  flow: FlowWorkspaceState;
  jobs: FlowJobRecord[];
  migration?: { sourceSchemaVersion: "1.0"; sourceBackup: unknown };
}

export const emptyVersionHistory = <T>(): VersionHistory<T> => ({ currentVersion: null, stale: false, entries: [] });

export function createProjectV2(title = "未命名影片", settings = defaultSettings()): ProjectDocumentV2 {
  const now = new Date().toISOString();
  return {
    schemaVersion: "2.0",
    project: { id: crypto.randomUUID(), title, settings, provider: "gemini", model: "gemini-2.0-flash", status: "draft", updatedAt: now },
    documents: { outline: emptyVersionHistory(), cast: emptyVersionHistory(), art: emptyVersionHistory(), script: emptyVersionHistory(), storyboard: emptyVersionHistory() },
    assets: { entities: [] },
    flow: {},
    jobs: []
  };
}
