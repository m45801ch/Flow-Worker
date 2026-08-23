# Flow Companion × Google Flow Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將現有 0.1.17 Chrome Side Panel 重建為保留五份 shuohao 原生契約、可在 Google Flow 自動生成素材與最長 8 秒連續影片的單一擴充套件。

**Architecture:** 以版本化的 outline／cast／art／script／storyboard 文件作唯一內容來源，先編譯成不可變的 `FlowJobManifest`，再交由只在 `labs.google` 執行的 TypeScript Automation State Machine。圖片、影片與尾幀存 IndexedDB，設定與模型快取存 `chrome.storage.local`；Flow DOM 互動集中在 adapter，任何狀態未讀回驗證都不得送出。

**Tech Stack:** TypeScript、React、Vite、Chrome Manifest V3、Vitest、Testing Library、Zod、idb、Chrome sidePanel/content scripts/storage/downloads API。

## Global Constraints

- 每次程式修改將 `package.json`、`public/manifest.json`、根目錄 `manifest.json` 版本同步增加 `0.0.1`。
- Flow 影片 Job 秒數只能是 4、6、8，且不得超過 8 秒。
- 專案影片比例只能是 `16:9` 或 `9:16`；角色／場景／道具設定表固定 `16:9`。
- Flow 圖片模型與影片模型由使用者分別指定；找不到時暫停，不自行降級。
- API Key 不進 Project JSON、bundle、內容腳本訊息、console 或錯誤物件。
- 自動化只在使用者啟動後執行，只允許 `labs.google` Flow 路徑。
- 不呼叫非公開 Flow API，不使用座標盲點擊，不自動付費或購買額度。
- shuohao-skills 保留 Apache-2.0 NOTICE；flow-automation 移植保留 MIT copyright 與 permission notice。
- 每個任務先寫失敗測試，再做最小實作；每個版本里程碑必須通過 `npm test`、`npm run typecheck`、`npm run build`。
- 執行前若仍無 `.git`，先建立可恢復的專案快照；只有取得使用者同意才執行 `git init` 與 commit。

---

## File Structure

```text
src/domain/contracts/       五份 Skill 原生 TypeScript/Zod 契約
src/domain/gates/           確定性品質門與 GateReport
src/domain/project-v2.ts    ProjectDocumentV2 與版本歷史
src/domain/migration.ts     1.0 → 2.0 遷移
src/pipeline/stages/        五段 prompt、runner、seed 與 repair
src/flow/jobs/              FlowJobManifest 與 Prompt compiler
src/flow/automation/        狀態機、checkpoint、重試策略
src/flow/dom/               Flow DOM adapter、能力掃描、素材綁定
src/flow/media/             結果監測、Blob、尾幀與 continuity
src/sidepanel/views/        專案、管線、素材、劇本、分鏡、佇列、設定
src/sidepanel/components/   共用版本、品質門、Prompt、媒體元件
src/storage/                IndexedDB project/assets/jobs repositories
THIRD_PARTY_NOTICES.md      Apache-2.0 與 MIT attribution
```

## Task 1: Project V2、原生契約與遷移（0.1.18）

**Files:**
- Create: `src/domain/contracts/outline.ts`
- Create: `src/domain/contracts/cast.ts`
- Create: `src/domain/contracts/art.ts`
- Create: `src/domain/contracts/script.ts`
- Create: `src/domain/contracts/storyboard.ts`
- Create: `src/domain/project-v2.ts`
- Create: `src/domain/migration.ts`
- Test: `src/domain/project-v2.test.ts`
- Test: `src/domain/migration.test.ts`
- Modify: `src/domain/project.ts`
- Modify: `src/storage/project-store.ts`
- Modify: `src/sidepanel/main.tsx`
- Modify: `package.json`, `public/manifest.json`, `manifest.json`

**Interfaces:**
- Produces: `ProjectDocumentV2`, `VersionHistory<T>`, `migrateProjectV1(input): ProjectDocumentV2`, five Zod schemas.
- Consumes: existing `ProjectDocument` only as migration input.

- [ ] **Step 1: Write failing contract and migration tests**

```ts
it("preserves five native documents without flattening", () => {
  const project = createProjectV2("Test");
  expect(project.schemaVersion).toBe("2.0");
  expect(Object.keys(project.documents)).toEqual(["outline", "cast", "art", "script", "storyboard"]);
});

it("backs up and migrates v1 stable ids", () => {
  const migrated = migrateProjectV1(v1Fixture);
  expect(migrated.migration?.sourceSchemaVersion).toBe("1.0");
  expect(migrated.assets.entities.some(x => x.id === "char-1")).toBe(true);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/domain/project-v2.test.ts src/domain/migration.test.ts`  
Expected: FAIL because `createProjectV2` and `migrateProjectV1` do not exist.

- [ ] **Step 3: Implement exact V2 core types**

```ts
export type VersionEntry<T> = { version: number; createdAt: string; source: "ai" | "human" | "migration"; data: T };
export type VersionHistory<T> = { currentVersion: number | null; stale: boolean; entries: VersionEntry<T>[] };
export type ProjectDocuments = {
  outline: VersionHistory<OutlineDocument>;
  cast: VersionHistory<CastDocument>;
  art: VersionHistory<ArtDocument>;
  script: VersionHistory<ScriptDocument>;
  storyboard: VersionHistory<StoryboardDocument>;
};
export interface ProjectDocumentV2 {
  schemaVersion: "2.0";
  project: ProjectMetadata;
  documents: ProjectDocuments;
  assets: AssetRepositoryIndex;
  flow: FlowWorkspaceState;
  jobs: FlowJobRecord[];
  migration?: { sourceSchemaVersion: "1.0"; sourceBackup: unknown };
}
```

- [ ] **Step 4: Make import/export and IndexedDB accept V2 and preserve a V1 backup**

Implement `parseProject(raw)` as: parse JSON → return V2 if schema 2.0 → validate and call `migrateProjectV1` if 1.0 → reject every other schema. Never mutate the parsed input.

- [ ] **Step 5: Remove hard-coded footer version**

Read `chrome.runtime.getManifest().version` in extension mode and `package.json`-injected `__APP_VERSION__` in Vite preview, so future version increments cannot leave the footer stale.

- [ ] **Step 6: Verify and bump version**

Run: `npm test && npm run typecheck && npm run build`  
Expected: all tests pass and `dist/manifest.json` reports `0.1.18`.

## Task 2: shuohao 品質門與真正 Pipeline Runner（0.1.19）

**Files:**
- Create: `src/domain/gates/types.ts`
- Create: `src/domain/gates/outline-gates.ts`
- Create: `src/domain/gates/cast-gates.ts`
- Create: `src/domain/gates/art-gates.ts`
- Create: `src/domain/gates/script-gates.ts`
- Create: `src/domain/gates/storyboard-gates.ts`
- Create: `src/pipeline/stages/outline-runner.ts`
- Create: `src/pipeline/stages/cast-runner.ts`
- Create: `src/pipeline/stages/art-runner.ts`
- Create: `src/pipeline/stages/script-runner.ts`
- Create: `src/pipeline/stages/storyboard-runner.ts`
- Test: `src/domain/gates/gates.test.ts`
- Test: `src/pipeline/stages/stages.test.ts`
- Modify: `src/pipeline/generators.ts`, `src/pipeline/types.ts`
- Create: `THIRD_PARTY_NOTICES.md`
- Modify version files.

**Interfaces:**
- Produces: `GateReport`, `runGates(stage, document, upstream)`, `StageRunner<I,O>.run()`.
- Consumes: V2 documents and existing `GenerationPort`.

- [ ] **Step 1: Write failing quality-gate tests from shuohao examples**

```ts
it("rejects a character sheet prompt without three-view layout", () => {
  const report = runCastGates(castWithoutSheetLayout);
  expect(report.blockers.map(x => x.code)).toContain("cast.sheet-layout");
});

it("rejects storyboard cuts over eight seconds", () => {
  const report = runStoryboardGates(storyboardWithNineSecondCut, scriptFixture);
  expect(report.blockers.map(x => x.code)).toContain("storyboard.flow-max-8s");
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- src/domain/gates/gates.test.ts src/pipeline/stages/stages.test.ts`  
Expected: FAIL because gate modules are absent.

- [ ] **Step 3: Port deterministic gates and exact schemas**

Use pure functions returning `{ passed, blockers, warnings, metrics }`; do not call a provider inside gates. Port Apache-2.0 logic for field checks, references, timing and prompt-language rules, then add Flow `maxCutSeconds=8` adaptation.

- [ ] **Step 4: Replace generic schema prompts**

Each runner must send its exact JSON contract, upstream document versions and stage-specific instructions. Remove `schema: {stage,data:{}}` and recursive field guessing. A successful generation is stored only after Zod parse and zero blockers.

- [ ] **Step 5: Add attribution and verify 0.1.19**

Run: `npm test && npm run typecheck && npm run build`  
Expected: five example documents pass; malformed fixtures fail with named gate codes; version is `0.1.19`.

## Task 3: 素材工作室與 Flow 圖片 Job（0.1.20）

**Files:**
- Create: `src/flow/jobs/types.ts`
- Create: `src/flow/jobs/image-job-compiler.ts`
- Create: `src/sidepanel/views/AssetStudioView.tsx`
- Create: `src/sidepanel/components/CharacterSheetCard.tsx`
- Create: `src/sidepanel/components/ArtAssetCard.tsx`
- Create: `src/storage/asset-store.ts`
- Test: `src/flow/jobs/image-job-compiler.test.ts`
- Test: `src/sidepanel/views/AssetStudioView.test.tsx`
- Modify: `src/sidepanel/main.tsx`, `src/sidepanel/styles.css`, `src/storage/project-store.ts`
- Modify version files.

**Interfaces:**
- Produces: `compileCharacterSheetJob`, `compileSceneSheetJob`, `compilePropSheetJob`, `AssetStore`.
- Consumes: validated cast/art versions and saved Flow model settings.

- [ ] **Step 1: Write failing job-compiler tests**

```ts
it("compiles a 16:9 character sheet job with the selected image model", () => {
  const job = compileCharacterSheetJob(character, { imageModel: "Nano Banana 2" });
  expect(job).toMatchObject({ kind: "character-sheet", outputMode: "image", modelName: "Nano Banana 2", aspectRatio: "16:9" });
  expect(job.prompt).toContain("RIGHT-TOP ZONE");
  expect(job.prompt).toContain("PROPORTIONS ARE CRITICAL");
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/flow/jobs/image-job-compiler.test.ts src/sidepanel/views/AssetStudioView.test.tsx`  
Expected: FAIL because compiler and view are absent.

- [ ] **Step 3: Implement immutable FlowJobManifest and image compilers**

```ts
export interface FlowJobManifest {
  id: string; projectId: string; kind: FlowJobKind; sourceDocumentVersion: number;
  sourceEntityId: string; prompt: string; negativePrompt?: string;
  assetBindings: string[]; inputAssetIds: string[]; outputMode: "image" | "video";
  modelName: string; aspectRatio: "16:9" | "9:16"; durationSec?: 4 | 6 | 8;
  dependencies: string[]; retryPolicy: RetryPolicy;
}
```

- [ ] **Step 4: Build the Asset Studio**

Render complete persona, relationships, voice, image prompt, sheet prompt and negative prompt. Provide copy buttons and “在 Flow 生成” actions for every character, scene and prop; show queued/running/generated/Flow-bound states from jobs rather than local booleans.

- [ ] **Step 5: Implement Blob persistence and verify 0.1.20**

Run: `npm test && npm run typecheck && npm run build`  
Expected: image job manifests preserve source IDs and model; Blob round-trip retains MIME, dimensions and hash; version is `0.1.20`.

## Task 4: Flow DOM Adapter、模型掃描與角色素材綁定（0.1.21）

**Files:**
- Create: `src/flow/dom/query.ts`
- Create: `src/flow/dom/page-detector.ts`
- Create: `src/flow/dom/capability-scanner.ts`
- Create: `src/flow/dom/mode-adapter.ts`
- Create: `src/flow/dom/model-adapter.ts`
- Create: `src/flow/dom/prompt-adapter.ts`
- Create: `src/flow/dom/upload-adapter.ts`
- Create: `src/flow/dom/asset-binder.ts`
- Create: `src/flow/content-script.ts`
- Create: `src/flow/messages.ts`
- Test: `src/flow/dom/flow-dom.test.ts`
- Modify: `src/background/service-worker.ts`, `public/manifest.json`, `vite.config.ts`
- Port selected MIT logic from: `E:/My build/flow-automation/flow-automation.js`
- Modify version files.

**Interfaces:**
- Produces: `scanFlowCapabilities()`, `configureFlow(job)`, `bindFlowAssets(ids)`, `submitFlowJob(job)`.
- Consumes: `FlowJobManifest`; returns typed `FlowAutomationResult`.

- [ ] **Step 1: Create zh-TW/zh-CN/en DOM fixtures and failing tests**

```ts
it.each(["zh-TW", "zh-CN", "en"])("selects the exact configured models in %s", async locale => {
  mountFlowFixture(locale);
  await configureFlow(videoJob("Veo 3.1 - Quality", "9:16"));
  expect(readSelectedModel()).toBe("Veo 3.1 - Quality");
  expect(readSelectedAspect()).toBe("9:16");
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- src/flow/dom/flow-dom.test.ts`  
Expected: FAIL because adapters are absent.

- [ ] **Step 3: Port proven MIT interaction helpers into focused modules**

Reuse safe prompt-input detection, native React value setting, file input/DataTransfer upload, model/mode label matching and media baseline logic. Delete coordinate-click fallback. Every setter returns `{ ok, expected, actual, candidates }` after reading the UI state.

- [ ] **Step 4: Add MV3 content script and strict host permissions**

Bundle `content-script.ts` separately. Add only Flow `labs.google` matches plus `activeTab`, `tabs`, `scripting`, `storage`, `downloads`, `sidePanel`, `alarms`. Background routes typed job messages; content script never receives provider keys.

- [ ] **Step 5: Implement model settings**

Populate image models from scan with cache seeds Nano Banana Pro／2／2 Lite and video seeds Omni Flash／Veo 3.1 Lite／Fast／Quality. Save chosen names separately; missing choice pauses execution with candidate list.

- [ ] **Step 6: Bind generated character images and verify 0.1.21**

Create/update Flow character asset, rescan name/thumbnail, store binding metadata. Ambiguous same-name results must return `needs-user-selection`.

Run: `npm test && npm run typecheck && npm run build`  
Expected: DOM fixtures pass in three languages, no coordinate fallback exists, version is `0.1.21`.

## Task 5: 結構劇本、8 秒分鏡與 Flow Prompt Compiler（0.1.22）

**Files:**
- Create: `src/flow/jobs/veo-prompt-compiler.ts`
- Create: `src/flow/jobs/storyboard-job-compiler.ts`
- Create: `src/sidepanel/views/ScriptView.tsx`
- Create: `src/sidepanel/views/StoryboardDirectorView.tsx`
- Test: `src/flow/jobs/veo-prompt-compiler.test.ts`
- Test: `src/flow/jobs/storyboard-job-compiler.test.ts`
- Test: `src/sidepanel/views/StoryboardDirectorView.test.tsx`
- Modify: `src/domain/prompt-compiler.ts`, `src/pipeline/stages/script-runner.ts`, `src/pipeline/stages/storyboard-runner.ts`
- Modify version files.

**Interfaces:**
- Produces: `compileVeoPrompt(input): string`, `compileStoryboardJobs(storyboard, context): FlowJobManifest[]`.
- Consumes: validated script/storyboard/cast/art plus continuity locks.

- [ ] **Step 1: Write failing prompt and timing tests**

```ts
it("compiles every locked section and exact dialogue", () => {
  const prompt = compileVeoPrompt(fixture);
  for (const heading of ["STYLE & WORLD", "REFERENCE BINDINGS", "START STATE", "0–8 SECOND ACTION", "CAMERA", "DIALOGUE & AUDIO", "CONTINUITY LOCKS", "NEGATIVE"]) expect(prompt).toContain(heading);
  expect(prompt).toContain(fixture.dialogue.line);
});

it("blocks an invalid cut longer than Flow's 8 second limit", () => {
  expect(() => compileStoryboardJobs(longCut, context)).toThrow(/8 seconds/i);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/flow/jobs/veo-prompt-compiler.test.ts src/flow/jobs/storyboard-job-compiler.test.ts`  
Expected: FAIL because compilers are absent.

- [ ] **Step 3: Implement deterministic compiler**

Build sections from structured state; do not ask a model to preserve locks. Attach C/S/P IDs in `assetBindings`, and use visual descriptors rather than names inside the machine prompt. The storyboard runner must split source beats into distinct valid Cuts before compilation; the compiler rejects any Cut over 8 seconds instead of silently changing beat ownership.

- [ ] **Step 4: Build Script and Storyboard views**

Script shows episode timing, scenes, action beats, dialogue and delivery. Storyboard shows previous tail frame, current start frame, camera, locks, prompt, video preview and per-cut Flow action.

- [ ] **Step 5: Verify 0.1.22**

Run: `npm test && npm run typecheck && npm run build`  
Expected: every Flow video job is 4/6/8 seconds, all beats are claimed exactly once, version is `0.1.22`.

## Task 6: 影片執行、尾幀、換鏡首幀與 Continuity Gate（0.1.23）

**Files:**
- Create: `src/flow/media/result-observer.ts`
- Create: `src/flow/media/frame-extractor.ts`
- Create: `src/flow/media/continuity-linker.ts`
- Create: `src/flow/automation/state-machine.ts`
- Create: `src/flow/automation/checkpoint-store.ts`
- Test: `src/flow/media/continuity-linker.test.ts`
- Test: `src/flow/automation/state-machine.test.ts`
- Modify: `src/flow/content-script.ts`, `src/storage/asset-store.ts`
- Port selected MIT chain/result code from `flow-automation.js`.
- Modify version files.

**Interfaces:**
- Produces: `extractLastFrame(video): Promise<Blob>`, `selectNextFrameStrategy(previous,current)`, `AutomationStateMachine`.
- Consumes: completed video job, shot state delta and continuity locks.

- [ ] **Step 1: Write failing continuity-strategy tests**

```ts
expect(selectNextFrameStrategy(sameCameraContinuation)).toBe("use-tail-frame");
expect(selectNextFrameStrategy(newCameraSameScene)).toBe("rebuild-start-frame");
expect(selectNextFrameStrategy(newScene)).toBe("use-scene-start-frame");
```

- [ ] **Step 2: Write failing state-machine recovery test**

Persist a job at `waiting`, recreate the state machine, and assert it resumes at `preflight` without resubmitting a previously completed dependency.

- [ ] **Step 3: Implement result baseline, tail extraction and linkage**

Only media absent from the pre-submit baseline can satisfy a Job. Seek to `max(0, duration - 0.1)`, draw to canvas, save PNG Blob and dimensions, then create the next job input according to the strategy enum.

- [ ] **Step 4: Implement first-video quality pause**

After the first completed video, set project queue state to `quality-check-video`; require explicit user approval before dequeuing the next video job.

- [ ] **Step 5: Verify 0.1.23**

Run: `npm test && npm run typecheck && npm run build`  
Expected: recovery and three linkage strategies pass; version is `0.1.23`.

## Task 7: Flow 佇列、完整工作台、日誌與續跑（0.1.24）

**Files:**
- Create: `src/sidepanel/views/FlowQueueView.tsx`
- Create: `src/sidepanel/views/PipelineView.tsx`
- Create: `src/sidepanel/views/SettingsDebugView.tsx`
- Create: `src/sidepanel/components/GateReportPanel.tsx`
- Create: `src/sidepanel/components/JobStatusCard.tsx`
- Create: `src/storage/job-store.ts`
- Test: `src/sidepanel/views/FlowQueueView.test.tsx`
- Test: `src/storage/job-store.test.ts`
- Modify: `src/sidepanel/main.tsx`, `src/sidepanel/styles.css`, `src/sidepanel/debug-log.ts`
- Modify version files.

**Interfaces:**
- Produces: seven-page navigation, queue pause/resume/retry/cancel, redacted log export.
- Consumes: V2 project, gates, jobs, checkpoints and model cache.

- [ ] **Step 1: Write failing end-user workflow tests**

Test navigation to 素材工作室／劇本／分鏡導演／Flow 佇列, explicit quality approvals, resume button after restart, and model-not-found error containing candidates but no key.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/sidepanel/views/FlowQueueView.test.tsx src/storage/job-store.test.ts`  
Expected: FAIL because views/store are absent.

- [ ] **Step 3: Split the monolithic main.tsx**

Keep `main.tsx` as routing/state composition only. Move each page to its file; derive READY/PENDING/LOCKED from validated document versions and blockers, never `artCompleted` booleans.

- [ ] **Step 4: Build queue and debug UI**

Show job kind/entity/model/ratio/duration/state/attempt/output. Pause preserves checkpoint; retry starts at preflight; cancel never deletes completed assets. Redact keys, Authorization, prompt raw provider responses and data URLs from exported logs.

- [ ] **Step 5: Verify 0.1.24**

Run: `npm test && npm run typecheck && npm run build`  
Expected: complete navigation and queue tests pass; version is `0.1.24`.

## Task 8: Security、Chrome E2E、授權與可載入套件（0.1.25）

**Files:**
- Create: `src/security/redaction.test.ts`
- Create: `src/test/flow-fixtures/`
- Create: `docs/flow-automation-troubleshooting.md`
- Modify: `README.md`, `THIRD_PARTY_NOTICES.md`, `public/manifest.json`, `manifest.json`
- Modify all failing files discovered by QA only within approved scope.
- Modify version files.

**Interfaces:**
- Produces: loadable `dist/`, acceptance evidence and troubleshooting guide.
- Consumes: all prior tasks.

- [ ] **Step 1: Add security tests**

Assert API keys never occur in build output, Project export, content-script messages, debug-log JSON or thrown provider errors. Assert host permissions contain only required Flow patterns.

- [ ] **Step 2: Run full automated verification**

Run: `npm test && npm run typecheck && npm run build`  
Expected: all tests pass and `dist/manifest.json` is `0.1.25`.

- [ ] **Step 3: Run Chrome smoke test**

Load `dist` unpacked; verify action opens Side Panel; non-Flow tabs receive no content-script action; Flow capability scan lists actual image/video models; select Nano Banana 2 and Veo 3.1 - Fast; create one character-sheet job; verify first-character approval; create three sequential video jobs; verify first-video approval and correct tail/rebuilt frame on jobs two and three.

- [ ] **Step 4: Test interruption and resume**

Close/reopen Side Panel during `waiting`, reload Flow, and confirm the queue resumes from preflight without duplicating completed media. Simulate missing selected model and confirm pause with actual candidate list.

- [ ] **Step 5: Final licensing and package audit**

Verify `THIRD_PARTY_NOTICES.md` includes shuohao Apache-2.0 attribution and the source MIT notice for copied flow-automation portions. Search `dist` for secrets and stale version strings.

- [ ] **Step 6: Record final evidence**

Save test command output, Chrome smoke checklist, known Flow selector assumptions and dist load path in `docs/flow-automation-troubleshooting.md`. Do not claim completion if any quality gate, security test, build or smoke item fails.

---

## Execution Order and Review Gates

Execute Tasks 1–8 in order. After every task: review changed files, verify the exact version increment, run full automated checks, and obtain a reviewer gate before starting the next task. Tasks 3–4 may not start before V2 contracts and gates are stable; Tasks 5–6 may not start before the Flow DOM adapter passes fixtures; Task 8 is the only task allowed to claim the extension is complete.
