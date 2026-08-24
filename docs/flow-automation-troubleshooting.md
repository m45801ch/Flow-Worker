# Flow Automation Troubleshooting

## 載入路徑

執行 `npm install --cache .npm-cache`、`npm test`、`npm run typecheck` 與 `npm run build`。Chrome 請在 `chrome://extensions` 開啟開發人員模式，載入 `dist/` 未封裝項目。Side Panel 由擴充套件 action 開啟；Flow content script 只會在 `https://labs.google.com/*` 載入。

## 已驗證項目

目前自動化核心已通過 48 個測試檔、154 個測試案例、TypeScript typecheck 與 Vite production build。測試涵蓋五段品質門、圖片與影片 Job compiler、Cut-first 4／6／8 秒限制、Shot State／continuity gates、Segment Manifest persistence、Storyboard Director UI、繁中／簡中／英文 DOM fixture、模式／模型／比例讀回、素材歧義暫停、尾幀策略、影片尾幀擷取、checkpoint 恢復、JobStore 與安全遮罩。

## 安全邊界

Flow DOM adapter 不使用座標點擊，不呼叫非公開 Flow API，也不接收 provider API Key。MV3 host permission 限定 `https://labs.google/*` 與 `https://labs.google.com/*`，另保留四家文字 Provider 的 API host；非 Flow 分頁不會注入自動化。Project JSON 與 debug log 會移除 API Key、Authorization、token、data URL 與 provider raw response。

## 任務停住時

若目前頁面不是 Flow 專案頁，任務會進入 `paused`。若指定模型或比例不在目前 DOM 能力清單，系統會回報候選並停住，不會自動降級。若素材 ID 找不到或有多個候選，系統會回傳 `needs-user-selection`，等待人工選擇。任務的已完成輸出 asset ID 保留在 IndexedDB，取消或重試不會刪除已完成媒體。

## 連續影片

同場景且同鏡位使用上一段尾幀；同場景換鏡位使用尾幀狀態重建首幀；換場使用新場景首幀。影片 Cut 只能使用 4、6 或 8 秒，且永遠不得超過 8 秒；2、3、5、7 或 9 秒不會被靜默轉換。Segment 不是 Flow 生成單位，只有每個 Cut 個別完成後才能形成可組裝的 Manifest。第一支影片完成後應在工作台品質停靠點確認臉部、服裝、場景、動作方向與尾幀，再核准後續佇列。

## 已知限制

實際 Google Flow DOM 會隨帳戶、語言與產品版本變更。正式操作前，請以目前頁面掃描到的明確 role、aria-label 或 data attribute 為準；找不到元素時應停下來調整 adapter fixture，而不是改用座標。Provider 生成與 Google 登入、配額、內容安全、人工確認仍由使用者和 Google Flow 控制。
