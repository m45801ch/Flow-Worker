import { createAssetId } from "./asset-ids";
import type { ProjectContext } from "./types";

export type ProviderName = "gemini" | "openai" | "groq" | "openrouter";
export type StorySettings = { theme: string; genre: string; era: string; location: string; visualStyle: string; language: string; aspectRatio: string; episodeDurationSec: number; totalEpisodes: number; shotsPerEpisode: number; audience: string; pace: string; forbiddenElements: string; referenceStyle: string };
export type PromptSet = Record<string, string>;
export type Versioned<T> = { version: number; createdAt: string; source: "ai" | "human"; data: T };
export type ProjectDocument = {
  schemaVersion: "1.0"; project: { id: string; title: string; settings: StorySettings; provider: ProviderName; model: string; status: "draft" | "generated"; updatedAt: string };
  outline: Versioned<Record<string, unknown>> | null;
  artCompleted?: boolean;
  characters: Array<{ id: string; name: string; aliases: string[]; description: string; prompts: PromptSet; referenceAssetIds: string[] }>;
  locations: Array<{ id: string; name: string; description: string; anchors: string[]; prompts: PromptSet; referenceAssetIds: string[] }>;
  props: Array<{ id: string; name: string; purpose: string; prompts: PromptSet; referenceAssetIds: string[] }>;
  costumes: Array<{ id: string; name: string; description: string; prompts: PromptSet; referenceAssetIds: string[] }>;
  episodes: Array<{ id: string; title: string; scenes: Array<{ id: string; locationId: string; beats: Array<{ id: string; action: string; dialogue: string; durationSec: number }>; shots: string[] }> }>;
  spatialMaps: Record<string, unknown>[]; shotStates: Record<string, unknown>[]; continuityReports: Record<string, unknown>[]; promptVersions: Array<{ shotId: string; prompt: string; createdAt: string }>;
};

export const defaultSettings = (): StorySettings => ({ theme: "", genre: "", era: "", location: "", visualStyle: "", language: "繁體中文", aspectRatio: "16:9", episodeDurationSec: 60, totalEpisodes: 1, shotsPerEpisode: 8, audience: "", pace: "", forbiddenElements: "", referenceStyle: "" });
export function createProject(title = "未命名影片", settings = defaultSettings()): ProjectDocument {
  const now = new Date().toISOString();
  return { schemaVersion: "1.0", project: { id: crypto.randomUUID(), title, settings, provider: "gemini", model: "gemini-2.0-flash", status: "draft", updatedAt: now }, outline: null, artCompleted: false, characters: [], locations: [], props: [], costumes: [], episodes: [], spatialMaps: [], shotStates: [], continuityReports: [], promptVersions: [] };
}
export function toProjectContext(project: ProjectDocument): ProjectContext { return { projectId: project.project.id, language: project.project.settings.language, outputFormat: "json" }; }
export function exportProject(project: ProjectDocument): string { return JSON.stringify(project, null, 2); }
export function exportProjectBundle(project: ProjectDocument) { return { project: JSON.parse(exportProject(project)) as ProjectDocument, exportedAt: new Date().toISOString(), format: "flow-companion" as const }; }
export function importProject(raw: string): ProjectDocument {
  const parsed = JSON.parse(raw) as ProjectDocument;
  if (parsed.schemaVersion !== "1.0" || !parsed.project?.id || !parsed.project.settings) throw new Error("Invalid Flow Companion project JSON");
  return parsed;
}
export { createAssetId };
