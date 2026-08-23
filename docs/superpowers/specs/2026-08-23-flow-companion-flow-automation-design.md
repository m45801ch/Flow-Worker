# Flow Companion × Google Flow 自動化整合設計

日期：2026-08-23  
設計狀態：等待使用者最終核准  
目前擴充套件版本：0.1.17（本文件不變更執行程式與版本）

## 1. 目標

將 Flow Companion 重建為單一 Chrome MV3 Side Panel 擴充套件，融合 `shuohao-skills` 的五段內容管線與 `E:\My build\flow-automation` 已驗證的 Google Flow 操作經驗，完成以下閉環：

1. 故事大綱。
2. 角色設定與人物三視圖。
3. 場景、道具與服裝素材。
4. 結構化劇本、動作節拍與逐句台詞。
5. 分鏡、鏡位、首幀與最長 8 秒的 Flow 影片 Prompt。
6. 自動切換 Flow 圖片／影片模式、模型、比例並送出任務。
7. 保存生成圖片、影片與尾幀；將尾幀或重建首幀帶入下一段。
8. 以 checkpoint、品質門與除錯紀錄支援暫停、重試及斷點續跑。

## 2. 已核准決策

- 採單一擴充套件，不讓 Flow Companion 與 flow-automation 兩套擴充套件互相通訊。
- 採「五段原生 Skill JSON → Flow Job Manifest → Automation State Machine」。
- 不直接併入舊版大型單檔 JavaScript；將可靠的互動策略重寫成 TypeScript 模組。
- 角色三視圖生成後，同時保存到角色卡並自動建立或更新 Flow 角色素材。
- Flow 圖片與影片模型由使用者分別指定；自動化不得自行降級或替換。
- 模型清單採動態掃描、快取與自訂備援。
- 第一個品質停靠點在首張角色三視圖完成後。
- 第二個品質停靠點在第一支 8 秒以內的影片完成後。
- Flow 影片生成單位最長 8 秒。
- 同場景連續動作使用上一段尾幀；換鏡位時依尾幀狀態、角色與場景素材先重建新首幀。
- Flow 操作只在使用者啟動任務後、且只在 `labs.google` Flow 專案頁執行。

## 3. 非目標

- 不呼叫或逆向非公開 Flow API。
- 不繞過 Google 登入、配額、付費、內容安全或人工確認。
- 不在 Flow 以外網站讀取或操作 DOM。
- 不做影片剪輯合成、精準唇形同步或音訊後製。
- 不以座標盲點擊作為最終備援。
- 第一版不提供多人協作或雲端後端。

## 4. 資料架構

### 4.1 專案文件

`ProjectDocumentV2` 不再把五段結果壓扁成通用陣列，而是保存原生、可版本化的正式文件：

```ts
interface ProjectDocumentV2 {
  schemaVersion: "2.0";
  project: ProjectMetadata;
  documents: {
    outline: VersionHistory<OutlineDocument>;
    cast: VersionHistory<CastDocument>;
    art: VersionHistory<ArtDocument>;
    script: VersionHistory<ScriptDocument>;
    storyboard: VersionHistory<StoryboardDocument>;
  };
  assets: AssetRepositoryIndex;
  flow: FlowWorkspaceState;
  jobs: FlowJobRecord[];
}
```

每次成功生成建立新版本，不覆蓋舊版本。上游文件更新後，下游標記為 `stale`，由使用者選擇只重跑目前階段或重跑後續依賴。

### 4.2 穩定識別碼

- 角色：`C01`。
- 場景：`S01`。
- 道具：`P01`。
- 爽點：`B01`。
- 影片段：`E01-01`。
- 分鏡：`E01-01-C01`。
- 生成任務：UUID。

資料層只保存 ID；介面顯示名稱。刪除仍被引用的資產時，列出引用位置並阻止直接刪除。

### 4.3 圖片與媒體

IndexedDB 保存原始圖片、影片 metadata、尾幀 Blob、縮圖與來源資訊。Project JSON 只保存 asset ID、MIME、尺寸、雜湊、建立時間及 Flow 綁定 metadata，不內嵌大型 Blob。

## 5. 五段 Skill 實體化

### 5.1 大綱

保存 `outline.json` 的 adaptation、characters、scenes、props、beats、episodes 與 params。移植原 Skill 的確定性品質門，包含角色分檔、場景上限、爽點間隔、引用完整性與分集三欄。

### 5.2 角色

保存完整 `cast.json`：persona、relationships、evidence、image prompt、sheet prompt、negative prompt、voice prompt。角色頁不得以 `description` 代替出圖 Prompt。

角色三視圖 Prompt 必須包含：

- 單一 16:9 橫向畫布。
- 左側約 34% 正面半身像，作為面部基準。
- 右上正面、側面、背面三個等高全身像。
- 右下 4–5 個服裝、配件、髮型或鞋履細節。
- 同一張臉、相同髮型與服裝；禁止人物比例壓縮。
- 族裔、年代、地域、臉型、五官、體態、材質與個體差異。
- 純白背景、無文字、無水印、無多餘人物與錯誤肢體。

### 5.3 美術資產

保存 `art.json` 的場景錨點、光照狀態、場景變體、道具尺度、道具狀態及圖片 Prompt。場景圖必須空景無人；道具圖必須白底、無人、無手並帶尺度短語。

### 5.4 劇本

保存 `script.json` 的集、場次與 flow 節拍。動作與台詞分開；台詞保存 speaker、line、delivery；以字速與動作秒數估算時長。每場至少一個動作節拍，開場鉤子與結尾懸念必須落在具體節拍。

### 5.5 分鏡

保留集、段、切與節拍認領結構，但 Flow 編譯規則改為：

- 每一個 Cut 產生一個 Flow 影片 Job。
- Job 秒數為 4、6 或 8 秒，永遠不超過 8 秒。
- 每個劇本節拍被恰好一個 Cut 認領。
- 換場必開新 Segment。
- 台詞估算秒數不得超過 Job 秒數。
- `h3Prompt` 保留為相容輸出；Flow 使用獨立 `veoPrompt`。

## 6. Flow Prompt Compiler

Flow Prompt 由結構化資料確定性編譯，不接受模型自行遺漏鎖定項目。內容順序固定：

1. `STYLE & WORLD`：畫風、年代、地域、色彩、材質與光線。
2. `REFERENCE BINDINGS`：C／S／P ID，由自動化直接選擇 Flow 素材。
3. `START STATE`：位置、姿勢、視線、服裝、道具狀態與空間關係。
4. `0–8 SECOND ACTION`：依時間順序描述一個可生成的常見動作。
5. `CAMERA`：景別、角度、焦段、距離與運鏡。
6. `DIALOGUE & AUDIO`：逐字繁中台詞、語氣、環境聲與配樂。
7. `CONTINUITY LOCKS`：禁止改變的角色身分、服裝、場景、道具、光照與空間關係。
8. `NEGATIVE`：禁止額外人物、物件瞬移、錯誤肢體、文字、水印與風格漂移。

Prompt 本文使用角色外觀描述與穩定標籤，不靠角色姓名誘發模型記憶。Flow 素材選擇依 `assetBindings` 完成，不靠全文人名模糊比對。

## 7. Flow Job Manifest

```ts
type FlowJobKind =
  | "character-sheet"
  | "scene-sheet"
  | "prop-sheet"
  | "storyboard-frame"
  | "veo-segment";

interface FlowJobManifest {
  id: string;
  projectId: string;
  kind: FlowJobKind;
  sourceDocumentVersion: number;
  sourceEntityId: string;
  prompt: string;
  negativePrompt?: string;
  assetBindings: string[];
  inputAssetIds: string[];
  outputMode: "image" | "video";
  modelName: string;
  aspectRatio: "16:9" | "9:16";
  durationSec?: 4 | 6 | 8;
  dependencies: string[];
  retryPolicy: RetryPolicy;
}
```

角色與美術設計表固定 16:9；分鏡圖與影片遵循專案的 16:9 或 9:16。

## 8. Flow 自動化架構

### 8.1 元件

- `FlowPageDetector`：確認目前分頁與 Flow 專案狀態。
- `FlowCapabilityScanner`：掃描圖片／影片模型、比例、模式及可用操作。
- `FlowDomAdapter`：定位明確的可互動元素、設定值並讀回驗證。
- `FlowAssetBinder`：上傳圖片、建立／更新角色素材、選取角色／場景／道具。
- `FlowSubmissionController`：填入 Prompt、送出並建立 result baseline。
- `FlowResultObserver`：監測新媒體、辨識完成／失敗／逾時。
- `FrameExtractor`：從影片最後 0.1 秒擷取 PNG。
- `AutomationStateMachine`：保存 Job 狀態、重試、暫停與續跑。
- `AutomationDebugLog`：保存安全診斷資訊，不保存 API Key。

### 8.2 狀態

`pending → preflight → configuring → binding-assets → submitting → waiting → capturing → validating → completed`

另有 `paused`、`retrying`、`failed`、`cancelled`。每次狀態轉換寫入 checkpoint；重新開啟 Side Panel 後可從最後安全狀態續跑。

### 8.3 操作原則

- 模式、模型、比例與秒數設定後必須讀回驗證。
- 找不到明確元素時停止並輸出候選標籤，不使用座標盲點擊。
- DOM Selector 按 Flow 介面語言與能力分組，集中在 adapter，不散落於 UI。
- 所有自動化訊息含 jobId 與 projectId，避免多任務交叉。
- Chain 任務固定 concurrency 1；獨立圖片任務可配置低並發。

## 9. 角色與素材自動生成

使用者在角色頁按「在 Flow 生成三視圖」後：

1. 編譯 `character-sheet` Job。
2. 切換 Flow 圖片模式。
3. 選取使用者指定圖片模型。
4. 設定 16:9 並填入 `image.sheet`。
5. 送出並等待新圖片。
6. 保存原圖與縮圖至 IndexedDB。
7. 進入 Flow 角色功能，建立或更新同名角色素材。
8. 重新掃描並驗證名稱與縮圖。
9. 保存 Flow 綁定資訊至角色資產。

若同名角色有多個，停止並要求人工選擇；不自動覆蓋不確定的素材。

首張角色圖完成後進入品質停靠點。系統檢查檔案、比例與解析度；使用者確認面部一致、三個全身像等高、服裝正確。核准後批次處理其他角色、場景與道具。

## 10. 8 秒影片與尾幀鏈

### 10.1 連續動作

同場景且動作／鏡位可自然延續時：上一段影片 → 擷取尾幀 → 帶入 continuity locks 與下一個動作 → Flow 幀轉影片。

### 10.2 換鏡位

景別、角度或構圖顯著改變時，不直接把尾幀當最終首幀。使用尾幀狀態、角色三視圖、場景圖與道具圖生成新的 storyboard frame，再以該圖進入 Flow 幀轉影片。

### 10.3 換場

使用新場景的設定圖與該場第一鏡 storyboard frame，不繼承上一場背景；只繼承劇情需要的角色服裝與攜帶道具狀態。

### 10.4 第二品質停靠點

第一支影片完成後暫停，確認臉部、服裝、場景、動作方向及尾幀可接續。核准後批次執行剩餘 Job。任何失敗保留最後成功影片、尾幀與狀態快照。

## 11. 模型與設定

設定頁分成三組：

- 故事／JSON 文字供應商與模型。
- Flow 圖片模型。
- Flow 影片模型。

已知 Flow 圖片模型快取種子：Nano Banana Pro、Nano Banana 2、Nano Banana 2 Lite。  
已知 Flow 影片模型快取種子：Omni Flash、Veo 3.1 - Lite、Veo 3.1 - Fast、Veo 3.1 - Quality。

執行規則：

- Flow 開啟時掃描當前清單。
- 使用者分別選定一個圖片模型與一個影片模型。
- 選擇保存至 `chrome.storage.local`。
- 建立 Job 時把模型名稱快照寫入 manifest，避免執行途中被設定變更影響。
- 送出前切換並讀回模型名稱。
- 找不到指定模型時暫停，不擅自降級。

## 12. 工作台資訊架構

- 專案：故事、集數、時長、題材、畫風、比例、匯入／匯出。
- 內容管線：五段狀態、品質門、版本、單段重跑與重跑後續。
- 素材工作室：角色三視圖、場景圖、道具圖、Prompt 與 Flow 綁定。
- 劇本：分集、場次、動作、台詞、語氣與時長儀表。
- 分鏡導演：Cut、首幀、上一段尾幀、鏡位、Continuity 與 Veo Prompt。
- Flow 佇列：任務狀態、模型、比例、暫停、重試、續跑、影片與尾幀。
- 設定／除錯：供應商、模型掃描、權限狀態、遮罩後日誌與匯出。

## 13. 錯誤處理

- API 429、5xx：有限次退避重試。
- API 401、403：立即停止並提示認證問題。
- Provider JSON 不合法：fenced JSON、純 JSON、一次修復；仍失敗則保存 raw response，不建立半成品。
- Flow 未登入、分頁關閉、模型不存在、比例不符、素材綁定不確定：暫停等待人工處理。
- Flow 結果逾時或內容安全拒絕：保存 Job、錯誤文字與可安全重試狀態。
- DOM 變更：輸出 adapter 階段、採用的選擇器策略與可見候選標籤。
- 日誌不得包含 API Key、完整授權標頭或敏感專案內容。

## 14. 安全與權限

- MV3 host permissions 僅限 Google Flow 所需的 `labs.google` 路徑。
- 自動化必須由明確使用者操作啟動。
- API Key 保存在 `chrome.storage.local`，不進 Project JSON、bundle、console 或錯誤物件。
- 內容腳本只接收已編譯 Job，不接收 API Key。
- 下載與 Blob 存檔沿用 Chrome API；每個媒體結果以 jobId 關聯。

## 15. 來源整合原則

- `shuohao-skills` 的 Apache-2.0 契約、流程與品質門可移植為瀏覽器相容 TypeScript，保留必要授權與 NOTICE。
- `E:\My build\flow-automation` 經使用者確認為 MIT 授權，可複製、修改、合併及重構其中已驗證的自動化程式碼。
- 移植時保留原始 MIT copyright 與 permission notice，並在 Flow Companion 加入 `THIRD_PARTY_NOTICES.md`；Apache-2.0 與 MIT 來源分別標示，不混寫授權歸屬。
- 即使允許複製，仍將大型單檔 JavaScript 拆成 TypeScript Automation Adapter、狀態機、模型／模式選擇、素材綁定、結果監測與尾幀模組，以便測試和維護。

## 16. 測試與驗收

### 16.1 Domain 與 Skill 契約

- 五份 JSON schema 正反例。
- 穩定 ID、引用解析、版本與 stale 依賴。
- 角色、場景、道具、劇本與分鏡品質門。
- 舊版 1.0 Project 匯入至 2.0 的可逆備份與遷移結果。

### 16.2 Prompt

- 角色三視圖 Prompt 包含所有版面與一致性硬條件。
- 場景無人、道具白底無手與尺度條件。
- Flow Prompt 包含 reference bindings、start state、action、camera、dialogue、locks 與 negative。
- 任一 Cut 不超過 8 秒，台詞可裝入指定秒數。

### 16.3 Automation Adapter

- 使用 DOM fixture 測試繁中、簡中與英文標籤。
- 切換圖片／影片模式後讀回驗證。
- 使用者選定模型被精確套用；找不到時暫停。
- 比例只允許 16:9／9:16。
- 上傳參考圖、填入 contenteditable／textarea、送出與結果 baseline。
- 不使用座標盲點擊。

### 16.4 連續性

- 同鏡連續動作使用尾幀。
- 換鏡位使用尾幀狀態重建首幀。
- 換場不錯誤繼承舊場景。
- 角色、服裝、道具、光照與空間鎖不可無授權改變。
- 中斷後從最後成功 checkpoint 恢復。

### 16.5 Extension Smoke Test

- 點擊擴充套件可開啟 Side Panel。
- 非 Flow 網站不注入自動化。
- Flow 分頁關閉或登入失效時安全暫停。
- 角色三視圖完整生成並綁定 Flow 角色。
- 第一支影片停靠點核准後完成至少三段尾幀接續。
- Project JSON round-trip 不包含 API Key，媒體 metadata 與穩定 ID 保留。

## 17. 版本里程碑

每次程式修改依使用者要求增加 `0.0.1`：

- 0.1.18：Project V2、五份原生契約、版本與遷移。
- 0.1.19：品質門與真正的五段 Pipeline Runner。
- 0.1.20：素材工作室與角色／場景／道具 Flow 圖片 Job。
- 0.1.21：Flow DOM Adapter、模型掃描、模式／比例／模型驗證。
- 0.1.22：劇本、8 秒分鏡與 Flow Prompt Compiler。
- 0.1.23：影片 Job、尾幀擷取、換鏡首幀與 Continuity Gate。
- 0.1.24：佇列、checkpoint、重試、日誌與完整 UI。
- 0.1.25：整合測試、Chrome smoke test 與可載入 dist。

## 18. 完成標準

一個任意題材專案能從故事一路產生五份合法 JSON；角色頁能在 Flow 生成三視圖並建立角色素材；場景與道具能建立參考圖；劇本可生成逐句台詞；分鏡可拆成最長 8 秒的 Flow Job；自動化能依使用者設定切換圖片／影片模型與 16:9／9:16；第一段核准後至少連續產生三支影片，後兩支使用正確尾幀或重建首幀；中斷後能續跑，且 API Key 不出現在輸出與日誌。
