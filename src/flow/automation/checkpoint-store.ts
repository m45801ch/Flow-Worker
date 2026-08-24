import { jobStore, type StoredJobRecord } from "../../storage/job-store";
import type { AutomationCheckpoint, CheckpointStore } from "./state-machine";

export function createCheckpointStore(store = jobStore): CheckpointStore {
  return {
    async get(jobId: string) {
      const record = await store.get(jobId);
      return record ? toCheckpoint(record) : undefined;
    },
    async save(checkpoint: AutomationCheckpoint) {
      const record = await store.get(checkpoint.jobId);
      if (!record) throw new Error(`Flow job not found: ${checkpoint.jobId}`);
      await store.updateStatus(checkpoint.jobId, checkpoint.status, { attempts: checkpoint.attempts, checkpoint: checkpoint.reason || checkpoint.status, error: checkpoint.error });
    }
  };
}

const toCheckpoint = (record: StoredJobRecord): AutomationCheckpoint => ({ jobId: record.id, projectId: record.projectId, status: record.status === "needs-user-selection" ? "paused" : record.status, attempts: record.attempts, completedDependencies: [], updatedAt: record.updatedAt, error: record.error });

export const checkpointStore = createCheckpointStore();
