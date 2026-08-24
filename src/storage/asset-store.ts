import { openDB, type DBSchema } from "idb";

export type AssetKind = "reference" | "last-frame" | "generated-image" | "generated-video" | "thumbnail";
export type StoredAsset = { id: string; kind: AssetKind; blob: Blob; mime: string; width: number; height: number; sha256: string; sourceJobId?: string; createdAt: string; durationSec?: number };

interface AssetDB extends DBSchema {
  assets: { key: string; value: StoredAsset };
}

const database = () => openDB<AssetDB>("flow-companion-assets", 1, { upgrade(db) { if (!db.objectStoreNames.contains("assets")) db.createObjectStore("assets"); } });

export function createAssetStore() {
  return {
    async save(asset: StoredAsset) { await (await database()).put("assets", asset, asset.id); },
    async get(id: string) { return (await database()).get("assets", id); },
    async list() { return (await database()).getAll("assets"); },
    async remove(id: string) { await (await database()).delete("assets", id); }
  };
}

export const assetStore = createAssetStore();
