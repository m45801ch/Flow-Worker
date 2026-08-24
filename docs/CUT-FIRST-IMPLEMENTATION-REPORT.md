# Cut-first Storyboard Continuity 交付報告

## 完成內容

本版本將分鏡流程改為 **每個 Cut 個別送 Google Flow 生成影片**。Cut 時長嚴格限制為 4、6、8 秒；Segment 只作為順序、時間軸與外部組裝容器，extension 不裁切、不使用 WebCodecs／ffmpeg.wasm，也不在內部合成 MP4。

已加入 structured Shot State、beat coverage、standing-to-seated transition、spatial anchor、scale lock、camera axis 與 reference binding gates。Cut prompt 固定包含 previous state、continuity locks、current action、camera、allowed changes、forbidden changes、dialogue／audio、negative constraints 與 exact native duration。若有 blocker，Storyboard Director 與 Auto-Flow dispatch boundary 都會阻擋。

已加入 Segment Manifest builder、JSON export、IndexedDB store、`ready-to-assemble` 狀態轉換與 `updateStatus`。Manifest 以 cumulative start／end time 保存每個 Cut 的順序與 4／6／8 秒 native duration；只有所有 Cut 都有 video asset 與 local filename 時才會進入 `ready-to-assemble`。Manifest 的組裝工具設定為外部 ffmpeg 或外部工具。

Auto-Flow video queue 會保留 segment／cut／duration／beat／state／continuity metadata，依 dependency 在同一 Segment 內排序，並以 concurrency 1 執行。`ITEM_RESULT` 會回傳 video URL、建議 local filename 與 Cut metadata，background 會更新 job 與 Segment Manifest。某一 Cut 失敗時，後續未完成 Cut 會停止／paused。

## 版本與文件

版本已同步升至 **0.1.35**：`package.json`、`package-lock.json`、`public/manifest.json` 與 build 後 `dist/manifest.json`。README、`docs/flow-automation-troubleshooting.md` 與 approved implementation plan 已補上 Cut-first 邊界、外部 ffmpeg 組裝、failure pause、ITEM_RESULT 與排錯說明。

## Fresh validation

| Checkpoint | 結果 |
|---|---|
| `npm test` | 通過，48 test files／154 tests |
| `npm run typecheck -- --pretty false` | 通過 |
| `npm run build` | 通過，產出 `dist/` |
| `dist/manifest.json` | 0.1.35；保留 `debugger`、`labs.google`、Provider host permissions |
| 核心 dist files | `background.js`、`content-script.js`、`auto-flow-free.js` 均存在 |
| secret scan | 未命中 `sk-*`、`AIza*`、Bearer token pattern |
| 真實 Google Flow smoke test | 尚未執行；需要使用者的已登入 Flow session 與人工確認 |

## 使用者驗收步驟

請先到 `chrome://extensions` 重新載入 `dist/`，開啟已登入的 Google Flow 專案頁，再從 Side Panel 載入或完成劇本。進入分鏡導演後，先檢查每個 Cut 的 native duration、previous／current state、locks、prompt 與 blocker；先只加入並執行一個 Cut，確認 Flow UI 的模型、比例、時長與結果回報，再執行同一 Segment 的後續 Cut。所有 Cut 完成後，匯出 Segment Manifest，最後使用本機 ffmpeg 或其他外部工具按 `cutOrder` 組裝 MP4。

不要在聊天中貼 API Key。API Key 仍只應存放在 Chrome `storage.local` 與 service worker 路徑，不會由本版本傳到 Flow content script、Project JSON、bundle 或 debug log。
