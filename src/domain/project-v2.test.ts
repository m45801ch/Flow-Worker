import { describe, expect, it } from "vitest";
import { artDocumentSchema } from "./contracts/art";
import { castDocumentSchema } from "./contracts/cast";
import { outlineDocumentSchema } from "./contracts/outline";
import { scriptDocumentSchema } from "./contracts/script";
import { storyboardDocumentSchema } from "./contracts/storyboard";
import { createProjectV2 } from "./project-v2";

describe("ProjectDocumentV2", () => {
  it("preserves five native documents without flattening", () => {
    const project = createProjectV2("Test");

    expect(project.schemaVersion).toBe("2.0");
    expect(Object.keys(project.documents)).toEqual(["outline", "cast", "art", "script", "storyboard"]);
    expect(project.documents.outline).toEqual({ currentVersion: null, stale: false, entries: [] });
  });

  it("provides a Zod schema for each native document", () => {
    const documents = [
      outlineDocumentSchema,
      castDocumentSchema,
      artDocumentSchema,
      scriptDocumentSchema,
      storyboardDocumentSchema
    ];

    for (const schema of documents) {
      expect(schema.safeParse({ source: "native", records: [] }).success).toBe(true);
      expect(schema.safeParse([]).success).toBe(false);
    }
  });
});
