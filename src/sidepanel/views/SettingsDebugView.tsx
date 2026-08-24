import { useState } from "react";
import { readDebugLogs } from "../debug-log";
import { safeJson } from "../../security/redaction";

export function SettingsDebugView({ imageModel, videoModel, onImageModelChange, onVideoModelChange }: { imageModel: string; videoModel: string; onImageModelChange: (value: string) => void; onVideoModelChange: (value: string) => void }) {
  const [notice, setNotice] = useState("");
  const exportLogs = () => { const blob = new Blob([JSON.stringify(safeJson(readDebugLogs()), null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "flow-companion-debug.json"; link.click(); URL.revokeObjectURL(url); setNotice("已匯出遮罩後除錯紀錄"); };
  return <><div className="section-kicker">07 / SETTINGS & DEBUG</div><h2 className="page-title">模型與診斷，<br/><em>清楚分開。</em></h2><div className="form-card settings-card"><label>Flow 圖片模型<input value={imageModel} onChange={(event) => onImageModelChange(event.target.value)} placeholder="例如 Nano Banana 2" /></label><label>Flow 影片模型<input value={videoModel} onChange={(event) => onVideoModelChange(event.target.value)} placeholder="例如 Veo 3.1 - Fast" /></label><p className="security-note">設定只保存模型名稱快照。API Key 不會進入 Project JSON、content script 或 debug log。</p><button className="secondary-button" onClick={exportLogs}>匯出遮罩後除錯紀錄</button>{notice && <p className="field-hint">{notice}</p>}</div></>;
}
