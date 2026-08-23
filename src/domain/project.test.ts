import { describe, expect, it } from "vitest";
import { createProject, exportProjectBundle } from "./project";

describe("project export", () => {
  it("exports project data without provider secrets", () => {
    const project = createProject("Test film");
    const payload = exportProjectBundle(project);
    expect(payload.project.project.title).toBe("Test film");
    expect(JSON.stringify(payload)).not.toContain("apiKey");
  });
});
