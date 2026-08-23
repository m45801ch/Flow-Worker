import { describe, expect, it, vi } from "vitest";
import { createProject } from "../domain/project";
import { createProjectV2 } from "../domain/project-v2";
import { exportSidePanelProject, importSidePanelProject, persistSidePanelProject, toLegacyProjectForUi } from "./project-io";

describe("side-panel project I/O", () => {
  it("exports V2 JSON and routes V1 imports through migration", () => {
    const legacy = createProject("Legacy");
    const exported = exportSidePanelProject(legacy);
    const imported = importSidePanelProject(JSON.stringify(legacy));

    expect(JSON.parse(exported).schemaVersion).toBe("2.0");
    expect(imported.schemaVersion).toBe("2.0");
    expect(imported.migration?.sourceBackup).toEqual(legacy);
  });

  it("catches and reports unavailable persistence without leaking a rejection", async () => {
    const failure = new Error("IndexedDB unavailable");
    const report = vi.fn();

    await expect(persistSidePanelProject(createProject(), async () => { throw failure; }, report)).resolves.toBe(false);
    expect(report).toHaveBeenCalledWith(failure);
  });

  it("preserves a native V2 document through UI projection, immediate persistence, and export", async () => {
    const native = createProjectV2("Native");
    native.documents.outline = {
      currentVersion: 1,
      stale: false,
      entries: [{ version: 1, createdAt: "2026-08-24T00:00:00.000Z", source: "human", data: { adaptation: { source: "native" }, characters: [], scenes: [], props: [], beats: [], episodes: [], params: {} } }]
    };
    native.assets.entities.push({ id: "C01", kind: "character", name: "Mara", referenceAssetIds: [], data: {} });
    native.flow = { selectedImageModel: "Nano Banana" };
    native.jobs = [{ id: "job-1", status: "pending" }];

    const imported = importSidePanelProject(JSON.stringify(native));
    const projected = toLegacyProjectForUi(imported);
    let persisted: typeof native | undefined;
    const save = async (document: typeof native) => {
      persisted = document;
    };

    await persistSidePanelProject(projected, save, vi.fn(), imported);
    const exported = JSON.parse(exportSidePanelProject(projected, imported));
    if (!persisted) throw new Error("Expected persistence to be called");

    expect(exported.documents.outline).toEqual(native.documents.outline);
    expect(exported.assets).toEqual(native.assets);
    expect(exported.flow).toEqual(native.flow);
    expect(exported.jobs).toEqual(native.jobs);
    expect(persisted.documents.outline).toEqual(native.documents.outline);
    expect(persisted.assets).toEqual(native.assets);
    expect(persisted.flow).toEqual(native.flow);
    expect(persisted.jobs).toEqual(native.jobs);
  });
});
