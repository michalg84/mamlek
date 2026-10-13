<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Test rollout Phase 1 — check verdict correctness

- **Plan**: context/changes/testing-check-verdict-correctness/plan.md
- **Scope**: Full plan (phases 6 and 7 have open manual rows, see F1)
- **Reviewed phases**: 1, 2, 3, 4, 5, 6, 7
- **Date**: 2026-10-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

Review done inline (no sub-agents): the diff `e9fe0b4^..HEAD` outside `context/` is 17 files; verdict logic, guard, hook, component, test configs, CI step, fixtures and docs were read; the DB test file was checked for skips and known-limitation pins.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Automated checks (re-run 2026-10-13)

- `npm test`: 2 files, 53 tests passed.
- `npm run test:db` (full local registry): 1 file, 35 tests passed.
- `npm run lint`, `npx astro check` (0 errors), `npm run build`: passed after phase 7; CI `ci` and `smoke` green on PR #33.
- No `.skip`, `.only` or `todo` in the new tests; `connectLocal` throws instead of skipping.

## Findings

### F1 — Three Progress rows are intentionally open

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress rows 6.4, 7.1, 7.6
- **Detail**: 6.4 (review of the 309 suspicious common names) was deferred by the author; 7.1 cannot be met because Stryker 10.0.0 does not apply mutants under Vitest 5.0.4 (the plan's fallback was taken, reason in test-plan §6.6); 7.6 has nothing to approve without a mutation report. All three are annotated in the plan and tracked (roadmap Open Questions 7 and 8, test-plan §6.6).
- **Fix**: Archive with these rows open; they are documented, not forgotten.
- **Decision**: ACCEPTED (archive with documented open rows)

### F2 — The verdict unit and component tests do not run in CI yet

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: .github/workflows/ci.yml; package.json `test`
- **Detail**: By decision (plan Migration Notes) `npm test` is local only until rollout Phase 4. A regression in `checkVerdict`, `parseMedicineCheck` or the component is caught in CI only through `npm run test:db`, which pushes every rule answer through both functions, not by the 53 unit and component tests (rendered text, caution wording, error states).
- **Fix**: Wire `npm test` into the `ci` job in rollout Phase 4 (already planned, test-plan §5).
- **Decision**: ACCEPTED

### F3 — The measured shapes are not pinned by tests

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/db/medicine-check.test.ts (G8 is the only pinned limitation)
- **Detail**: The plan allowed known limitations from the phase 6 measurement to be pinned. The author decided "do nothing" for NBSP, separators and a substance written as one string, and deferred the 309-name list, so no test pins them. When the trailing-space change lands (roadmap Open Question 7) it needs its own red test; the current behaviour (two spellings of one variant key are two medicines) is unpinned.
- **Fix**: Add the red test as the first step of the trim change; nothing now.
- **Decision**: ACCEPTED
