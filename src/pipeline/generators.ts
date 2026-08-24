import type { ProjectDocument } from "../domain/project";
import { migrateProjectV1 } from "../domain/migration";
import type { ProjectDocumentV2 } from "../domain/project-v2";
import { createStageRunners } from "./stages";
import type { GenerationPort } from "./types";

export function createPipeline(port: GenerationPort, project: ProjectDocument | ProjectDocumentV2) {
  const canonical = project.schemaVersion === "2.0" ? project : migrateProjectV1(project);
  const runners = createStageRunners(port, canonical);
  return {
    outline: runners.outline,
    cast: runners.cast,
    characters: runners.cast,
    art: runners.art,
    script: runners.script,
    storyboard: runners.storyboard
  };
}
