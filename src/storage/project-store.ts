import { openDB, type DBSchema } from "idb";
import { parseProject } from "../domain/migration";
import type { ProjectDocumentV2 } from "../domain/project-v2";

interface FlowDB extends DBSchema { projects: { key: string; value: unknown; }; assets: { key: string; value: { id: string; blob: Blob; kind: "reference" | "last-frame"; name: string }; }; }
const db = () => openDB<FlowDB>("flow-companion", 1, { upgrade(database) { database.createObjectStore("projects"); database.createObjectStore("assets"); } });

async function normalizeStoredProject(value: unknown, database: Awaited<ReturnType<typeof db>>): Promise<ProjectDocumentV2> {
  const project = parseProject(JSON.stringify(value));
  if ((value as { schemaVersion?: unknown }).schemaVersion === "1.0") await database.put("projects", project, project.project.id);
  return project;
}

export const projectStore = {
  async save(project: ProjectDocumentV2) { await (await db()).put("projects", project, project.project.id); },
  async get(id: string) { const database = await db(); const value = await database.get("projects", id); return value === undefined ? undefined : normalizeStoredProject(value, database); },
  async list() { const database = await db(); return Promise.all((await database.getAll("projects")).map((project) => normalizeStoredProject(project, database))); },
  async saveAsset(asset: FlowDB["assets"]["value"]) { await (await db()).put("assets", asset, asset.id); }
};