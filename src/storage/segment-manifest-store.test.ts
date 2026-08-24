import { beforeEach, describe, expect, it } from "vitest";
import { createSegmentManifest } from "../flow/jobs/segment-manifest";
import { createSegmentManifestStore } from "./segment-manifest-store";

const manifest = createSegmentManifest({
  projectId: "project-1",
  episodeId: "E01",
  sceneId: "S01",
  segmentId: "SEG-01",
  jobs: [{
    id: "job-1", projectId: "project-1", kind: "veo-segment", sourceDocumentVersion: 3, sourceEntityId: "CUT-01",
    prompt: "prompt", negativePrompt: "negative", assetBindings: [], inputAssetIds: [], outputMode: "video",
    modelName: "Veo 3.1 - Fast", aspectRatio: "16:9", durationSec: 4, segmentId: "SEG-01", cutId: "CUT-01", beatClaims: ["B01"],
    continuityScore: 97, dependencies: [], retryPolicy: { maxAttempts: 2, backoffMs: 1600 },
  }],
  now: "2026-08-24T00:00:00.000Z",
});

describe("Segment Manifest store", () => {
  beforeEach(async () => {
    if (typeof indexedDB !== "undefined") await indexedDB.deleteDatabase("flow-companion-segment-manifests");
  });

  it("persists and reads a complete Segment Manifest by id", async () => {
    const firstStore = createSegmentManifestStore();
    await firstStore.save(manifest);
    const secondStore = createSegmentManifestStore();
    await expect(secondStore.get("SEG-01")).resolves.toEqual(manifest);
  });

  it("updates a manifest status without losing its Cut order", async () => {
    const store = createSegmentManifestStore();
    await store.save(manifest);
    const updated = await store.updateStatus("SEG-01", "assembled", "2026-08-24T00:03:00.000Z");
    expect(updated).toMatchObject({ id: "SEG-01", status: "assembled", updatedAt: "2026-08-24T00:03:00.000Z" });
    expect(updated.cutOrder).toEqual(manifest.cutOrder);
  });

  it("lists manifests by project and updates status without losing cuts", async () => {
    const store = createSegmentManifestStore();
    await store.save(manifest);
    await store.save({ ...manifest, id: "SEG-02", projectId: "project-2" });
    const ready = { ...manifest, status: "ready-to-assemble" as const, updatedAt: "2026-08-24T00:02:00.000Z" };
    await store.save(ready);
    expect(await store.list("project-1")).toEqual([ready]);
    expect((await store.get("SEG-01"))?.cutOrder).toEqual(manifest.cutOrder);
  });
});
