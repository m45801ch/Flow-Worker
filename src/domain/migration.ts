import { z } from "zod";
import type { ProjectDocument } from "./project";
import { emptyVersionHistory, projectDocumentV2Schema, type AssetRepositoryEntity, type ProjectDocumentV2, type VersionHistory } from "./project-v2";

const settingsSchema = z.object({ theme: z.string(), genre: z.string(), era: z.string(), location: z.string(), visualStyle: z.string(), language: z.string(), aspectRatio: z.string(), episodeDurationSec: z.number(), totalEpisodes: z.number(), shotsPerEpisode: z.number(), audience: z.string(), pace: z.string(), forbiddenElements: z.string(), referenceStyle: z.string() });
const promptsSchema = z.record(z.string(), z.string());
const assetSchema = z.object({ id: z.string().min(1), name: z.string(), aliases: z.array(z.string()).optional(), description: z.string().optional(), purpose: z.string().optional(), anchors: z.array(z.string()).optional(), prompts: promptsSchema, referenceAssetIds: z.array(z.string()) });
export const projectDocumentV1Schema = z.object({
  schemaVersion: z.literal("1.0"),
  project: z.object({ id: z.string().min(1), title: z.string(), settings: settingsSchema, provider: z.enum(["gemini", "openai", "groq", "openrouter"]), model: z.string(), status: z.enum(["draft", "generated"]), updatedAt: z.string() }),
  outline: z.object({ version: z.number().int().positive(), createdAt: z.string(), source: z.enum(["ai", "human"]), data: z.record(z.string(), z.unknown()) }).nullable(),
  artCompleted: z.boolean().optional(),
  characters: z.array(assetSchema), locations: z.array(assetSchema), props: z.array(assetSchema), costumes: z.array(assetSchema),
  episodes: z.array(z.object({ id: z.string().min(1), title: z.string(), scenes: z.array(z.object({ id: z.string().min(1), locationId: z.string(), beats: z.array(z.object({ id: z.string().min(1), action: z.string(), dialogue: z.string(), durationSec: z.number() })), shots: z.array(z.string()) })) })),
  spatialMaps: z.array(z.record(z.string(), z.unknown())), shotStates: z.array(z.record(z.string(), z.unknown())), continuityReports: z.array(z.record(z.string(), z.unknown())), promptVersions: z.array(z.object({ shotId: z.string(), prompt: z.string(), createdAt: z.string() }))
});

const hasRecords = (value: unknown[]) => value.length > 0;
const migratedHistory = <T>(data: T, createdAt: string): VersionHistory<T> => ({ currentVersion: 1, stale: false, entries: [{ version: 1, createdAt, source: "migration", data: structuredClone(data) }] });
const assetEntities = (kind: AssetRepositoryEntity["kind"], items: Array<{ id: string; name: string; referenceAssetIds: string[]; [key: string]: unknown }>) => items.map((item) => ({ id: item.id, kind, name: item.name, referenceAssetIds: [...item.referenceAssetIds], data: structuredClone(item) }));
const duration = (value: number) => Math.max(1, value || 1);

export function migrateProjectV1(input: ProjectDocument): ProjectDocumentV2 {
  const source = structuredClone(projectDocumentV1Schema.parse(input)) as ProjectDocument;
  const createdAt = source.project.updatedAt;
  const storyboardCuts = source.shotStates.map((shot, index) => ({ id: String(shot.shotId ?? `migration-cut-${index + 1}`), beats: [], durationSec: 4 as const, continuityStatus: "needs-state-review" as const, legacyShotState: structuredClone(shot) }));
  return {
    schemaVersion: "2.0",
    project: structuredClone(source.project),
    documents: {
      outline: source.outline ? migratedHistory({ adaptation: source.outline.data, characters: [], scenes: [], props: [], beats: [], episodes: [], params: {} }, source.outline.createdAt) : emptyVersionHistory(),
      cast: hasRecords(source.characters) ? migratedHistory({ characters: source.characters.map((character) => ({ id: character.id, name: character.name, persona: character.description ?? "", relationships: [], evidence: [], image: { prompt: character.prompts.visual ?? "", sheetPrompt: character.prompts.sheet ?? "", negativePrompt: character.prompts.negative ?? "" }, voice: { prompt: character.prompts.voice ?? "" }, legacy: structuredClone(character) })) }, createdAt) : emptyVersionHistory(),
      art: source.artCompleted || hasRecords(source.locations) || hasRecords(source.props) || hasRecords(source.costumes) ? migratedHistory({ scenes: source.locations.map((location) => ({ id: location.id, name: location.name, anchors: location.anchors ?? [], lightingStates: [], variants: [], imagePrompt: location.prompts.visual ?? "", legacy: structuredClone(location) })), props: source.props.map((prop) => ({ id: prop.id, name: prop.name, scale: "", states: [], imagePrompt: prop.prompts.visual ?? "", legacy: structuredClone(prop) })), costumes: source.costumes.map((costume) => ({ id: costume.id, name: costume.name, legacy: structuredClone(costume) })) }, createdAt) : emptyVersionHistory(),
      script: hasRecords(source.episodes)
        ? migratedHistory({
            source: "migration",
            episodes: source.episodes.map((episode) => ({
              id: episode.id,
              title: episode.title,
              scenes: episode.scenes.map((scene) => ({
                id: scene.id,
                flow: scene.beats.flatMap((beat) => [
                  { kind: "action" as const, action: beat.action, durationSec: duration(beat.durationSec) },
                  ...(beat.dialogue ? [{ kind: "dialogue" as const, speaker: "", line: beat.dialogue, delivery: "", durationSec: duration(beat.durationSec) }] : [])
                ])
              }))
            }))
          }, createdAt)
        : emptyVersionHistory(),      storyboard: hasRecords(source.shotStates) || hasRecords(source.spatialMaps) || hasRecords(source.continuityReports) || hasRecords(source.promptVersions) ? migratedHistory({ source: "migration", episodes: [{ id: "migration", segments: [{ id: "migration-1", sceneId: "", h3Prompt: source.promptVersions.map((entry) => entry.prompt).join("\n"), veoPrompt: "", cuts: storyboardCuts }] }] }, createdAt) : emptyVersionHistory()
    },
    assets: { entities: [...assetEntities("character", source.characters), ...assetEntities("location", source.locations), ...assetEntities("prop", source.props), ...assetEntities("costume", source.costumes)] },
    flow: {}, jobs: [], migration: { sourceSchemaVersion: "1.0", sourceBackup: structuredClone(source) }
  };
}

export function parseProject(raw: string): ProjectDocumentV2 {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Invalid Flow Companion project JSON"); }
  const schemaVersion = parsed && typeof parsed === "object" ? (parsed as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (schemaVersion === "2.0") {
    const result = projectDocumentV2Schema.safeParse(parsed);
    if (result.success) return result.data as ProjectDocumentV2;
    throw new Error("Invalid Flow Companion project JSON");
  }
  if (schemaVersion === "1.0") {
    const result = projectDocumentV1Schema.safeParse(parsed);
    if (result.success) return migrateProjectV1(result.data as ProjectDocument);
    throw new Error("Invalid Flow Companion project JSON");
  }
  if (schemaVersion !== undefined) throw new Error("Unsupported Flow Companion project schema");
  throw new Error("Invalid Flow Companion project JSON");
}