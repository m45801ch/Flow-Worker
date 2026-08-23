import { migrateProjectV1, projectDocumentV1Schema } from "../domain/migration";
import { createProject, exportProject, importProject, type ProjectDocument } from "../domain/project";
import type { ProjectDocumentV2 } from "../domain/project-v2";

export function toProjectV2ForStorage(project: ProjectDocument, canonicalProject?: ProjectDocumentV2): ProjectDocumentV2 {
  if (!canonicalProject) return migrateProjectV1(project);
  const merged = structuredClone(canonicalProject);
  merged.project = structuredClone(project.project);
  return merged;
}

export function exportSidePanelProject(project: ProjectDocument, canonicalProject?: ProjectDocumentV2): string {
  return exportProject(toProjectV2ForStorage(project, canonicalProject));
}

export function importSidePanelProject(raw: string): ProjectDocumentV2 {
  return importProject(raw);
}

export function toLegacyProjectForUi(project: ProjectDocumentV2): ProjectDocument {
  const backup = projectDocumentV1Schema.safeParse(project.migration?.sourceBackup);
  if (backup.success) return structuredClone(backup.data) as ProjectDocument;
  const legacy = createProject(project.project.title, structuredClone(project.project.settings));
  return { ...legacy, project: structuredClone(project.project) };
}

export async function persistSidePanelProject(project: ProjectDocument, save: (document: ProjectDocumentV2) => Promise<void>, report: (error: unknown) => void, canonicalProject?: ProjectDocumentV2): Promise<boolean> {
  try {
    await save(toProjectV2ForStorage(project, canonicalProject));
    return true;
  } catch (error) {
    report(error);
    return false;
  }
}