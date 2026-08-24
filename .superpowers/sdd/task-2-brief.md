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

