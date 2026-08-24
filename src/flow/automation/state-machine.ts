export type AutomationStatus = "pending" | "preflight" | "configuring" | "binding-assets" | "submitting" | "waiting" | "capturing" | "validating" | "completed" | "paused" | "retrying" | "failed" | "cancelled";

export type AutomationCheckpoint = {
  jobId: string;
  projectId: string;
  status: AutomationStatus;
  attempts: number;
  completedDependencies: string[];
  updatedAt: string;
  reason?: string;
  error?: string;
};

export type CheckpointStore = { get(jobId: string): Promise<AutomationCheckpoint | undefined>; save(value: AutomationCheckpoint): Promise<void> };

const checkpoint = (value: AutomationCheckpoint, patch: Partial<AutomationCheckpoint>): AutomationCheckpoint => ({ ...value, ...patch, updatedAt: new Date().toISOString() });

export class AutomationStateMachine {
  constructor(private readonly store: CheckpointStore) {}

  async resume(jobId: string): Promise<AutomationCheckpoint> {
    const current = await this.store.get(jobId);
    if (!current) throw new Error(`No checkpoint found for job ${jobId}`);
    if (current.status === "completed" || current.status === "cancelled") return current;
    const next = checkpoint(current, { status: "preflight", reason: undefined, error: undefined });
    await this.store.save(next);
    return next;
  }

  async transition(jobId: string, status: AutomationStatus, patch: Partial<AutomationCheckpoint> = {}): Promise<AutomationCheckpoint> {
    const current = await this.store.get(jobId);
    if (!current) throw new Error(`No checkpoint found for job ${jobId}`);
    const next = checkpoint(current, { ...patch, status });
    await this.store.save(next);
    return next;
  }

  async requireVideoQualityApproval(jobId: string): Promise<AutomationCheckpoint> {
    return this.transition(jobId, "paused", { reason: "quality-check-video" });
  }

  async approveVideoQuality(jobId: string): Promise<AutomationCheckpoint> {
    const current = await this.store.get(jobId);
    if (!current) throw new Error(`No checkpoint found for job ${jobId}`);
    if (current.status !== "paused" || current.reason !== "quality-check-video") throw new Error(`Job ${jobId} is not waiting for video quality approval`);
    return this.transition(jobId, "preflight", { reason: undefined });
  }
}
