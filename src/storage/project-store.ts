import { openDB, type DBSchema } from "idb";
import type { ProjectDocumentV2 } from "../domain/project-v2";

interface FlowDB extends DBSchema { projects: { key: string; value: ProjectDocumentV2; }; assets: { key: string; value: { id: string; blob: Blob; kind: "reference" | "last-frame"; name: string }; }; }
const db = () => openDB<FlowDB>("flow-companion", 1, { upgrade(database) { database.createObjectStore("projects"); database.createObjectStore("assets"); } });
export const projectStore = { async save(project: ProjectDocumentV2) { await (await db()).put("projects", project, project.project.id); }, async get(id: string) { return (await db()).get("projects", id); }, async list() { return (await db()).getAll("projects"); }, async saveAsset(asset: FlowDB["assets"]["value"]) { await (await db()).put("assets", asset, asset.id); } };
