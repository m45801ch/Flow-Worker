import { describe, expect, it, vi } from "vitest";
import { createProject } from "../domain/project";
import { exportSidePanelProject, importSidePanelProject, persistSidePanelProject } from "./project-io";

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
});
