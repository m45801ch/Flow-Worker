import { describe, expect, it } from "vitest";
import { createProjectV2 } from "../domain/project-v2";
import { importFullProjectArchive } from "./project-archive";

const job = {
  id: "job-1",
  projectId: "project-1",
  kind: "character-sheet",
  sourceEntityId: "character-1",
  status: "pending",
  modelName: "Nano Banana 2",
  aspectRatio: "16:9",
  attempts: 0,
  outputAssetIds: [],
  checkpoint: "pending",
  updatedAt: "2026-08-25T00:00:00.000Z",
} as any;

describe("full project archive", () => {
  it("imports an archive with project documents, Flow jobs and segment manifests together", async () => {
    const project = createProjectV2("封存測試");
    project.flow = { imageModel: "Nano Banana 2" };
    project.jobs = [{ id: "job-1", status: "pending", data: { prompt: "角色提示詞" } }];
    const imported = await importFullProjectArchive(JSON.stringify({
      format: "flow-companion-full-archive",
      archiveVersion: 1,
      exportedAt: "2026-08-25T00:00:00.000Z",
      project,
      jobs: [job],
      segmentManifests: [],
      assets: [],
    }));

    expect(imported.archive?.format).toBe("flow-companion-full-archive");
    expect(imported.project.project.title).toBe("封存測試");
    expect(imported.project.flow).toEqual({ imageModel: "Nano Banana 2" });
    expect(imported.archive?.jobs).toHaveLength(1);
    expect(imported.archive?.jobs[0].prompt).toBeUndefined();
    expect(imported.archive?.project.jobs).toEqual(project.jobs);
  });

  it("keeps the existing Project JSON import path compatible", async () => {
    const project = createProjectV2("既有格式");
    const imported = await importFullProjectArchive(JSON.stringify(project));
    expect(imported.archive).toBeUndefined();
    expect(imported.project.project.title).toBe("既有格式");
  });

});
