import { openDB, type DBSchema } from "idb";
import type { FlowJobKind, FlowJobStatus } from "../flow/jobs/types";
import type { FlowAspectRatio, FlowDuration, FlowJobManifest, FlowOutputCount, FlowPromptMetadata } from "../flow/jobs/types";

export type StoredJobRecord = {
  id: string;
  projectId: string;
  kind: FlowJobKind;
  sourceEntityId: string;
  status: FlowJobStatus;
  modelName: string;
  aspectRatio: FlowAspectRatio;
  outputCount?: FlowOutputCount;
  durationSec?: FlowDuration;
  prompt?: string;
  negativePrompt?: string;
  promptMetadata?: FlowPromptMetadata;
  assetBindings?: string[];
  inputAssetIds?: string[];
  manifest?: FlowJobManifest;
  videoAssetId?: string;
  localFileName?: string;
  segmentId?: string;
  cutId?: string;
  attempts: number;
  outputAssetIds: string[];
  checkpoint: string;
  updatedAt: string;
  error?: string;
};

interface JobDB extends DBSchema { jobs: { key: string; value: StoredJobRecord } }
const database = () => openDB<JobDB>("flow-companion-jobs", 1, { upgrade(db) { if (!db.objectStoreNames.contains("jobs")) db.createObjectStore("jobs"); } });

export function createJobStore() {
  return {
    async save(job: StoredJobRecord) { await (await database()).put("jobs", job, job.id); },
    async get(id: string) { return (await database()).get("jobs", id); },
    async list(projectId?: string) {
      const records = await (await database()).getAll("jobs");
      return records.filter((record) => !projectId || record.projectId === projectId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    async updateStatus(id: string, status: FlowJobStatus, patch: Partial<StoredJobRecord> = {}) {
      const existing = await (await database()).get("jobs", id);
      if (!existing) throw new Error(`Flow job not found: ${id}`);
      const updated: StoredJobRecord = { ...existing, ...patch, status, updatedAt: new Date().toISOString(), outputAssetIds: existing.outputAssetIds };
      await (await database()).put("jobs", updated, id);
      return updated;
    }
  };
}

export const jobStore = createJobStore();
