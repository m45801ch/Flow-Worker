# Flow Companion SDD Progress

- Branch: `codex/flow-companion-automation`
- Baseline commit: `1c0c286`
- Baseline verification: 24 tests passed; typecheck passed; build passed.
- Current task: Task 1 / version 0.1.18 — Project V2, native contracts, migration.

| Task | Version | Status | Implementer | Review | Commit |
|---|---:|---|---|---|---|
| 1. Project V2 and migration | 0.1.18 | Complete | Codex | Self-reviewed | `feat: add project v2 native contracts` |
| 2. Native pipeline and gates | 0.1.19 | Pending | — | — | — |
| 3. Asset Studio and image jobs | 0.1.20 | Pending | — | — | — |
| 4. Flow DOM adapter and models | 0.1.21 | Pending | — | — | — |
| 5. Script/storyboard/prompt compiler | 0.1.22 | Pending | — | — | — |
| 6. Video continuity execution | 0.1.23 | Pending | — | — | — |
| 7. Queue, UI, logs, resume | 0.1.24 | Pending | — | — | — |
| 8. Security, E2E, licensing/package | 0.1.25 | Pending | — | — | — |
| Final integrated review | — | Pending | — | — | — |

## Decisions and constraints

- Each storyboard Cut is one Flow job and must be at most 8 seconds.
- A compiler rejects an invalid Cut over 8 seconds; the storyboard runner owns beat-preserving Cut subdivision.
- Automation targets only `labs.google`, starts only after explicit user action, and has no coordinate-click fallback.
- Every milestone increments all version files by `0.0.1`.

- Task 1 review fixes: native contract validation, V1/V2 parser validation, cloned migration payloads, IndexedDB normalization, V2 side-panel I/O, and caught persistence failures verified (23 focused / 47 full tests).
