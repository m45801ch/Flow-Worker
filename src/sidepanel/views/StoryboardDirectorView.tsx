import { useState } from "react";
import type { StoryboardDocument } from "../../domain/contracts/storyboard";
import { createSegmentManifest } from "../../flow/jobs/segment-manifest";
import { compileStoryboardJobs } from "../../flow/jobs/storyboard-job-compiler";
import type { SegmentManifest } from "../../domain/contracts/storyboard-continuity";
import type { FlowJobManifest } from "../../flow/jobs/types";
import type { StoryboardAssetReference } from "../../flow/jobs/storyboard-job-compiler";
import { buildStoryboardFromScript } from "../../pipeline/storyboard-from-script";

type StoryboardDirectorProps = {
  storyboard?: StoryboardDocument;
  script?: unknown;
  projectId: string;
  sourceDocumentVersion: number;
  videoModel: string;
  aspectRatio: "16:9" | "9:16";
  assetCatalog?: StoryboardAssetReference[];
  onQueue: (jobs: FlowJobManifest[]) => void | Promise<void>;
  onExportManifest?: (manifest: SegmentManifest) => void;
};
type ActionState = { tone: "pending" | "success" | "error"; text: string };
type SubmissionRecord = { id: string; text: string; at: string };

const assemblyToolLabel = (tool?: string) => tool === "external-ffmpeg" ? "外部影片組裝工具" : tool || "尚未指定組裝工具";
const hasUsableStoryboard = (value?: StoryboardDocument) => Boolean(value?.episodes.some((episode) => episode.segments.some((segment) => Boolean(segment.sceneId.trim()) && segment.cuts.some((cut) => cut.beats.length > 0))));
const queueSummary = (job: FlowJobManifest) => [job.cutId || job.sourceEntityId, job.modelName, job.aspectRatio, job.durationSec ? `${job.durationSec} 秒` : "", job.assetNames?.length ? `素材：${job.assetNames.join("、")}` : ""].filter(Boolean).join(" · ");

export function StoryboardDirectorView({ storyboard, script, projectId, sourceDocumentVersion, videoModel, aspectRatio, assetCatalog = [], onQueue, onExportManifest }: StoryboardDirectorProps) {
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const setAction = (key: string, state: ActionState) => setActionStates((current) => ({ ...current, [key]: state }));
  const queueJob = async (job: FlowJobManifest) => {
    const key = job.cutId || job.sourceEntityId;
    setAction(key, { tone: "pending", text: "送出中…" });
    try {
      await onQueue([job]);
      const text = queueSummary(job);
      setAction(key, { tone: "success", text: "已送出 Flow 佇列" });
      setNotice({ tone: "success", text: `已成功送入 Flow 佇列：${text}` });
      setSubmissions((current) => [{ id: `${Date.now()}-${job.id}`, text, at: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }) }, ...current]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "無法保存任務";
      setAction(key, { tone: "error", text: `失敗：${message}` });
      setNotice({ tone: "error", text: `送入 Flow 佇列失敗：${message}` });
    }
  };
  const actionFeedback = (key: string) => { const state = actionStates[key]; return state && <span className={`action-result ${state.tone}`}>{state.text}</span>; };
  if (!script) return <><div className="section-kicker">05 / 分鏡導演</div><h2 className="page-title">先載入劇本，<br/><em>再建立連續分鏡。</em></h2><p className="muted">請先載入劇本；分鏡導演只讀取劇本，不會改寫劇情或台詞。</p></>;
  const derivedStoryboard = !hasUsableStoryboard(storyboard);
  const activeStoryboard = derivedStoryboard ? buildStoryboardFromScript(script) : storyboard!;
  let jobs: FlowJobManifest[] = [];
  let error = "";
  try { jobs = compileStoryboardJobs(activeStoryboard, { projectId, sourceDocumentVersion, videoModel, aspectRatio, assetCatalog }); } catch (cause) { error = cause instanceof Error ? cause.message : "分鏡無法編譯"; }
  const segments = activeStoryboard.episodes.flatMap((episode) => (episode.segments || []).map((segment) => ({ episode, segment, jobs: jobs.filter((job) => job.segmentId === segment.id) })));
  return <><div className="section-kicker">05 / 分鏡導演</div><h2 className="page-title">每個鏡頭都是<br/><em>一個可驗證的 Flow 任務。</em></h2>{notice && <div className={notice.tone === "error" ? "generation-error" : "import-notice"}>{notice.text}</div>}<p className="lede">{derivedStoryboard ? "尚未有有效分鏡文件，已先依照劇本自動建立分段與鏡頭；每個鏡頭會獨立送到 Google Flow。" : "劇本已載入。分段只保存順序與外部組裝資訊；每個鏡頭會獨立送到 Google Flow。"}</p>{error && <div className="generation-error">{error}</div>}{submissions.length > 0 && <section className="submission-panel"><div className="card-label">已送出資訊（{submissions.length}）</div><div className="submission-list">{submissions.map((item) => <div className="submission-entry" key={item.id}><span className="submission-check">✓</span><div><strong>{item.text}</strong><small>{item.at} · 已加入 Flow 佇列</small></div></div>)}</div></section>}<div className="stage-list">{segments.map(({ episode, segment, jobs: segmentJobs }) => { let manifest: SegmentManifest | undefined; let manifestError = ""; try { manifest = createSegmentManifest({ projectId, episodeId: episode.id, sceneId: segment.sceneId, segmentId: segment.id, jobs: segmentJobs }); } catch (cause) { manifestError = cause instanceof Error ? cause.message : "分段清單無法建立"; } return <section className="output-card" key={segment.id}><div className="job-card-header"><h3>{segment.id}</h3><span className="stage-state">{segmentJobs.length} 個鏡頭 · {manifest?.totalDurationSec ?? 0} 秒</span></div><p>{segment.sceneId} · {assemblyToolLabel(manifest?.assembly.tool)}</p>{manifestError && <div className="generation-error">{manifestError}</div>}<div className="stage-list">{segmentJobs.map((job) => { const blockers = job.continuityBlockers || []; const blocked = blockers.length > 0; return <article className="output-card" key={job.id}><div className="job-card-header"><h3>{job.cutId || job.sourceEntityId}</h3><span className="stage-state">{job.durationSec} 秒</span></div><p>{job.aspectRatio} · {job.modelName} · {job.beatClaims?.join(", ") || "未標註節拍"}</p>{job.assetNames?.length ? <p><b>本鏡自動加入素材</b>：{job.assetNames.join("、")}</p> : <p className="muted">本鏡未匹配到角色或道具參考素材</p>}<p><b>上一鏡狀態</b>：{job.previousState || "沿用上一鏡"}<br/><b>目前鏡頭狀態</b>：{job.currentState || "依提示詞"}<br/><b>鎖定項目</b>：{job.forbiddenChanges?.join("；") || "保留人物身分、服裝、比例、姿勢、位置、道具、環境、光線與拍攝軸線"}</p>{blocked && <div className="generation-error">連續性問題：{blockers.join("；")}</div>}<details><summary>查看鏡頭提示詞</summary><pre>{job.prompt}</pre></details><div className="submit-action"><button className="primary-button" disabled={blocked} onClick={() => void queueJob(job)}>{blocked ? "修正連續性問題" : "加入 Flow 佇列 →"}</button>{actionFeedback(job.cutId || job.sourceEntityId)}</div></article>; })}</div><button className="text-button" disabled={!manifest || Boolean(manifest?.blockers.length) || !onExportManifest} onClick={() => manifest && onExportManifest?.(manifest)}>匯出分段清單</button></section>; })}</div></>;
}
