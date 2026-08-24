# Flow-Worker Cut-first 分鏡連續性與影片 Prompt 管線設計

**日期：** 2026-08-24
**狀態：** 待使用者審核
**目標版本：** 下一個 patch 版本（實作開始時遞增）

## 1. 背景與決策

Flow-Worker 已能從結構化 storyboard 文件編譯影片 Flow jobs，但目前的 continuity 資訊仍主要是文字鎖定與簡單 scene dependency。新的需求是：腳本生成後載入分鏡導演，按劇情節拍切分各段影片所需的 Cut，產出可直接送往 Google Flow 的影片 prompt；由於 Flow 單次影片生成上限為 8 秒，每個 Cut 必須獨立送入 Flow，完成後再依 Segment Manifest 由本機 ffmpeg 或其他外部工具合成完整 Segment。

本設計採用以下已確認決策：

| 決策 | 定義 |
|---|---|
| 生成單位 | 每個 Cut 是一次獨立的 Google Flow video job。 |
| 生成時長 | Cut 只允許 **4、6、8 秒**；第一版不把 2–5 秒分鏡時長映射後再自動裁切。 |
| Segment | Segment 是同一場景內的劇情容器，不直接送入 Flow；它由多個 Cut 組成。 |
| 合成 | 第一版不在 Chrome extension 內編碼 MP4，只輸出按順序整理的影片檔與 `Segment Manifest`；外部本機 ffmpeg 或其他工具負責合成。 |
| 劇情權責 | 劇本管戲，分鏡管拍；分鏡不可自行新增未經劇本支持的劇情結果。 |
| 連續性預設 | 新 Cut 預設只允許 Camera 改變；人物、服裝、比例、姿勢、位置、道具、場景與光線均繼承上一 Cut，除非劇本節拍明確解除鎖定。 |

`shuohao-skills` 的 novel-script 明確將劇本限制在場次、節拍與台詞，不處理鏡號與畫面生成 prompt；novel-storyboard 再把節拍認領、鏡頭與影片提示詞交給下一層。[1] 本專案會保留這個資料邊界，但把原本 Segment ≤15 秒、Cut 2–5 秒的模型改為本專案的 Flow-specific 規則：**Cut 4／6／8 秒，Segment 由 Cut 合成。**

## 2. 目標與非目標

### 2.1 目標

第一版必須讓使用者能從已產出的 script document 載入劇情，將場次與節拍拆成不跨場的 Segment／Cut，為每個 Cut 建立前後 Shot State、Continuity Lock、Action Transition 檢查與可直接送入 Flow 的英文影片 prompt。每個 Cut 必須能獨立加入 Flow 佇列、執行、重試、保存影片結果與回報狀態；Segment 必須在所有 Cut 完成且順序與連續性檢查通過後，產出可供外部合成的 manifest。

### 2.2 非目標

第一版不在擴充套件內合成 MP4，不實作 WebCodecs、ffmpeg.wasm 或其他瀏覽器編碼器；不修改劇本台詞、不讓分鏡模型重新決定故事、不將 H3 專屬控制語法直接當成 Google Flow 的原生 API；不保證 Google Flow DOM 改版後仍可無修改執行；不宣稱已完成真實 Google 帳戶 smoke test。

## 3. 現有程式與設計差距

目前 `storyboard-job-compiler.ts` 已經逐 Cut 產生 `FlowJobManifest`，並拒絕超過 8 秒的 Cut；這是本設計的可重用基礎。然而它目前仍以 `kind: "veo-segment"` 命名 job，duration 會把任意正數映射到 4／6／8，prompt 主要使用 segment／cut 的文字欄位，dependency 只依相鄰 scene ID 做簡單判斷，尚未保存前後 Shot State、allowed／forbidden changes、transition blocker 或 Segment-level manifest。

既有 `storyboard.ts` 已要求每個 Cut 有 `beats` 與 4／6／8 秒 duration，`veo-prompt-compiler.ts` 也已有 `STYLE & WORLD`、`START STATE`、`0–8 SECOND ACTION`、`CAMERA`、`DIALOGUE & AUDIO`、`CONTINUITY LOCKS`、`NEGATIVE` 等段落。因此實作應採**向後相容的擴充**：保留現有 prompt sections 與舊 storyboard input 讀取能力，新增更嚴格的 Cut metadata、state compiler、continuity gates 與 segment orchestration，而不是另建第二套 storyboard pipeline。

## 4. 核心資料模型

### 4.1 Cut duration

`FlowDuration` 繼續定義為 `4 | 6 | 8`。新的 compiler 在正式模式下只接受這三個值；不再將 2、3、5 或其他正數靜默向上映射。若輸入非 4／6／8，必須回傳可理解的 validation error，要求使用者在分鏡導演中重新選擇 Flow 原生時長。

### 4.2 Beat claim

每個 Cut 必須保存 `beatIds`，至少一個，且所有 beat claim 必須包含：`episodeId`、`sceneId`、`beatId`、順序、動作文字、台詞文字、角色 IDs、場景 ID、道具 IDs 與 source duration。驗證器必須檢查：Cut 不得跨 scene；同一 scene 的 beats 必須連續；每個 beat 恰好被一個 Cut 認領；不可漏拍、重拍或亂序。

### 4.3 Shot State

每個 Cut 保存 `previousState` 與 `currentState`。初始 Cut 的 previous state 由角色卡、場景卡、道具卡與劇本起始狀態建立；後續 Cut 的 previous state 取前一 Cut 的 current state。建議結構如下：

```ts
type ShotState = {
  characters: Record<string, {
    identityRef: string;
    pose: string;
    position: string;
    facing: string;
    eyeLine: string;
    scale: string;
    costumeRef: string;
    heldPropIds: string[];
  }>;
  environment: {
    sceneId: string;
    spatialAnchors: Array<{ id: string; description: string; worldPosition?: string; visible: boolean }>;
    lighting: string;
    weather?: string;
  };
  camera: {
    shotSize: string;
    lensMm?: number;
    height?: string;
    angle?: string;
    distance?: string;
    axis: string;
    movement: string;
    framing: string;
  };
};
```

模型可以協助填寫候選 state，但正式送 Flow 前必須由 schema 與 deterministic gate 驗證必要欄位；不能只因模型輸出一段自然語言就視為已鎖定。

### 4.4 Continuity Lock

每個 Cut 保存可讀取的 `continuityLocks`、`allowedChanges` 與 `forbiddenChanges`。預設鎖定項目包含：人物 identity、臉部、髮型、身高與體型、服裝與配件、人物比例、人物間距、姿勢、站位、面向、視線、持有道具、道具世界位置、場景空間、光線方向、光線色溫與 180° axis。Camera 是預設唯一允許變化的群組。

若 script beat 明確要求「趙王轉身」「趙王走向龍椅」「趙王坐下」，compiler 才能依 beat 建立相應的 allowed changes。若 current state 直接從 `standing` 跳到 `seated-on-throne`，而中間沒有可支持的 transition beat，必須產生 `action-transition` blocker。

### 4.5 Segment Manifest

Segment-level manifest 不取代 per-Cut `FlowJobManifest`，而是保存合成所需的順序與結果：

```ts
type SegmentManifest = {
  id: string;
  projectId: string;
  episodeId: string;
  sceneId: string;
  status: "planned" | "generating" | "ready-to-assemble" | "assembled" | "blocked";
  cutOrder: Array<{
    cutId: string;
    jobId: string;
    durationSec: 4 | 6 | 8;
    videoAssetId?: string;
    localFileName?: string;
    startTimeSec: number;
    endTimeSec: number;
    continuityScore: number;
  }>;
  totalDurationSec: number;
  assembly: {
    tool: "external-ffmpeg" | "external-tool";
    outputFileName: string;
    concatListFileName: string;
  };
  blockers: string[];
  createdAt: string;
  updatedAt: string;
};
```

第一版 `ready-to-assemble` 只代表所有 Cut 結果已取得、順序已確認、每個 Cut 的 manifest metadata 完整；`assembled` 只能由外部合成完成後透過匯入／確認流程標記，不能由 Flow job 完成事件直接設定。

## 5. Script → Storyboard Director 流程

分鏡導演新增「載入劇本」動作，來源是目前 project 的 script document。載入後顯示集、場次與 beat timeline，並讓使用者選擇單集或單一場次產生分鏡。模型只被要求提出 Cut 拆分、景別、鏡位與 prompt 候選；它不得新增角色、場景、道具或修改台詞。輸出要先經 deterministic normalization，再進 continuity gates。

Cut planner 的輸入包含：script beats、角色 canonical visual prompts、場景與道具 references、上一 Cut state、project aspect ratio、可用 Flow durations `{4,6,8}` 與 prompt language。Cut planner 的輸出包含：Cut ID、beat claims、duration、camera、action、dialogue、audio、reference IDs、previous/current state、locks、allowed／forbidden changes 與 draft prompt。

畫面上每個 Cut 必須可展開檢視：認領的劇本節拍、生成秒數、前一狀態、目前狀態、連續性鎖、允許變化、禁止變化、連續性分數、blockers、參考素材與最終 Flow prompt。只有沒有 blocker 的 Cut 才能加入佇列；被阻擋的 Cut 可選擇「修正 prompt」「新增 transition cut」或由使用者明確確認跳接並留下 audit record。

## 6. Prompt Continuity Compiler

新 compiler 應擴充既有 `compileVeoPrompt`，對外提供明確的 Cut-oriented API，例如 `compileCutVideoPrompt(input)`。輸出固定包含以下順序：

```text
PROJECT / EPISODE / SEGMENT / CUT
STYLE & WORLD
REFERENCE BINDINGS
PREVIOUS CUT STATE
CONTINUITY LOCKS
CURRENT CUT ACTION
CAMERA & FRAMING
ALLOWED CHANGES
FORBIDDEN CHANGES
DIALOGUE & AUDIO
GENERATION CONSTRAINTS
NEGATIVE
```

`GENERATION CONSTRAINTS` 必須明確寫入：single continuous video, exactly 4/6/8 seconds according to the job, preserve identity and spatial continuity, no text, no watermark。對 Flow 而言，prompt 以模型無關的自然語言為主；H3 的 `<d>` 或其他專屬語法只能保留在 storyboard metadata 或 export adapter，不應直接假定 Flow 會解析它。

對每個 Cut，compiler 必須將 `previousState` 中的鎖定內容寫入 prompt，而不是只寫「保持連貫」。例如上一鏡趙王站立時，prompt 必須明示 `Zhao Wang remains standing`，並把 `seated on the throne` 放入 forbidden changes；若此 Cut 只換鏡位，也要明示 throne 的空間關係與人物比例不變。

## 7. Continuity Gates

新增 deterministic gates，至少包含：

| Gate | 阻擋條件 |
|---|---|
| `cut.duration` | duration 不是 4、6、8。 |
| `beat.coverage` | beat 漏認領、重複認領、跨 scene 或亂序。 |
| `state.required` | character、environment、camera 的必要 state 缺失。 |
| `character.identity` | current state 改變 identity、服裝、臉部或身體比例但沒有 allowed change。 |
| `pose.transition` | standing／seated／lying 等狀態跳變，缺少對應 transition beat。 |
| `spatial.anchor` | 龍椅、桌案、柱子、玉璧等 anchor 無故移動、消失或出現。 |
| `scale.lock` | 人物比例、人物間距、鏡頭距離或 framing 跳變且沒有 camera／movement 解釋。 |
| `camera.axis` | 180° 軸線或視線關係被改變但沒有明確 camera transition。 |
| `reference.binding` | 角色、場景或道具 reference ID 不存在或未綁定。 |
| `prompt.completeness` | 最終 prompt 缺少前狀態、連續性鎖、當前動作、鏡位或禁止變化。 |

Continuity score 分項至少包含 identity、costume、pose、position、scale、props、environment、lighting、camera；任何 blocker 都必須列入 Segment manifest，不能只顯示一個總分。

## 8. Flow Queue 與自動化

Flow queue 的執行單位是 Cut job。現有 `FlowJobManifest` 需新增或擴充 `segmentId`、`cutId`、`beatClaims`、`previousState`、`currentState`、`allowedChanges`、`forbiddenChanges`、`continuityScore` 與 `referenceAssetIds` 等 metadata；既有 `sourceEntityId` 仍保留作為相容 fallback。

佇列執行時按照 episode → segment → cut 順序送入 Auto-Flow。每個 job 只帶自己的 4／6／8 秒、模型、比例、prompt 與 references snapshot；不可讓下一個 Cut 覆蓋上一個 Cut 的設定。每個 Cut 的成功事件只更新該 Cut 的 `videoAssetId`，並把上一 Cut 的輸出作為下一 Cut 的可選 continuity input。結果觀察器若取得影片尾幀，應保存為 Cut output metadata，但不能把尾幀直接當成下一 Cut 的唯一狀態來源；下一 Cut 仍以結構化 Shot State 為 canonical state。

若某 Cut 失敗，該 Cut 可獨立 retry；後續 Cut 預設暫停，避免在前一 Cut 未完成時繼續生成造成 continuity chain 斷裂。使用者可以選擇「以既有輸出繼續」或「從該 Cut 重新生成」，兩者都要寫入 checkpoint。

## 9. Segment Manifest 匯出與外部合成

Flow-Worker 新增 Segment Manifest export，不直接在瀏覽器內編碼。匯出包至少包含：

```text
segment-E01-S03/
├── segment-manifest.json
├── concat-list.txt
├── prompts/
│   ├── C01-prompt.txt
│   ├── C02-prompt.txt
│   └── ...
├── metadata/
│   └── continuity.json
└── videos/
    ├── C01-<asset>.mp4
    ├── C02-<asset>.mp4
    └── ...
```

`concat-list.txt` 由已完成的 Cut 順序產生，並以 manifest 中的 `startTimeSec`／`endTimeSec` 為檢查依據。第一版不假設每個 Flow 輸出檔案的 codec、frame rate 或 audio stream 完全相同；匯出時需在 manifest 標記檔案 metadata，外部 ffmpeg 流程再依使用者指定的 normalization 參數合成。若缺少任何 Cut video asset，export 必須阻擋並列出缺少的 Cut ID。

## 10. 版本相容與遷移

既有 storyboard JSON 若只有 `episodes[].segments[].cuts[]`、`beats`、`durationSec`、`veoPrompt` 或 `h3Prompt`，仍可載入。migration 會：

1. 將 segment-level prompt 欄位搬入相應 Cut 的 draft action／style fallback。
2. 將缺少的 `previousState`、`currentState` 標記為 `needs-state-review`，不假裝已通過 continuity gate。
3. 將既有 `veo-segment` job 以 `cutId` 作 source entity fallback，但新 job 使用 `cut-video` 語意。
4. 對非 4／6／8 的舊 duration 顯示需要使用者重新選擇，不自動變更舊文件資料。
5. 舊 job 沒有 Segment Manifest 時，只能重新從 Storyboard Director 加入佇列，不能用不完整記錄直接執行。

實作每次程式變更都依專案規則遞增 patch version；若 manifest、資料模型與佇列協定同時變更，版本升級必須同步 `package.json`、`package-lock.json`、根 manifest、`public/manifest.json` 與 dist 驗證。

## 11. 測試策略與驗收條件

實作採 RED → GREEN：先新增 failing tests，再實作。最低測試範圍如下：

| 測試群組 | 必測情境 |
|---|---|
| Script loader | 從 script document 正確載入 episode、scene、beat、角色／場景／道具 IDs；不改寫台詞。 |
| Cut planner | 不跨 scene、beat 恰好一次且順序連續；只產生 4／6／8 秒。 |
| State compiler | 初始 state、前一 Cut state、角色比例、道具 anchor、鏡位與光線正確繼承。 |
| Transition gate | standing→seated 缺少 transition beat 必須 blocker；有完整過渡節拍才通過。 |
| Prompt compiler | prompt 按固定 sections 產生，包含 previous state、allowed／forbidden changes 與 duration constraint。 |
| Continuity gates | 龍椅突然出現、人物比例跳變、180° 軸線破壞、reference ID 缺失都被阻擋。 |
| Flow job compiler | 每個 Cut 一個 immutable job，保存 segment／cut／beat／state metadata 與 4／6／8 duration。 |
| Queue orchestration | Cut 依序執行、單 Cut retry、前一 Cut 失敗時後續暫停、結果回寫正確。 |
| Segment manifest | 只在所有 Cut 完成後進入 `ready-to-assemble`；缺檔時 export 阻擋；順序與 concat list 正確。 |
| UI | 可載入劇本、檢視每個 Cut 的 prompt／locks／blockers、只將通過 gate 的 Cut 加入佇列。 |
| Regression | 既有 storyboard、Veo prompt、Flow queue、Auto-Flow-Free 與 provider tests 不回歸。 |

驗收時至少必須通過 `npm test`、`npm run typecheck`、`npm run build`、dist manifest 檢查與 secret scan。真實 Google Flow smoke test 必須由使用者在已登入的 Flow 頁面執行；自動化測試不使用或要求使用者在聊天中提供 API Key。

## 12. 實作順序

實作批准後依以下順序進行：

1. 擴充 storyboard／Cut schema 與 migration，先保留舊格式讀取。
2. 建立 Script loader、beat claim normalizer 與 Cut duration validator。
3. 建立 Shot State、Continuity Lock、Action Transition 與 deterministic gates。
4. 擴充 Cut video prompt compiler 與 storyboard job compiler。
5. 擴充 StoredJobRecord、Segment Manifest store／export 與 queue orchestration。
6. 更新 Storyboard Director UI、Cut details、blocker review 與加入佇列流程。
7. 接入既有 Auto-Flow executor 的 Cut video job metadata 與結果回寫。
8. 以 TDD focused tests、完整 tests、typecheck、build 與 dist audit 完成驗證。

## References

[1]: https://github.com/eternityspring/shuohao-skills/blob/main/skills/novel-script/SKILL.md "shuohao-skills novel-script"
[2]: https://github.com/eternityspring/shuohao-skills/blob/main/skills/novel-storyboard/SKILL.md "shuohao-skills novel-storyboard"
[3]: https://chatgpt.com/share/6a8bafab-9554-83ee-8d1c-d083e6205807 "使用者提供的分鏡連續性設計討論"
