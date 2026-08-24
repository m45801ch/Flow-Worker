import type { StoryboardDocument } from "../../domain/contracts/storyboard";
import { createSegmentManifest } from "../../flow/jobs/segment-manifest";
import { compileStoryboardJobs } from "../../flow/jobs/storyboard-job-compiler";
import type { SegmentManifest } from "../../domain/contracts/storyboard-continuity";
import type { FlowJobManifest } from "../../flow/jobs/types";

type StoryboardDirectorProps = {
  storyboard?: StoryboardDocument;
  script?: unknown;
  projectId: string;
  sourceDocumentVersion: number;
  videoModel: string;
  aspectRatio: "16:9" | "9:16";
  onQueue: (jobs: FlowJobManifest[]) => void;
  onExportManifest?: (manifest: SegmentManifest) => void;
};

export function StoryboardDirectorView({ storyboard, script, projectId, sourceDocumentVersion, videoModel, aspectRatio, onQueue, onExportManifest }: StoryboardDirectorProps) {
  if (!script) return <><div className="section-kicker">05 / STORYBOARD DIRECTOR</div><h2 className="page-title">先載入劇本，<br/><em>再建立連續分鏡。</em></h2><p className="muted">請先載入劇本；分鏡導演只讀取劇本，不會改寫劇情或台詞。</p></>;
  if (!storyboard) return <><div className="section-kicker">05 / STORYBOARD DIRECTOR</div><h2 className="page-title">分鏡會在<br/><em>結構劇本之後出現。</em></h2><p className="muted">尚未產生 storyboard 文件。</p></>;
  let jobs: FlowJobManifest[] = [];
  let error = "";
  try { jobs = compileStoryboardJobs(storyboard, { projectId, sourceDocumentVersion, videoModel, aspectRatio }); } catch (cause) { error = cause instanceof Error ? cause.message : "分鏡無法編譯"; }
  const segments = storyboard.episodes.flatMap((episode) => (episode.segments || []).map((segment) => ({ episode, segment, jobs: jobs.filter((job) => job.segmentId === segment.id) })));
  return <><div className="section-kicker">05 / STORYBOARD DIRECTOR</div><h2 className="page-title">每個 Cut 都是<br/><em>一個可驗證的 Flow Job。</em></h2><p className="lede">劇本已載入。Segment 只保存順序與外部組裝資訊；每個 Cut 會獨立送到 Google Flow。</p>{error && <div className="generation-error">{error}</div>}<div className="stage-list">{segments.map(({ episode, segment, jobs: segmentJobs }) => { let manifest: SegmentManifest | undefined; let manifestError = ""; try { manifest = createSegmentManifest({ projectId, episodeId: episode.id, sceneId: segment.sceneId, segmentId: segment.id, jobs: segmentJobs }); } catch (cause) { manifestError = cause instanceof Error ? cause.message : "Segment Manifest 無法建立"; } return <section className="output-card" key={segment.id}><div className="job-card-header"><h3>{segment.id}</h3><span className="stage-state">{segmentJobs.length} CUTS · {manifest?.totalDurationSec ?? 0}s</span></div><p>{segment.sceneId} · {manifest?.assembly.tool || "external-ffmpeg"}</p>{manifestError && <div className="generation-error">{manifestError}</div>}<div className="stage-list">{segmentJobs.map((job) => { const blockers = job.continuityBlockers || []; const blocked = blockers.length > 0; return <article className="output-card" key={job.id}><div className="job-card-header"><h3>{job.cutId || job.sourceEntityId}</h3><span className="stage-state">{job.durationSec} 秒</span></div><p>{job.aspectRatio} · {job.modelName} · {job.beatClaims?.join(", ") || "未標註 beat"}</p><p><b>Previous State</b>：{job.previousState || "沿用上一鏡"}<br/><b>Current State</b>：{job.currentState || "依 prompt"}<br/><b>Locks</b>：{job.forbiddenChanges?.join("；") || "保留 identity、costume、scale、pose、position、props、environment、lighting、axis"}</p>{blocked && <div className="generation-error">Continuity blocker：{blockers.join("；")}</div>}<details><summary>查看 Cut Prompt</summary><pre>{job.prompt}</pre></details><button className="primary-button" disabled={blocked} onClick={() => onQueue([job])}>{blocked ? "修正 continuity blocker" : "加入 Flow 佇列 →"}</button></article>; })}</div><button className="text-button" disabled={!manifest || Boolean(manifest?.blockers.length) || !onExportManifest} onClick={() => manifest && onExportManifest?.(manifest)}>匯出 Segment Manifest</button></section>; })}</div></>;
}
