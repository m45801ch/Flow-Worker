# Flow Companion

通用 AI 影片製作規劃 Chrome Extension。它把故事拆成大綱、角色／美術、劇本、分鏡與導演台狀態，將結構化資料編譯為 continuity-safe Flow Job，並在使用者啟動後於 Google Flow 頁面執行明確、可驗證的 DOM 操作。

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
6. 只有 `https://labs.google/*`／`https://labs.google.com/*` 會載入 Flow content script；其他網站不會注入自動化邏輯。

## 架構

專案以五份原生文件作為內容來源，先經 Zod 契約與確定性品質門驗證，再編譯成不可變的 `FlowJobManifest`。圖片任務可保存 16:9 或 9:16 比例與 1–4 張輸出數；影片任務只接受 16:9 或 9:16，且每個 Cut 只會產生 4、6 或 8 秒的 Job。素材 Blob、影片尾幀與 metadata 儲存在 IndexedDB；任務狀態、checkpoint、重試與輸出 asset ID 由 JobStore 保存。

Flow 自動化整合 Auto-Flow-Free 的可見元素、ARIA、Shadow DOM 與 fuzzy matching 邏輯，設定模式、模型、比例與輸出張數後才填入 prompt 並提交。建立按鈕由 Flow-Worker service worker 透過 debugger trusted click 發送受驗證的 viewport 座標事件；這不是未確認目標的盲點擊。找不到指定模型、prompt 輸入框或素材歧義時會回報錯誤，不自行降級，也不呼叫非公開 Flow API。Provider API Key 只在 service worker 使用，不會傳入 Flow content script、Project JSON、bundle 或 debug log。

## 專案內容

`src/domain/contracts/` 保存五段原生契約；`src/domain/gates/` 保存品質門；`src/flow/jobs/` 保存圖片／影片 Job 與 Prompt compiler；`src/flow/dom/` 保存 Flow 分頁偵測、能力掃描與 DOM adapter；`src/flow/media/` 保存結果 baseline、尾幀擷取與 continuity strategy；`src/flow/automation/` 保存 checkpoint state machine；`src/storage/` 保存 Project、Asset 與 Job 儲存層。

## 使用邊界

Provider 只生成文字與結構化 JSON。Flow 操作必須由使用者從擴充套件工作台啟動，並且只在使用者已開啟、可互動的 Google Flow 專案頁執行。系統不繞過 Google 登入、配額、付費、內容安全或人工確認，也不做影片剪輯、精準唇形同步與音訊後製。

## 授權

第三方來源與授權歸屬請參閱 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

## Provider 設定與生成路由

在 Side Panel 開啟「設定／除錯」，可分別輸入 **Gemini、OpenAI、Groq、OpenRouter** 的 API Key、Model ID 與 Temperature。API Key 只寫入 Chrome `storage.local`，不會寫入 Project JSON 或送往 Flow content script。模型清單可依各 Provider 取得，也可直接輸入 Model ID。

在「STAGE MODEL ROUTING」中，可為故事大綱、角色與關係、場景／道具美術、劇本與台詞、分鏡與 Flow Prompt 分別指定 Provider 與模型。執行某一階段時，background worker 會以該階段路由解析 API Key、模型與溫度；若缺少 API Key 或 Model，該階段會明確失敗並提示設定，不會自動改用其他 Provider。

建議的預設工作分配是：故事大綱與劇本使用較強的通用模型；角色、美術與分鏡使用能穩定輸出 JSON 的模型；Groq 可用於快速草稿；OpenRouter 可在需要多模型選擇時使用。實際可用模型與費率依各 Provider 帳戶、地區與當時的官方模型列表為準。

## 人物素材工作室與 Auto-Flow 執行

內容管線完成美術資產階段後，素材工作室會分別顯示每個角色的 `CANONICAL VISUAL PROMPT` 與 `THREE-VIEW PROMPT`。人物卡片不再把中文 persona 當作最終影像提示詞；`在 Flow 生成三視圖` 會把 canonical visual prompt、內建三視圖版型、人物描述、negative prompt、角色 ID、圖片模型、比例與輸出張數合成 immutable Flow job。

在素材工作室的 `IMAGE JOB SETTINGS` 選擇圖片模型、比例與張數，再按人物卡片的入列按鈕。到 `Flow 佇列` 後按 `執行佇列`，Flow-Worker 會依 Auto-Flow-Free 的批次語意，按相同模型／比例／張數分組，逐批將 prompt 送入 Google Flow，設定圖片模式、模型、比例與輸出張數，提交生成並等待 Flow 回報；不同設定的 job 會依序送出，不會互相覆蓋。

第一次使用或更新版本後，請到 `chrome://extensions` 對 Flow Companion 按 `重新載入`，並在另一個分頁先開啟 Google Flow 專案頁面（`https://labs.google/fx/.../tools/flow`）。執行時需要保持該 Flow 分頁可用；若頁面 DOM、模型面板或建立按鈕改版，佇列會保留錯誤狀態並將候選資訊寫入除錯紀錄，不會假裝生成成功。

產生後若仍看到舊的中文人物摘要，請重新執行內容管線的 `美術資產` 階段；已保存的舊 Project 不會自動改寫。若舊 job 沒有完整 manifest snapshot，請從素材工作室重新加入佇列。

## Cut-first 分鏡連續性管線

分鏡導演必須先有已載入的劇本；分鏡只引用劇本的場次、節拍與台詞，不改寫劇情。每個 Segment 是外部組裝用的容器，每個 Cut 則是一次獨立的 Google Flow 影片生成，時長嚴格限定為原生 **4、6 或 8 秒**，不會將 2、3、5、7 或 9 秒靜默轉換成其他長度。

每個 Cut 的 Prompt 會包含上一 Cut 狀態、連續性鎖定、當前動作、鏡位、允許變更、禁止變更、對白／音訊與 negative constraints。預設只允許鏡位改變；人物 identity、臉部、髮型、服裝、比例、姿勢、位置、道具、環境、光線與 camera axis 都會被鎖定。站立轉坐下必須有 turn、walk、sit 的明確動作節拍。若 Shot State gate 發現空間錨點突然出現、人物 scale drift、軸線斷裂或其他 blocker，Cut 會在 UI 與 Auto-Flow dispatch boundary 同時被阻擋。

在分鏡導演中，正常 Cut 可個別加入 Flow 佇列；含 blocker 的 Cut 會停在 `修正 continuity blocker`，不可送出。Segment Manifest 匯出為 JSON，並同步保存到 IndexedDB。Manifest 只記錄 Cut 順序、原生時長、時間軸、job／asset metadata 與外部組裝設定；當所有 Cut 都回報成功 asset 後才會進入 `ready-to-assemble`。

第一版不在 Chrome extension 內裁切或合成 MP4。請使用 Manifest 的 `assembly.tool`、`cutOrder`、`startTimeSec`、`endTimeSec` 與檔名，交由外部 ffmpeg 或其他工具依序組裝。Auto-Flow 會以 Segment 為 video batch 邊界、依 Cut dependency 排序；某一 Cut 失敗時會停止當前 Flow batch 並暫停後續 Cut，避免以不完整連續性繼續生成。

實際 Google Flow 生成 smoke test 尚未由自動化環境執行；使用者需在 Chrome 重新載入 extension、開啟已登入的 Google Flow 專案頁、載入劇本後先生成一個 Cut，確認 Flow UI 的模型、比例、時長與結果回報，再執行完整 Segment。`ITEM_RESULT` 回報的 video URL 與建議檔名會映射到 job 與 Segment Manifest，但下載與 MP4 組裝仍由外部工具負責。

## Cut-first 排錯

若分鏡頁顯示「請先載入劇本」，請先完成劇本階段或匯入包含 script document 的 Project；Storyboard Director 不會自行補寫劇本。若顯示 native duration 錯誤，請把該 Cut 改為 4、6 或 8 秒。若出現 continuity blocker，先修正上一／目前 Shot State、空間 anchor、人物比例或 camera axis，再重新編譯；不要直接繞過 gate。若 Segment Manifest 一直是 `generating`，請確認每個 Cut 都收到 `ITEM_RESULT` 並具有 video asset 與 local filename；只有全部 Cut 完成才可交給外部 ffmpeg 組裝。
