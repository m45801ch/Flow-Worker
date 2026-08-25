import { useEffect, useState } from "react";
import type { ModelOption, ProviderKind } from "../../providers/models";
import { normalizeProviderSettings, type GenerationStage, type StoredProviderSettings } from "../../providers/settings";
import { clearDebugLogs, getDebugLogMode, readDebugLogs, setDebugLogMode, type DebugLogEntry, type DebugLogMode } from "../debug-log";
import { safeJson } from "../../security/redaction";

const providerLabels: Record<ProviderKind, string> = { gemini: "Gemini", openai: "OpenAI", groq: "Groq", openrouter: "OpenRouter" };
const providerKinds: ProviderKind[] = ["gemini", "openai", "groq", "openrouter"];
const stageLabels: Record<GenerationStage, string> = { outline: "故事大綱", characters: "角色與關係", art: "場景／道具美術", script: "劇本與台詞", storyboard: "分鏡與 Flow 提示詞" };
const stageKinds: GenerationStage[] = ["outline", "characters", "art", "script", "storyboard"];
type ModelsByProvider = Record<ProviderKind, ModelOption[]>;
const emptyModels = (): ModelsByProvider => {
  const models = {} as ModelsByProvider;
  for (const provider of providerKinds) models[provider] = [];
  return models;
};
const serializeLogs = (logs: DebugLogEntry[]) => JSON.stringify(safeJson(logs), null, 2);
const formatLogDetails = (details: Record<string, unknown> | undefined) => details ? JSON.stringify(safeJson(details), null, 2) : "";
const formatLogTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return `${new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Taipei" }).format(date)}（UTC+8）`;
  } catch {
    return `${value}（UTC+8）`;
  }
};

export function ProviderSettingsView() {
  const extension = (globalThis as any).chrome;
  const [settings, setSettings] = useState<StoredProviderSettings>(() => normalizeProviderSettings({}));
  const [modelsByProvider, setModelsByProvider] = useState<ModelsByProvider>(emptyModels);
  const [loadingProvider, setLoadingProvider] = useState<ProviderKind | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderKind>("gemini");
  const [selectedStage, setSelectedStage] = useState<GenerationStage>("outline");
  const [logs, setLogs] = useState<DebugLogEntry[]>(() => readDebugLogs());
  const [logMode, setLogMode] = useState<DebugLogMode>(() => getDebugLogMode());
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const saved = await extension?.storage?.local?.get?.(["flowProviderSettings", "provider", "apiKey", "model", "temperature"]);
      if (active) setSettings(normalizeProviderSettings(saved?.flowProviderSettings ?? saved));
    })();
    return () => { active = false; };
  }, [extension]);

  useEffect(() => {
    const refreshLogs = () => { setLogs(readDebugLogs()); setLogMode(getDebugLogMode()); };
    window.addEventListener("flow-companion-debug", refreshLogs);
    window.addEventListener("flow-companion-debug-clear", refreshLogs);
    window.addEventListener("flow-companion-debug-mode", refreshLogs);
    return () => {
      window.removeEventListener("flow-companion-debug", refreshLogs);
      window.removeEventListener("flow-companion-debug-clear", refreshLogs);
      window.removeEventListener("flow-companion-debug-mode", refreshLogs);
    };
  }, []);

  const selectedRoute = settings.stageRoutes[selectedStage];

  const updateProvider = (provider: ProviderKind, patch: Partial<{ apiKey: string; model: string; temperature: number }>) => {
    setSettings((current) => ({
      ...current,
      apiKeys: { ...current.apiKeys, ...(patch.apiKey === undefined ? {} : { [provider]: patch.apiKey }) },
      models: { ...current.models, ...(patch.model === undefined ? {} : { [provider]: patch.model }) },
      temperatures: { ...current.temperatures, ...(patch.temperature === undefined ? {} : { [provider]: patch.temperature }) },
      stageRoutes: Object.fromEntries(stageKinds.map((stage) => [stage, current.stageRoutes[stage].provider === provider ? { ...current.stageRoutes[stage], ...(patch.model === undefined ? {} : { model: patch.model }), ...(patch.temperature === undefined ? {} : { temperature: patch.temperature }) } : current.stageRoutes[stage]])) as StoredProviderSettings["stageRoutes"]
    }));
  };

  const updateRoute = (patch: Partial<{ provider: ProviderKind; model: string; temperature: number }>) => setSettings((current) => ({ ...current, stageRoutes: { ...current.stageRoutes, [selectedStage]: { ...current.stageRoutes[selectedStage], ...patch } } }));

  const persistSettings = async (next: StoredProviderSettings) => {
    await extension?.storage?.local?.set?.({ flowProviderSettings: next, provider: next.defaultProvider, apiKey: next.apiKeys[next.defaultProvider], model: next.models[next.defaultProvider], temperature: next.temperatures[next.defaultProvider] });
  };

  const save = async () => { await persistSettings(settings); setNotice("四家服務商設定已保存；各階段會依下方路由取用"); };

  const applyModel = (provider: ProviderKind, model: string) => {
    const next: StoredProviderSettings = {
      ...settings,
      models: { ...settings.models, [provider]: model },
      stageRoutes: Object.fromEntries(stageKinds.map((stage) => [stage, settings.stageRoutes[stage].provider === provider ? { ...settings.stageRoutes[stage], model } : settings.stageRoutes[stage]])) as StoredProviderSettings["stageRoutes"]
    };
    setSettings(next);
    void persistSettings(next);
    setNotice(`已套用 ${providerLabels[provider]} 模型：${model}`);
  };

  const fetchModels = (provider: ProviderKind) => {
    const apiKey = settings.apiKeys[provider];
    if (!apiKey.trim()) { setNotice(`請先輸入 ${providerLabels[provider]} API 金鑰`); return; }
    if (!extension?.runtime?.sendMessage) { setNotice("請從已載入的 Chrome 擴充功能開啟設定"); return; }
    setLoadingProvider(provider);
    extension.runtime.sendMessage({ type: "LIST_MODELS", provider, apiKey }, (response: { ok: boolean; models?: ModelOption[]; error?: string }) => {
      setLoadingProvider(null);
      if (!response?.ok) { setNotice(response?.error ?? "取得模型列表失敗"); return; }
      const options = response.models ?? [];
      setModelsByProvider((current) => ({ ...current, [provider]: options }));
      setNotice(options.length ? `已取得 ${options.length} 個 ${providerLabels[provider]} 模型，請在模型下拉選單中選取` : `${providerLabels[provider]} 沒有可用模型`);
    });
  };

  const copyLogs = async () => {
    if (!logs.length) { setNotice("目前沒有可複製的日誌紀錄"); return; }
    if (!navigator.clipboard?.writeText) { setNotice("目前瀏覽器不支援直接複製日誌"); return; }
    try { await navigator.clipboard.writeText(serializeLogs(logs)); setNotice(`已複製 ${logs.length} 筆日誌紀錄`); } catch { setNotice("複製日誌失敗，請改用下載功能"); }
  };

  const clearLogs = () => { clearDebugLogs(); setLogs([]); setNotice("日誌紀錄已清除"); };
  const updateLogMode = (mode: DebugLogMode) => { setLogMode(mode); setDebugLogMode(mode); setLogs(readDebugLogs()); setNotice(mode === "important" ? "已切換為重點紀錄模式" : "已切換為完整紀錄模式；重現問題後請下載日誌"); };

  const downloadLogs = () => {
    const blob = new Blob([serializeLogs(logs)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "flow-companion-debug.json";
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`已下載 ${logs.length} 筆日誌紀錄`);
  };

  const selectedProviderOptions = modelsByProvider[selectedProvider];
  const selectedProviderModel = settings.models[selectedProvider];
  const selectedProviderHasCurrentModel = selectedProviderOptions.some((model) => model.id === selectedProviderModel);

  return <>
    <div className="section-kicker">07 / 設定與除錯</div>
    <h2 className="page-title">四家模型，<br/><em>各司其職。</em></h2>
    <p className="lede">API 金鑰只保存於這台瀏覽器的 Chrome 儲存空間，不會進入 Project JSON、Flow 內容腳本或除錯紀錄。</p>
    <div className="form-card settings-card">
      <div className="card-label">服務商設定</div>
      <label className="provider-selector">選擇 API 服務商
        <select value={selectedProvider} onChange={(event) => setSelectedProvider(event.target.value as ProviderKind)}>
          {providerKinds.map((provider) => <option value={provider} key={provider}>{providerLabels[provider]}</option>)}
        </select>
      </label>
      <div className="provider-setting-row">
        <div className="provider-api-field">
          <label>{providerLabels[selectedProvider]} API 金鑰
            <input type="password" value={settings.apiKeys[selectedProvider]} onChange={(event) => { updateProvider(selectedProvider, { apiKey: event.target.value }); setModelsByProvider((current) => ({ ...current, [selectedProvider]: [] })); }} placeholder={`${providerLabels[selectedProvider]} API 金鑰`} autoComplete="off" />
          </label>
          <button className="secondary-button provider-fetch-button" onClick={() => fetchModels(selectedProvider)} disabled={loadingProvider !== null || !settings.apiKeys[selectedProvider].trim()}>{loadingProvider === selectedProvider ? "取得中…" : "取得模型列表"}</button>
        </div>
        <label className="provider-model-field">{providerLabels[selectedProvider]} 模型（模型名稱）
          {selectedProviderOptions.length > 0 ? <select value={selectedProviderModel} onChange={(event) => applyModel(selectedProvider, event.target.value)}>
            {!selectedProviderHasCurrentModel && selectedProviderModel && <option value={selectedProviderModel}>{selectedProviderModel}（目前設定）</option>}
            {selectedProviderOptions.map((model) => <option value={model.id} key={model.id}>{model.label}（{model.id}）</option>)}
          </select> : <input value={selectedProviderModel} onChange={(event) => updateProvider(selectedProvider, { model: event.target.value })} placeholder="輸入模型名稱或 ID" />}
        </label>
        <label className="provider-temperature-field">溫度（控制 AI 隨機性的參數）
          <output>{settings.temperatures[selectedProvider].toFixed(1)}</output>
          <input className="temperature-range" type="range" value={settings.temperatures[selectedProvider]} onChange={(event) => updateProvider(selectedProvider, { temperature: Number(event.target.value) })} min="0" max="1" step="0.1" />
          <span className="field-hint">0＝較穩定、較少隨機；1＝較隨機、較有創意</span>
        </label>
      </div>
    </div>
    <div className="form-card settings-card">
      <div className="card-label">內容階段模型路由</div>
      <p className="muted">每一段內容可以使用不同服務商；若該段沒有 API 金鑰，執行時會明確停下，不會偷偷改用其他模型。</p>
      <label>內容階段<select value={selectedStage} onChange={(event) => setSelectedStage(event.target.value as GenerationStage)}>{stageKinds.map((stage) => <option value={stage} key={stage}>{stageLabels[stage]}</option>)}</select></label>
      <label>使用服務商<select value={selectedRoute.provider} onChange={(event) => { const provider = event.target.value as ProviderKind; updateRoute({ provider, model: settings.models[provider], temperature: settings.temperatures[provider] }); }}>{providerKinds.map((provider) => <option value={provider} key={provider}>{providerLabels[provider]}{settings.apiKeys[provider] ? " · 已填金鑰" : " · 尚無金鑰"}</option>)}</select></label>
      <label>該階段模型<input value={selectedRoute.model} onChange={(event) => updateRoute({ model: event.target.value })} /></label>
      <label>該階段溫度<output>{selectedRoute.temperature.toFixed(1)}</output><input className="temperature-range" type="range" value={selectedRoute.temperature} onChange={(event) => updateRoute({ temperature: Number(event.target.value) })} min="0" max="1" step="0.1" /><span className="field-hint">0＝較穩定、較少隨機；1＝較隨機、較有創意</span></label>
      <div className="route-summary"><b>{stageLabels[selectedStage]}</b><span>→ {providerLabels[selectedRoute.provider]} / {selectedRoute.model}</span></div>
    </div>
    <div className="form-card settings-card">
      <div className="card-label">除錯與診斷</div>
      <p className="security-note">日誌紀錄會移除 API 金鑰、Authorization、token、data URL 與服務商原始回應。</p>
      <label>紀錄模式<select value={logMode} onChange={(event) => updateLogMode(event.target.value as DebugLogMode)}><option value="important">重點模式（建議）</option><option value="verbose">完整模式（除錯用）</option></select><span className="field-hint">重點模式只保留錯誤、提交、結果、重試及批次狀態；需要抓取完整 DOM 時才切換完整模式。</span></label>
      <details className="debug-log-panel">
        <summary>錯誤／除錯日誌紀錄（{logs.length} 筆）</summary>
        <div className="debug-log-toolbar">
          <button className="secondary-button" onClick={() => void copyLogs()} disabled={!logs.length}>複製</button>
          <button className="secondary-button" onClick={clearLogs} disabled={!logs.length}>清除</button>
          <button className="secondary-button" onClick={downloadLogs} disabled={!logs.length}>下載</button>
        </div>
        {logs.length ? <div className="debug-log-list">{logs.slice().reverse().map((log) => <article className={`debug-log-entry ${log.level}`} key={log.id}><div className="debug-log-meta"><span>{log.level === "error" ? "錯誤" : "資訊"}</span><span>{log.stage}</span><time dateTime={log.time} title={`原始時間：${log.time}`}>{formatLogTime(log.time)}</time></div><p>{log.message}</p>{formatLogDetails(log.details) && <pre>{formatLogDetails(log.details)}</pre>}</article>)}</div> : <p className="field-hint">目前沒有錯誤或除錯日誌紀錄。</p>}
      </details>
      <div className="form-actions"><button className="primary-button" onClick={save}>保存四家服務商設定 <span>→</span></button></div>
      {notice && <p className="field-hint">{notice}</p>}
    </div>
  </>;
}
