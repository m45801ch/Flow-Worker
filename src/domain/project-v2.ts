import { z } from "zod";
import { artDocumentSchema, type ArtDocument } from "./contracts/art";
import { castDocumentSchema, type CastDocument } from "./contracts/cast";
import { outlineDocumentSchema, type OutlineDocument } from "./contracts/outline";
import { scriptDocumentSchema, type ScriptDocument } from "./contracts/script";
import { storyboardDocumentSchema, type StoryboardDocument } from "./contracts/storyboard";
import { defaultSettings, type ProviderName, type StorySettings } from "./project";

export type VersionEntry<T> = { version: number; createdAt: string; source: "ai" | "human" | "migration"; data: T };
export type VersionHistory<T> = { currentVersion: number | null; stale: boolean; entries: VersionEntry<T>[] };
export type ProjectDocuments = { outline: VersionHistory<OutlineDocument>; cast: VersionHistory<CastDocument>; art: VersionHistory<ArtDocument>; script: VersionHistory<ScriptDocument>; storyboard: VersionHistory<StoryboardDocument> };
export type ProjectMetadata = { id: string; title: string; settings: StorySettings; provider: ProviderName; model: string; status: "draft" | "generated"; updatedAt: string };
export type AssetRepositoryEntity = { id: string; kind: "character" | "location" | "prop" | "costume"; name: string; referenceAssetIds: string[]; data: Record<string, unknown> };
export type AssetRepositoryIndex = { entities: AssetRepositoryEntity[] };
export type FlowWorkspaceState = Record<string, unknown>;
export type FlowJobRecord = { id: string; status: string; data?: Record<string, unknown> };
export interface ProjectDocumentV2 { schemaVersion: "2.0"; project: ProjectMetadata; documents: ProjectDocuments; assets: AssetRepositoryIndex; flow: FlowWorkspaceState; jobs: FlowJobRecord[]; migration?: { sourceSchemaVersion: "1.0"; sourceBackup: unknown } }

const storySettingsSchema = z.object({ theme: z.string(), genre: z.string(), era: z.string(), location: z.string(), visualStyle: z.string(), language: z.string(), aspectRatio: z.string(), episodeDurationSec: z.number(), totalEpisodes: z.number(), shotsPerEpisode: z.number(), audience: z.string(), pace: z.string(), forbiddenElements: z.string(), referenceStyle: z.string() });
const versionHistorySchema = <T extends z.ZodType>(documentSchema: T) => z.object({ currentVersion: z.number().int().nonnegative().nullable(), stale: z.boolean(), entries: z.array(z.object({ version: z.number().int().positive(), createdAt: z.string(), source: z.enum(["ai", "human", "migration"]), data: documentSchema })) });

export const projectDocumentV2Schema = z.object({
  schemaVersion: z.literal("2.0"),
  project: z.object({ id: z.string().min(1), title: z.string(), settings: storySettingsSchema, provider: z.enum(["gemini", "openai", "groq", "openrouter"]), model: z.string(), status: z.enum(["draft", "generated"]), updatedAt: z.string() }),
  documents: z.object({ outline: versionHistorySchema(outlineDocumentSchema), cast: versionHistorySchema(castDocumentSchema), art: versionHistorySchema(artDocumentSchema), script: versionHistorySchema(scriptDocumentSchema), storyboard: versionHistorySchema(storyboardDocumentSchema) }),
  assets: z.object({ entities: z.array(z.object({ id: z.string().min(1), kind: z.enum(["character", "location", "prop", "costume"]), name: z.string(), referenceAssetIds: z.array(z.string()), data: z.record(z.string(), z.unknown()) })) }),
  flow: z.record(z.string(), z.unknown()),
  jobs: z.array(z.object({ id: z.string().min(1), status: z.string(), data: z.record(z.string(), z.unknown()).optional() })),
  migration: z.object({ sourceSchemaVersion: z.literal("1.0"), sourceBackup: z.unknown() }).optional()
});

export const emptyVersionHistory = <T>(): VersionHistory<T> => ({ currentVersion: null, stale: false, entries: [] });

export function createProjectV2(title = "未命名影片", settings = defaultSettings()): ProjectDocumentV2 {
  const now = new Date().toISOString();
  return { schemaVersion: "2.0", project: { id: crypto.randomUUID(), title, settings, provider: "gemini", model: "gemini-2.0-flash", status: "draft", updatedAt: now }, documents: { outline: emptyVersionHistory(), cast: emptyVersionHistory(), art: emptyVersionHistory(), script: emptyVersionHistory(), storyboard: emptyVersionHistory() }, assets: { entities: [] }, flow: {}, jobs: [] };
}