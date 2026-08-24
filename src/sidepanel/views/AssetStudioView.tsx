import { useState } from "react";
import type { CastDocument } from "../../domain/contracts/cast";
import type { ArtDocument } from "../../domain/contracts/art";
import { compileCharacterSheetJob, compilePropSheetJob, compileSceneSheetJob } from "../../flow/jobs/image-job-compiler";
import type { FlowAspectRatio, FlowJobManifest, FlowOutputCount } from "../../flow/jobs/types";
import { builtInImageModels } from "../../flow/image-models";

type ActionState = { tone: "pending" | "success" | "error"; text: string };
type SubmissionRecord = { id: string; text: string; at: string };

const queueSummary = (job: FlowJobManifest) => { const parsedCount = Number.parseInt(String(job.outputCount ?? ""), 10); const count = Number.isFinite(parsedCount) ? `${parsedCount} 張` : ""; return [job.sourceEntityName || job.sourceEntityId, job.modelName, job.aspectRatio, count].filter(Boolean).join(" · "); };

export function AssetStudioView({ cast, art, projectId, sourceDocumentVersion, imageModel, defaultAspectRatio = "16:9", onQueue }: { cast?: CastDocument; art?: ArtDocument; projectId: string; sourceDocumentVersion: number; imageModel: string; defaultAspectRatio?: FlowAspectRatio; onQueue: (jobs: FlowJobManifest[]) => void | Promise<void> }) {
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const defaultImageModel = builtInImageModels.some((item) => item.name === imageModel) ? imageModel : builtInImageModels[1].name;
  const [selectedImageModel, setSelectedImageModel] = useState(defaultImageModel);
  const [aspectRatio, setAspectRatio] = useState<FlowAspectRatio>(defaultAspectRatio);
  const [outputCount, setOutputCount] = useState<FlowOutputCount>(1);
  const context = { projectId, sourceDocumentVersion, imageModel: selectedImageModel, aspectRatio, outputCount };
  const setAction = (key: string, state: ActionState) => setActionStates((current) => ({ ...current, [key]: state }));
  const queue = async (job: FlowJobManifest, actionKey = job.sourceEntityId) => {
    setAction(actionKey, { tone: "pending", text: "送出中…" });
    try {
      await onQueue([job]);
      const text = queueSummary(job);
      setAction(actionKey, { tone: "success", text: "已送出 Flow 佇列" });
      setNotice({ tone: "success", text: `已成功送入 Flow 佇列：${text}` });
      setSubmissions((current) => [{ id: `${Date.now()}-${job.id}`, text, at: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }) }, ...current]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "無法保存任務";
      setAction(actionKey, { tone: "error", text: `失敗：${message}` });
      setNotice({ tone: "error", text: `送入 Flow 佇列失敗：${message}` });
    }
  };
  const queueBuiltJob = (actionKey: string, build: () => FlowJobManifest) => {
    try { void queue(build(), actionKey); } catch (error) { const message = error instanceof Error ? error.message : "無法建立任務"; setAction(actionKey, { tone: "error", text: `失敗：${message}` }); setNotice({ tone: "error", text: `送入 Flow 佇列失敗：${message}` }); }
  };
  const queueCharacter = (character: CastDocument["characters"][number]) => queueBuiltJob(character.id, () => compileCharacterSheetJob(character, context));
  const actionFeedback = (key: string) => { const state = actionStates[key]; return state && <span className={`action-result ${state.tone}`}>{state.text}</span>; };
  return <><div className="section-kicker">03 / 素材工作室</div><h2 className="page-title">把世界拆成<br/><em>可綁定的素材。</em></h2><p className="lede">內容管線的標準視覺提示詞會原樣保存；下方內建三視圖版型提示詞會與人物描述合成後送入 Flow 佇列。</p><div className="form-card asset-settings"><div className="card-label">圖片任務設定</div><div className="field-grid"><label>圖片模型<select aria-label="圖片模型" value={selectedImageModel} onChange={(event) => setSelectedImageModel(event.target.value)}>{builtInImageModels.map((model) => <option value={model.name} key={model.name}>{model.label}</option>)}</select></label><label>比例<select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as FlowAspectRatio)}><option value="16:9">16:9</option><option value="9:16">9:16</option></select></label><label>張數<select value={outputCount} onChange={(event) => setOutputCount(Number(event.target.value) as FlowOutputCount)}><option value={1}>1 張</option><option value={2}>2 張</option><option value={3}>3 張</option><option value={4}>4 張</option></select></label></div></div>{notice && <div className={notice.tone === "error" ? "generation-error" : "import-notice"}>{notice.text}</div>}{submissions.length > 0 && <section className="submission-panel"><div className="card-label">已送出資訊（{submissions.length}）</div><div className="submission-list">{submissions.map((item) => <div className="submission-entry" key={item.id}><span className="submission-check">✓</span><div><strong>{item.text}</strong><small>{item.at} · 已加入 Flow 佇列</small></div></div>)}</div></section>}<div className="stage-list">{(cast?.characters ?? []).map((character) => <article className="output-card" key={character.id}><h3>{character.name} <small>{character.id}</small></h3><div className="prompt-label">人物描述</div><p>{typeof character.persona === "string" ? character.persona : JSON.stringify(character.persona)}</p><div className="prompt-label">標準視覺提示詞</div><pre className="asset-prompt">{character.image.prompt || "尚未產生標準視覺提示詞；請重新執行美術資產階段。"}</pre><div className="prompt-label">三視圖提示詞</div><pre className="asset-prompt">{character.image.sheetPrompt || "尚未產生三視圖提示詞；請重新執行美術資產階段。"}</pre><div className="submit-action"><button className="primary-button" disabled={!character.image.prompt?.trim() || !character.image.sheetPrompt?.trim() || !selectedImageModel.trim()} onClick={() => queueCharacter(character)}>在 Flow 生成三視圖 →</button>{actionFeedback(character.id)}</div></article>)}{(art?.scenes ?? []).map((scene) => <article className="output-card" key={scene.id}><h3>{scene.name} <small>{scene.id}</small></h3><p>{scene.imagePrompt}</p><div className="submit-action"><button className="primary-button" onClick={() => queueBuiltJob(scene.id, () => compileSceneSheetJob(scene, context))}>在 Flow 生成場景 →</button>{actionFeedback(scene.id)}</div></article>)}{(art?.props ?? []).map((prop) => <article className="output-card" key={prop.id}><h3>{prop.name} <small>{prop.id}</small></h3><p>{prop.imagePrompt}</p><div className="submit-action"><button className="primary-button" onClick={() => queueBuiltJob(prop.id, () => compilePropSheetJob(prop, context))}>在 Flow 生成道具 →</button>{actionFeedback(prop.id)}</div></article>)}</div></>;
}
