import { describe, expect, it } from "vitest";
import { createAssetId, resolveAssetReference } from "./asset-ids";

describe("asset identifiers", () => {
  it("creates stable versioned ids from a kind and slug", () => {
    expect(createAssetId("character", "Detective 01")).toBe("character.detective_01.v1");
  });

  it("requires a human choice when natural language matches multiple assets", () => {
    const result = resolveAssetReference("偵探拿著鑰匙", [
      { id: "character.detective_01.v1", name: "偵探", aliases: ["侦探"] },
      { id: "prop.key_old.v1", name: "鑰匙", aliases: ["舊鑰匙"] },
      { id: "prop.key_new.v1", name: "鑰匙", aliases: ["新鑰匙"] }
    ]);

    expect(result.kind).toBe("ambiguous");
    expect(result.candidates).toEqual(["prop.key_old.v1", "prop.key_new.v1"]);
  });
});
