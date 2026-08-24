# Cut-first Storyboard Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 將已核准的 storyboard pipeline 改為每個 4／6／8 秒 Cut 個別送入 Google Flow，保存 Continuity Lock 與 Shot State，並輸出供外部 ffmpeg 合成的 Segment Manifest。

**Architecture:** 在既有 `StoryboardDocument`、`FlowJobManifest` 與 `compileVeoPrompt` 上做向後相容擴充。新增獨立的 storyboard state／continuity domain、Cut video prompt compiler、Segment Manifest builder／exporter；FlowQueue 仍以單一 Cut job 執行，Segment 只在所有 Cut 完成後進入 `ready-to-assemble`。第一版不在 extension 內編碼 MP4。

**Tech Stack:** TypeScript、Zod、React、Vitest、IndexedDB/idb、Vite、Chrome MV3、既有 Auto-Flow-Free 相容 content script。

**Spec:** `docs/superpowers/specs/2026-08-24-cut-first-storyboard-continuity-design.md`

## Global Constraints

- Cut 生成時長只允許 `4 | 6 | 8`，不得把 2、3、5 或其他數值靜默映射到相鄰值。
- 每個 Cut 必須只認領同一 scene 內連續的 script beats；每個 beat 必須恰好被一個 Cut 認領。
- 新 Cut 預設只允許 Camera 改變；人物 identity、服裝、比例、姿勢、位置、道具、場景與光線必須繼承上一 Cut，除非 script beat 明確解除鎖定。
- 站立／坐下／躺下等狀態跳變若沒有 transition beat，必須產生 blocker，不得自動補寫劇情。
- Segment 不直接送入 Flow；每個 Cut 是一個 immutable video job。
- Segment 只有在所有 Cut 有結果、順序與連續性檢查通過後才可進入 `ready-to-assemble`。
- 第一版只輸出 Segment Manifest、concat list、prompt 與 metadata；不使用 WebCodecs、ffmpeg.wasm 或瀏覽器端 MP4 encoder。
- Provider API keys 只留在 Chrome `storage.local`／service worker，不進入 project JSON、Flow content script、bundle 或 debug log。
- 每次程式變更 patch version 遞增；同步 `package.json`、`package-lock.json`、`manifest.json`、`public/manifest.json`，並完成 dist audit。
- 專案副本沒有 `.git`；不執行 git commit，改以每個任務的 focused tests、完整 tests、typecheck、build 與安全掃描作為 checkpoint。

---

### Task 1: Extend storyboard contracts and migration-safe Cut model

**Files:**
- Modify: `src/domain/contracts/storyboard.ts`
- Create: `src/domain/contracts/storyboard-continuity.ts`
- Create: `src/domain/contracts/storyboard-continuity.test.ts`
- Modify: `src/domain/migration.ts` only where storyboard documents are normalized

**Interfaces:**
- `FlowDuration` remains `4 | 6 | 8` from `src/flow/jobs/types.ts`.
- Export `shotStateSchema`, `continuityLockSchema`, `cutContinuitySchema`, and `segmentManifestSchema` from `storyboard-continuity.ts`.
- `StoryboardDocument` gains optional normalized fields while accepting existing `episodes[].segments[].cuts[]` documents.

- [x] **Step 1: Write failing schema tests**

```ts
it("accepts a cut with 4, 6, or 8 seconds and structured state", () => {
  const result = storyboardContinuitySchema.safeParse({
    cutId: "C01",
    durationSec: 4,
    beatClaims: [{ episodeId: "E01", sceneId: "S01", beatId: "B01", order: 0 }],
    previousState: minimalShotState("standing"),
    currentState: minimalShotState("standing"),
    continuityLocks: ["Zhao Wang remains standing"],
    allowedChanges: ["camera moves from frontal to left-side medium shot"],
    forbiddenChanges: ["Zhao Wang sits on the throne"],
  });
  expect(result.success).toBe(true);
});

it.each([2, 3, 5, 7, 9])("rejects non-native Flow duration %s", (durationSec) => {
  expect(storyboardContinuitySchema.safeParse({ ...validCut, durationSec }).success).toBe(false);
});
```

- [x] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/domain/contracts/storyboard-continuity.test.ts`

Expected: FAIL because the structured continuity schemas and strict duration validator do not exist.

- [x] **Step 3: Implement minimal Zod contracts**

Implement `ShotState` with character identity／pose／position／facing／eyeLine／scale／costume／heldPropIds, environment scene／spatialAnchors／lighting, and camera shotSize／lensMm／height／angle／distance／axis／movement／framing. Implement strict `durationSec` as `z.union([z.literal(4), z.literal(6), z.literal(8)])`; do not use the current nearest-duration coercion in the normalized contract.

- [x] **Step 4: Run focused tests and verify pass**

Run: `npm test -- src/domain/contracts/storyboard-continuity.test.ts`

Expected: PASS.

- [x] **Step 5: Add migration coverage**

Add a test showing an old storyboard with only `h3Prompt`, `veoPrompt`, `beats`, and `durationSec` loads, while missing states are marked `needs-state-review` instead of being treated as continuity-safe.

- [x] **Step 6: Run migration tests**

Run: `npm test -- src/domain/contracts/storyboard-continuity.test.ts src/domain/migration.test.ts`

Expected: PASS, with old documents accepted and state-review metadata explicit.

### Task 2: Implement beat claims, Shot State inheritance, and deterministic continuity gates

**Files:**
- Create: `src/domain/storyboard/beat-claims.ts`
- Create: `src/domain/storyboard/beat-claims.test.ts`
- Create: `src/domain/storyboard/shot-state.ts`
- Create: `src/domain/storyboard/shot-state.test.ts`
- Create: `src/domain/gates/storyboard-continuity-gates.ts`
- Create: `src/domain/gates/storyboard-continuity-gates.test.ts`

**Interfaces:**
- `normalizeBeatClaims(input): BeatClaim[]`
- `validateBeatCoverage(beats, cuts): GateResult`
- `inheritShotState(previousState, currentCandidate): ShotState`
- `detectActionTransition(previousState, currentState, beatClaims): TransitionResult`
- `evaluateStoryboardContinuity(input): { score: ContinuityScore; blockers: GateBlocker[] }`

- [x] **Step 1: Write failing beat coverage tests**

```ts
it("rejects duplicated and skipped beat claims", () => {
  const result = validateBeatCoverage(
    [{ episodeId: "E01", sceneId: "S01", beatId: "B01", order: 0 }, { episodeId: "E01", sceneId: "S01", beatId: "B02", order: 1 }],
    [["B01"], ["B01"]],
  );
  expect(result.blockers.map((item) => item.code)).toEqual(expect.arrayContaining(["beat.duplicate", "beat.missing"]));
});

it("rejects a cut that crosses scenes", () => {
  const result = validateBeatCoverage(
    [{ episodeId: "E01", sceneId: "S01", beatId: "B01", order: 0 }, { episodeId: "E01", sceneId: "S02", beatId: "B02", order: 1 }],
    [["B01", "B02"]],
  );
  expect(result.blockers.some((item) => item.code === "cut.cross-scene")).toBe(true);
});
```

- [x] **Step 2: Run tests to verify failure**

Run: `npm test -- src/domain/storyboard/beat-claims.test.ts`

Expected: FAIL because beat normalization and coverage gates are absent.

- [x] **Step 3: Implement beat claim normalization and coverage gate**

Use stable `episodeId`, `sceneId`, `beatId`, and order. Reject a cut spanning multiple scenes; reject missing, duplicate, non-contiguous, or out-of-order claims; preserve original script text without rewriting it.

- [x] **Step 4: Write failing state inheritance and transition tests**

```ts
it("inherits identity, scale, prop anchors, and lighting when only camera changes", () => {
  const next = inheritShotState(previousState, { camera: { shotSize: "medium", axis: "A", movement: "dolly-in" } });
  expect(next.characters["zhao-wang"].scale).toBe(previousState.characters["zhao-wang"].scale);
  expect(next.environment.spatialAnchors).toEqual(previousState.environment.spatialAnchors);
  expect(next.environment.lighting).toBe(previousState.environment.lighting);
});

it("blocks standing to seated without transition beats", () => {
  const result = detectActionTransition(standingState, seatedState, [{ action: "Zhao Wang sits" }]);
  expect(result.blockers).toContain("action-transition");
});
```

- [x] **Step 5: Implement state inheritance and Action Transition detection**

Treat structured previous state as canonical. Merge only explicitly allowed camera or beat-driven changes. Detect standing／seated／lying and major location／prop changes; require a matching transition action in claimed beats.

- [x] **Step 6: Implement continuity score and blockers**

Score identity, costume, pose, position, scale, props, environment, lighting, and camera separately. Return blockers for missing state, identity drift, pose transition, spatial anchor changes, scale drift, axis breaks, missing references, and incomplete prompt inputs.

- [x] **Step 7: Run focused gate tests**

Run: `npm test -- src/domain/storyboard/beat-claims.test.ts src/domain/storyboard/shot-state.test.ts src/domain/gates/storyboard-continuity-gates.test.ts`

Expected: PASS.

### Task 3: Build Cut-first continuity prompt compiler

**Files:**
- Modify: `src/flow/jobs/veo-prompt-compiler.ts`
- Create: `src/flow/jobs/cut-video-prompt-compiler.ts`
- Create: `src/flow/jobs/cut-video-prompt-compiler.test.ts`

**Interfaces:**
- `compileCutVideoPrompt(input: CutVideoPromptInput): string`
- `CutVideoPromptInput` consumes style/world, references, previous/current states, locks, allowed/forbidden changes, action, camera, dialogue, audio, negative, and `durationSec`.

- [x] **Step 1: Write failing prompt structure tests**

```ts
it("writes continuity sections in deterministic order", () => {
  const prompt = compileCutVideoPrompt(validInput({ durationSec: 8 }));
  expect(prompt.indexOf("PREVIOUS CUT STATE")).toBeLessThan(prompt.indexOf("CURRENT CUT ACTION"));
  expect(prompt).toContain("Zhao Wang remains standing");
  expect(prompt).toContain("FORBIDDEN CHANGES\nZhao Wang sits on the throne");
  expect(prompt).toContain("single continuous video, exactly 8 seconds");
});

it("rejects a prompt with no current action or camera", () => {
  expect(() => compileCutVideoPrompt(validInput({ action: "", camera: "" }))).toThrow();
});
```

- [x] **Step 2: Run focused tests to verify failure**

Run: `npm test -- src/flow/jobs/cut-video-prompt-compiler.test.ts`

Expected: FAIL because the Cut-oriented compiler is absent.

- [x] **Step 3: Implement compiler**

Keep the existing `compileVeoPrompt` API for old callers. Implement the new compiler with fixed sections: project／segment／cut, style & world, reference bindings, previous state, continuity locks, current action, camera & framing, allowed changes, forbidden changes, dialogue & audio, generation constraints, and negative. Render structured state as stable human-readable text. Add `exactly 4/6/8 seconds` and `single continuous video` constraints.

- [x] **Step 4: Run focused tests to verify pass**

Run: `npm test -- src/flow/jobs/cut-video-prompt-compiler.test.ts src/flow/jobs/veo-prompt-compiler.test.ts`

Expected: PASS.

### Task 4: Compile storyboard Cuts into immutable Flow video jobs and Segment Manifests

**Files:**
- Modify: `src/flow/jobs/storyboard-job-compiler.ts`
- Modify: `src/flow/jobs/storyboard-job-compiler.test.ts`
- Modify: `src/flow/jobs/types.ts`
- Create: `src/flow/jobs/segment-manifest.ts`
- Create: `src/flow/jobs/segment-manifest.test.ts`

**Interfaces:**
- `compileStoryboardJobs(storyboard, context)` continues to return `FlowJobManifest[]`, now with strict Cut durations and continuity metadata.
- Add `segmentId`, `cutId`, `beatClaims`, `previousState`, `currentState`, `allowedChanges`, `forbiddenChanges`, `continuityScore`, and `continuityBlockers` to optional `FlowJobManifest` metadata for backward compatibility.
- `buildSegmentManifest(jobs, results): SegmentManifest`
- `exportSegmentManifest(manifest, outputDirectory): ExportedSegmentPackage`

- [x] **Step 1: Write failing compiler tests**

```ts
it("creates one cut-video job per cut with exact native duration", () => {
  const jobs = compileStoryboardJobs(storyboardWithCuts([4, 6, 8]), context);
  expect(jobs.map((job) => job.durationSec)).toEqual([4, 6, 8]);
  expect(jobs.every((job) => job.kind === "veo-segment" || job.kind === "cut-video")).toBe(true);
  expect(jobs[1].segmentId).toBe("SEG-01");
  expect(jobs[1].cutId).toBe("CUT-02");
});

it.each([2, 3, 5, 7, 9])("rejects duration %s instead of coercing it", (durationSec) => {
  expect(() => compileStoryboardJobs(storyboardWithCuts([durationSec]), context)).toThrow(/4, 6, or 8/);
});
```

- [x] **Step 2: Run focused compiler tests to verify failure**

Run: `npm test -- src/flow/jobs/storyboard-job-compiler.test.ts`

Expected: FAIL because current compiler coerces non-native durations and does not expose Cut continuity metadata.

- [x] **Step 3: Implement strict Cut compilation**

Read existing storyboard fields and normalized continuity fields. Reject non-native duration. Use `compileCutVideoPrompt`; set per-Cut references, state metadata, beat claims, continuity score, blockers, and dependencies to the immediately preceding Cut in the same Segment. Keep the old `veo-segment` kind as a compatibility value unless all consumers have been migrated to `cut-video`; add `cutId` and `segmentId` to distinguish semantics without breaking existing persisted records.

- [x] **Step 4: Write failing Segment Manifest tests**

```ts
it("builds a ready-to-assemble manifest only when every cut has a video result", () => {
  const manifest = buildSegmentManifest(jobs, [{ jobId: "job-1", videoAssetId: "asset-1" }, { jobId: "job-2", videoAssetId: "asset-2" }]);
  expect(manifest.status).toBe("ready-to-assemble");
  expect(manifest.cutOrder.map((cut) => cut.cutId)).toEqual(["CUT-01", "CUT-02"]);
  expect(manifest.totalDurationSec).toBe(12);
});

it("blocks export when a cut result is missing", () => {
  expect(() => buildSegmentManifest(jobs, [{ jobId: "job-1", videoAssetId: "asset-1" }])).toThrow(/CUT-02/);
});
```

- [x] **Step 5: Implement Segment Manifest builder and export package**

Compute cumulative `startTimeSec`／`endTimeSec`, preserve Cut order, require every job result, reject continuity blockers, write `segment-manifest.json`, `concat-list.txt`, prompt text files, and continuity metadata. Do not encode or concatenate videos in this task.

- [x] **Step 6: Run focused tests**

Run: `npm test -- src/flow/jobs/storyboard-job-compiler.test.ts src/flow/jobs/segment-manifest.test.ts`

Expected: PASS.

### Task 5: Persist Cut metadata and Segment Manifest state

**Files:**
- Modify: `src/storage/job-store.ts`
- Modify: `src/storage/job-record.ts`
- Modify: `src/storage/job-record.test.ts`
- Create: `src/storage/segment-manifest-store.ts`
- Create: `src/storage/segment-manifest-store.test.ts`

**Interfaces:**
- `toStoredJobRecord(job, timestamp)` preserves all new Cut metadata through `manifest`.
- `segmentManifestStore.save`, `get`, `list`, and `updateStatus` persist Segment manifests in IndexedDB.

- [x] **Step 1: Write failing persistence tests**

```ts
it("persists segment and cut continuity metadata in the job snapshot", () => {
  const record = toStoredJobRecord(cutJob, "2026-08-24T00:00:00.000Z");
  expect(record.manifest?.segmentId).toBe("SEG-01");
  expect(record.manifest?.currentState).toBeDefined();
  expect(record.manifest?.forbiddenChanges).toContain("Zhao Wang sits on the throne");
});

it("stores and updates a segment manifest independently from cut jobs", async () => {
  await segmentManifestStore.save(manifest);
  expect(await segmentManifestStore.get("SEG-01")).toMatchObject({ status: "ready-to-assemble" });
  await segmentManifestStore.updateStatus("SEG-01", "assembled");
  expect((await segmentManifestStore.get("SEG-01"))?.status).toBe("assembled");
});
```

- [x] **Step 2: Run tests to verify failure**

Run: `npm test -- src/storage/job-record.test.ts src/storage/segment-manifest-store.test.ts`

Expected: FAIL because Segment storage and the new manifest fields do not exist.

- [x] **Step 3: Implement persistence**

Extend the existing IndexedDB schema with a `segmentManifests` object store or an equivalent versioned store. Preserve full immutable Cut manifest snapshots. Use safe cloning and explicit status transitions; do not place API keys in any persisted record.

- [x] **Step 4: Run focused persistence tests**

Run: `npm test -- src/storage/job-record.test.ts src/storage/segment-manifest-store.test.ts`

Expected: PASS.

### Task 6: Update Storyboard Director UI for script loading, blockers, Cut details, and queueing

**Files:**
- Modify: `src/sidepanel/views/StoryboardDirectorView.tsx`
- Modify: `src/sidepanel/main.tsx`
- Modify: `src/sidepanel/styles.css`
- Create or modify: `src/sidepanel/storyboard-director.test.tsx`

**Interfaces:**
- `StoryboardDirectorView` receives current storyboard/script documents and `onQueue` callback.
- UI exposes `載入劇本`, Cut duration selection limited to 4／6／8, continuity score, blocker list, prompt details, and `加入 Flow 佇列` only for gate-passing Cuts.

- [x] **Step 1: Write failing UI tests**

```tsx
it("shows each cut's continuity locks and blocks queueing when a transition blocker exists", () => {
  render(<StoryboardDirectorView storyboard={storyboardWithTransitionBlocker} {...props} />);
  expect(screen.getByText("FORBIDDEN CHANGES")).toBeInTheDocument();
  expect(screen.getByText(/action-transition/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /加入 Flow 佇列/ })).toBeDisabled();
});

it("only offers native Flow durations", () => {
  render(<StoryboardDirectorView storyboard={validStoryboard} {...props} />);
  expect(screen.queryByText("2 秒")).not.toBeInTheDocument();
  expect(screen.getByText("4 秒")).toBeInTheDocument();
  expect(screen.getByText("6 秒")).toBeInTheDocument();
  expect(screen.getByText("8 秒")).toBeInTheDocument();
});
```

- [x] **Step 2: Run UI tests to verify failure**

Run: `npm test -- src/sidepanel/storyboard-director.test.tsx`

Expected: FAIL because current UI only renders compiled jobs and does not show continuity metadata or blockers.

- [x] **Step 3: Implement UI changes**

Add script/scene/beat summary, Cut cards with state and gate details, prompt preview, references, duration selector, and disabled queue button for blockers. Preserve existing storyboard rendering and `onQueue` integration. Add Segment Manifest export action only when all Cut results are available.

- [x] **Step 4: Run focused UI tests**

Run: `npm test -- src/sidepanel/storyboard-director.test.tsx src/sidepanel/pipeline-ui.test.ts`

Expected: PASS.

### Task 7: Integrate Cut video jobs with Auto-Flow batch execution and result events

**Files:**
- Modify: `src/flow/automation/auto-flow-free-protocol.ts`
- Modify: `src/flow/automation/auto-flow-runner.ts`
- Modify: `src/background/service-worker.ts`
- Modify: `src/sidepanel/main.tsx`
- Modify: `src/flow/auto-flow-free.js` only if video-mode metadata or result events require it
- Create or modify: `src/flow/automation/cut-video-runner.test.ts`

**Interfaces:**
- `buildAutoFlowBatches` accepts Cut video jobs and retains each job’s `durationSec`, `segmentId`, `cutId`, references, and prompt.
- Runner emits per-Cut `preflight`, `configuring`, `submitting`, `waiting`, `completed`, `failed`, and `retrying` states.
- `ITEM_RESULT` updates the corresponding Cut job with `videoAssetId` or downloaded file metadata.

- [x] **Step 1: Write failing runner tests**

```ts
it("runs video cuts in segment order and pauses later cuts after a failure", () => {
  const run = createCutVideoRun([cutJob("CUT-01"), cutJob("CUT-02")]);
  const failed = handleCutResult(run, "CUT-01", { status: "error", error: "Flow failed" });
  expect(failed.run.status).toBe("failed");
  expect(failed.run.nextCutId).toBe("CUT-01");
  expect(failed.events).toContainEqual(expect.objectContaining({ kind: "job-status", jobId: "job-CUT-01", status: "failed" }));
});

it("marks a segment ready only after all cut results exist", () => {
  const result = handleCutResult(runAfterSuccessfulResults, "CUT-02", { status: "done", videoAssetId: "asset-2" });
  expect(result.events).toContainEqual({ kind: "segment-status", segmentId: "SEG-01", status: "ready-to-assemble" });
});
```

- [x] **Step 2: Run focused runner tests to verify failure**

Run: `npm test -- src/flow/automation/cut-video-runner.test.ts`

Expected: FAIL because current generic runner has no Segment-aware Cut result orchestration.

- [x] **Step 3: Implement Cut video orchestration**

Group only compatible jobs for each Auto-Flow batch, preserve video mode and exact duration, send one Cut at a time in Segment order, and pause subsequent Cut jobs when the current Cut fails. Keep trusted Flow interaction and existing error behavior. Do not pass provider API keys to content script.

- [x] **Step 4: Implement result-to-manifest mapping**

Map `ITEM_RESULT` data to the Cut job record and Segment Manifest. Preserve downloaded file name／asset ID／duration and update `ready-to-assemble` only when every Cut result is present and blockers are empty.

- [x] **Step 5: Run focused runner tests**

Run: `npm test -- src/flow/automation/cut-video-runner.test.ts src/flow/automation/auto-flow-runner.test.ts src/flow/automation/auto-flow-free-protocol.test.ts`

Expected: PASS.

### Task 8: Version, documentation, full regression, and distribution audit

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `manifest.json`
- Modify: `public/manifest.json`
- Modify: `README.md`
- Modify: `docs/flow-automation-troubleshooting.md`
- Modify: `THIRD_PARTY_NOTICES.md` only if new bundled source attribution changes

- [x] **Step 1: Update documentation**

Document the final flow: script load → Cut plan → continuity review → per-Cut Flow generation → Segment Manifest export → external ffmpeg. State that Cut duration is 4／6／8, that old 2–5 second storyboard durations require review, and that extension-side MP4 assembly is not included.

- [x] **Step 2: Increment patch version and synchronize manifests**

Read current version, increment exactly one patch number, and synchronize all four version files. Keep existing `labs.google` host permissions, `debugger` permission, Auto-Flow content script, and provider host permissions.

- [x] **Step 3: Run focused tests for every changed subsystem**

Run:

```powershell
npm test -- src/domain/contracts/storyboard-continuity.test.ts src/domain/storyboard/beat-claims.test.ts src/domain/storyboard/shot-state.test.ts src/domain/gates/storyboard-continuity-gates.test.ts src/flow/jobs/cut-video-prompt-compiler.test.ts src/flow/jobs/storyboard-job-compiler.test.ts src/flow/jobs/segment-manifest.test.ts src/storage/segment-manifest-store.test.ts src/sidepanel/storyboard-director.test.tsx src/flow/automation/cut-video-runner.test.ts
```

Expected: all focused tests pass.

- [x] **Step 4: Run full validation**

Run:

```powershell
npm test
npm run typecheck
npm run build
```

Expected: all tests pass, typecheck exits successfully, and Vite produces `dist/`.

**Validation result:** `npm test` passed 48 test files／154 tests; `npm run typecheck -- --pretty false` passed; `npm run build` passed and produced `dist/`.

- [x] **Step 5: Audit dist and secrets**

Verify `dist/manifest.json` has the new version, `background.js`, `content-script.js`, and `auto-flow-free.js` exist, and scan dist for `sk-*`, `AIza*`, and long Bearer token patterns. Confirm no API key is present. The generated `dist/manifest.json` is version 0.1.35 and contains the expected `debugger`, `labs.google`, Provider host permissions, `background.js`, `content-script.js`, and `auto-flow-free.js` entries. A browser-authenticated Google Flow smoke test was not performed by the agent.

- [x] **Step 6: Report actual validation boundary**

Report exact test counts and build/audit results. Instruct the user to reload the unpacked extension, open an authenticated Google Flow project, generate one Cut, verify the result, then continue the Segment. Do not claim a real Flow smoke test unless the user performs it in the browser.
