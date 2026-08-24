import { beforeEach, describe, expect, it, vi } from "vitest";

const database = { put: vi.fn(), get: vi.fn(), getAll: vi.fn(), delete: vi.fn() };
vi.mock("idb", () => ({ openDB: vi.fn(async () => database) }));

import { createJobStore, type StoredJobRecord } from "./job-store";

const record: StoredJobRecord = { id: "job-1", projectId: "project-1", kind: "veo-segment", sourceEntityId: "E01-01-C01", status: "completed", modelName: "Veo 3.1 - Fast", aspectRatio: "16:9", durationSec: 8, attempts: 1, outputAssetIds: ["A01", "A02"], checkpoint: "validating", updatedAt: "2026-08-23T00:00:00.000Z" };

describe("JobStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves the job manifest snapshot and output metadata", async () => {
    await createJobStore().save(record);
    expect(database.put).toHaveBeenCalledWith("jobs", record, "job-1");
  });

  it("updates status without deleting completed output assets", async () => {
    database.get.mockResolvedValue(record);
    const updated = await createJobStore().updateStatus("job-1", "cancelled");
    expect(updated.outputAssetIds).toEqual(["A01", "A02"]);
    expect(database.put).toHaveBeenCalledWith("jobs", expect.objectContaining({ status: "cancelled", outputAssetIds: ["A01", "A02"] }), "job-1");
  });

  it("removes a single queued job by id", async () => {
    await createJobStore().remove("job-1");
    expect(database.delete).toHaveBeenCalledWith("jobs", "job-1");
  });

  it("lists jobs in deterministic updated order", async () => {
    database.getAll.mockResolvedValue([{ ...record, id: "job-2", updatedAt: "2026-08-24T00:00:00.000Z" }, record]);
    const jobs = await createJobStore().list("project-1");
    expect(jobs.map((job) => job.id)).toEqual(["job-2", "job-1"]);
  });
});
