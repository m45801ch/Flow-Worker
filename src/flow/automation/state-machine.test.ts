import { describe, expect, it } from "vitest";
import { AutomationStateMachine, type AutomationCheckpoint, type CheckpointStore } from "./state-machine";

const job = { id: "job-2", projectId: "project-1", kind: "veo-segment" as const, status: "waiting" as const, dependencies: ["job-1"], completedDependencies: ["job-1"] };

function memoryStore(initial: AutomationCheckpoint): CheckpointStore & { value: AutomationCheckpoint } {
  return {
    value: initial,
    async get() { return this.value; },
    async save(value) { this.value = value; }
  };
}

describe("AutomationStateMachine", () => {
  it("resumes a waiting job at preflight without resubmitting completed dependencies", async () => {
    const store = memoryStore({ jobId: job.id, projectId: job.projectId, status: "waiting", attempts: 1, completedDependencies: job.completedDependencies, updatedAt: new Date().toISOString() });
    const machine = new AutomationStateMachine(store);
    const resumed = await machine.resume(job.id);
    expect(resumed.status).toBe("preflight");
    expect(resumed.completedDependencies).toEqual(["job-1"]);
    expect(store.value.status).toBe("preflight");
  });

  it("pauses at the first video quality gate until approved", async () => {
    const store = memoryStore({ jobId: "job-3", projectId: "project-1", status: "completed", attempts: 1, completedDependencies: [], updatedAt: new Date().toISOString() });
    const machine = new AutomationStateMachine(store);
    await expect(machine.requireVideoQualityApproval("job-3")).resolves.toMatchObject({ status: "paused", reason: "quality-check-video" });
    await expect(machine.approveVideoQuality("job-3")).resolves.toMatchObject({ status: "preflight" });
  });
});
