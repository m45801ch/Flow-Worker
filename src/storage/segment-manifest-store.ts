import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { segmentManifestSchema, type SegmentManifest } from "../domain/contracts/storyboard-continuity";

interface SegmentManifestDB extends DBSchema {
  manifests: { key: string; value: SegmentManifest };
}

const DATABASE_NAME = "flow-companion-segment-manifests";
const DATABASE_VERSION = 1;
const fallbackRecords = new Map<string, SegmentManifest>();
let databasePromise: Promise<IDBPDatabase<SegmentManifestDB>> | undefined;

const hasIndexedDb = () => typeof globalThis.indexedDB !== "undefined";
const database = () => databasePromise ||= openDB<SegmentManifestDB>(DATABASE_NAME, DATABASE_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains("manifests")) db.createObjectStore("manifests");
  },
});
const validated = (manifest: SegmentManifest) => segmentManifestSchema.parse(manifest);

export function createSegmentManifestStore() {
  return {
    async save(manifest: SegmentManifest) {
      const value = validated(manifest);
      if (!hasIndexedDb()) {
        fallbackRecords.set(value.id, value);
        return value;
      }
      await (await database()).put("manifests", value, value.id);
      return value;
    },
    async get(id: string) {
      if (!hasIndexedDb()) return fallbackRecords.get(id);
      return (await (await database()).get("manifests", id)) || undefined;
    },
    async list(projectId?: string) {
      const records = hasIndexedDb() ? await (await database()).getAll("manifests") : [...fallbackRecords.values()];
      return records.filter((manifest) => !projectId || manifest.projectId === projectId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    async updateStatus(id: string, status: SegmentManifest["status"], updatedAt = new Date().toISOString()) {
      const existing = await this.get(id);
      if (!existing) throw new Error(`Segment Manifest not found: ${id}`);
      return this.save(segmentManifestSchema.parse({ ...existing, status, updatedAt }));
    },
    async delete(id: string) {
      if (!hasIndexedDb()) {
        fallbackRecords.delete(id);
        return;
      }
      await (await database()).delete("manifests", id);
    },
  };
}

export const segmentManifestStore = createSegmentManifestStore();
