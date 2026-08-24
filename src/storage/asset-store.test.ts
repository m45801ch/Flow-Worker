import { beforeEach, describe, expect, it, vi } from "vitest";

const database = { put: vi.fn(), get: vi.fn(), getAll: vi.fn(), delete: vi.fn() };
vi.mock("idb", () => ({ openDB: vi.fn(async () => database) }));

import { createAssetStore, type StoredAsset } from "./asset-store";

describe("AssetStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists a Blob with dimensions, MIME and hash metadata", async () => {
    const asset: StoredAsset = { id: "A01", kind: "last-frame", blob: new Blob(["frame"], { type: "image/png" }), mime: "image/png", width: 1280, height: 720, sha256: "abc123", sourceJobId: "job-1", createdAt: "2026-08-23T00:00:00.000Z" };
    const store = createAssetStore();
    await store.save(asset);
    expect(database.put).toHaveBeenCalledWith("assets", asset, "A01");
  });

  it("returns the saved asset by stable id", async () => {
    const asset: StoredAsset = { id: "A02", kind: "reference", blob: new Blob(["ref"], { type: "image/jpeg" }), mime: "image/jpeg", width: 640, height: 360, sha256: "def456", sourceJobId: "job-2", createdAt: "2026-08-23T00:00:00.000Z" };
    database.get.mockResolvedValue(asset);
    await expect(createAssetStore().get("A02")).resolves.toEqual(asset);
  });
});
