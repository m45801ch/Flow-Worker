import { projectDocumentV2Schema, type ProjectDocumentV2 } from "../domain/project-v2";
import { segmentManifestSchema, type SegmentManifest } from "../domain/contracts/storyboard-continuity";
import { toProjectV2ForStorage, importSidePanelProject } from "./project-io";
import { assetStore, type StoredAsset } from "../storage/asset-store";
import { jobStore, type StoredJobRecord } from "../storage/job-store";
import { segmentManifestStore } from "../storage/segment-manifest-store";
import type { ProjectDocument } from "../domain/project";

export type SerializedProjectAsset = Omit<StoredAsset, "blob"> & { dataUrl: string };
export type ProjectArchive = {
  format: "flow-companion-full-archive";
  archiveVersion: 1;
  exportedAt: string;
  project: ProjectDocumentV2;
  jobs: StoredJobRecord[];
  segmentManifests: SegmentManifest[];
  assets: SerializedProjectAsset[];
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(reader.error || new Error("Unable to read archived asset"));
  reader.readAsDataURL(blob);
});

const dataUrlToBlob = (dataUrl: string, fallbackMime: string) => {
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/i.exec(dataUrl);
  if (!match) throw new Error("Invalid archived asset data");
  const mime = match[1] || fallbackMime || "application/octet-stream";
  const payload = match[2] || "";
  const binary = /;base64,/i.test(dataUrl) ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
};

function referencedAssetIds(project: ProjectDocumentV2, jobs: StoredJobRecord[]) {
  const ids = new Set<string>();
  for (const entity of project.assets.entities) for (const id of entity.referenceAssetIds) ids.add(id);
  for (const job of jobs) {
    for (const id of job.inputAssetIds || []) ids.add(id);
    for (const id of job.outputAssetIds || []) ids.add(id);
  }
  return ids;
}

export async function exportFullProjectArchive(project: ProjectDocument, canonicalProject?: ProjectDocumentV2): Promise<string> {
  const document = toProjectV2ForStorage(project, canonicalProject);
  const [jobs, segmentManifests, storedAssets] = await Promise.all([
    jobStore.list(document.project.id),
    segmentManifestStore.list(document.project.id),
    assetStore.list().catch(() => [] as StoredAsset[]),
  ]);
  const referenced = referencedAssetIds(document, jobs);
  const jobIds = new Set(jobs.map((job) => job.id));
  const assets = await Promise.all(storedAssets
    .filter((asset) => referenced.has(asset.id) || (asset.sourceJobId ? jobIds.has(asset.sourceJobId) : false))
    .map(async ({ blob, ...metadata }) => ({ ...metadata, dataUrl: await blobToDataUrl(blob) })));
  const archive: ProjectArchive = {
    format: "flow-companion-full-archive",
    archiveVersion: 1,
    exportedAt: new Date().toISOString(),
    project: document,
    jobs: structuredClone(jobs),
    segmentManifests: structuredClone(segmentManifests),
    assets,
  };
  return JSON.stringify(archive, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseArchive(raw: string): ProjectArchive | undefined {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return undefined; }
  if (!isRecord(value) || value.format !== "flow-companion-full-archive" || value.archiveVersion !== 1) return undefined;
  const project = projectDocumentV2Schema.parse(value.project) as ProjectDocumentV2;
  const jobs = Array.isArray(value.jobs) ? value.jobs.filter((job): job is StoredJobRecord => isRecord(job) && typeof job.id === "string" && typeof job.projectId === "string" && typeof job.status === "string") : [];
  const segmentManifests = Array.isArray(value.segmentManifests) ? value.segmentManifests.map((manifest) => segmentManifestSchema.parse(manifest)) : [];
  const assets = Array.isArray(value.assets) ? value.assets.filter((asset): asset is SerializedProjectAsset => isRecord(asset) && typeof asset.id === "string" && typeof asset.kind === "string" && typeof asset.dataUrl === "string" && typeof asset.mime === "string") as SerializedProjectAsset[] : [];
  return { format: "flow-companion-full-archive", archiveVersion: 1, exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : new Date().toISOString(), project, jobs, segmentManifests, assets };
}

export async function importFullProjectArchive(raw: string): Promise<{ project: ProjectDocumentV2; archive?: ProjectArchive }> {
  const archive = parseArchive(raw);
  if (archive) return { project: archive.project, archive };
  return { project: importSidePanelProject(raw) };
}

export async function restoreProjectArchive(archive: ProjectArchive) {
  await Promise.all(archive.jobs.map((job) => jobStore.save({ ...job, projectId: archive.project.project.id })));
  await Promise.all(archive.segmentManifests.map((manifest) => segmentManifestStore.save({ ...manifest, projectId: archive.project.project.id })));
  await Promise.all(archive.assets.map(async ({ dataUrl, ...metadata }) => {
    const stored: StoredAsset = { ...metadata, blob: dataUrlToBlob(dataUrl, metadata.mime) };
    await assetStore.save(stored);
  }));
  return { jobs: archive.jobs.length, segmentManifests: archive.segmentManifests.length, assets: archive.assets.length };
}
