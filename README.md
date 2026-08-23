# Flow Companion

通用 AI 影片製作規劃 Chrome Extension MVP。它把故事拆成大綱、角色/美術、劇本、分鏡與導演台狀態，並將 continuity-safe Prompt 複製到 Google Flow。

## 開發

```powershell
npm install --cache .npm-cache
npm test
npm run typecheck
npm run build
```

## 載入 Chrome

1. 執行 `npm run build`。
2. 開啟 `chrome://extensions`。
3. 開啟右上角「開發人員模式」。
4. 選擇「載入未封裝項目」，選取本專案的 `dist/`。
5. 點擊工具列的 Flow Companion，開啟 Side Panel。

## 使用邊界

- Provider 只生成文字與結構化 JSON；不生成圖片或影片。
- Google Flow 只透過手動複製 Prompt、匯入 Reference Image/Last Frame 使用。
- Extension 不讀取 Flow DOM、不自動點擊、不呼叫 Flow/Veo API。
- API Key 由 service worker 使用，不能匯出到 Project JSON。

## 目前 MVP

已包含 Project JSON schema、五段 pipeline runner、四個 Provider adapter、IndexedDB project store、規則式 Continuity engine、Prompt compiler、Side Panel 混合工作台與匯入/匯出入口。完整的模型生成互動、素材 Blob 寫入與 9-grid 視覺編排可在下一里程碑接續。
