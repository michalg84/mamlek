<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Testy importu rejestru i parsera (ryzyko #7)

- **Plan**: context/changes/testing-registry-import-scripts/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-23
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Automated checks run during the review (exit codes taken from the commands themselves, not from pipes):

- `npm run lint` — exit 0
- `npx vitest run --project unit --project component --project registry` — exit 0, 316 tests
- `npx astro check` — exit 0, 0 errors / 0 warnings / 0 hints
- `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:db` — exit 0, 86 tests
- After `test:db`: scratch database `registry_import_test` count 0, `postgres` still 11 active products and 3 `registry_imports` rows

Manual items 3.9–3.11 were not performed or ticked (per lessons.md). 3.9: `ci` and `smoke` on PR #51 were still IN_PROGRESS at review time.

## Findings

### F1 — lint-staged skips registry tests for staged `tests/registry/*`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: package.json:80-84
- **Detail**: The `*.{ts,astro,tsx}` entry runs `vitest related` with `--project unit --project component` only. A commit that stages only `tests/registry/*.test.ts` or `tests/registry/parse-helpers.ts` runs no registry test at pre-commit; `--passWithNoTests` lets it pass. The end-of-turn hook and CI catch it, so the gap is in the commit layer only.
- **Fix**: Add `--project registry` to that `vitest related` command.
- **Decision**: Fixed — `--project registry` added to `vitest related` for `*.{ts,astro,tsx}` in package.json.

### F2 — Plan contract and test-plan §6.6 do not mention `scripts/test-registry.mjs`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: plan.md Phase 3 §3 contract; package.json:89; scripts/test-registry.mjs
- **Detail**: The plan prescribes `"{scripts/fixtures,tests/fixtures}/*.xml": "vitest run --project registry"`. Implementation uses `node scripts/test-registry.mjs` because lint-staged appends staged paths and vitest took the XML path as a filter (commit a635930). The intent is met and AGENTS.md documents the wrapper, but the plan text and test-plan §6.6 still describe the old command.
- **Fix**: Add a short addendum to the plan's Phase 3 §3 and a line in test-plan §6.6 naming the wrapper and why.
- **Decision**: Fixed — addendum in plan.md Phase 3 and a sentence in test-plan §6.6 naming `scripts/test-registry.mjs`.

### F3 — "a bad last product rolls back the batches already loaded" cannot detect a missing rollback

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/db/registry-import.test.ts:224
- **Detail**: Batches go only into `on commit drop` temp tables; the real tables are first written after parsing ends. This test (and every parse-error case) would pass even with no rollback. The only bad-file case that fails after real tables are written is the impossible snapshot date (fails at the `registry_imports` insert).
- **Fix**: Rename the test to what it proves ("a parse error after full batches exits 1 and leaves the database unchanged") and note the date case as the real rollback proof.
- **Decision**: Fixed — test renamed and commented; test-plan §6.5/§6.6 no longer claim it proves rollback (the 2026-13-45 date case does).

### F4 — `afterAll` removes the temp dir before dropping the scratch database

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/db/registry-import.test.ts:36-41
- **Detail**: If `rmSync` throws (EBUSY/EPERM on Windows) the database is not dropped. The next run force-drops it, so the cost is a leftover database until then.
- **Fix**: Drop the database first, or wrap `rmSync` in try/finally.
- **Decision**: Fixed — `afterAll` drops the database first, `rmSync` in `finally`.

### F5 — Fixed scratch database name and mismatched timeouts

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/db/registry-import-fixtures.ts:11,45,82; tests/db/registry-import.test.ts:25
- **Detail**: Two simultaneous `test:db` runs against one local Supabase (e.g. two worktrees) force-drop each other's database. The child process timeout is 120 s while the test timeout is 60 s, so a hung import blocks `spawnSync` for up to 120 s and reports `status: null`.
- **Fix**: Document the one-run-at-a-time limit in the fixtures header and set the child timeout below the test timeout (e.g. 45 s).
- **Decision**: Fixed — header note (one `test:db` at a time per server) and child process timeout 45 s.

### F6 — Migration guard would skip a registry migration that mentions `auth.`

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/db/registry-import.test.ts:331-336
- **Detail**: The guard treats any migration matching `/\bauth\.|kit_items/` as out of scope. A future registry migration with an RLS policy using `auth.uid()` would be left out of `REGISTRY_MIGRATIONS` silently and the scratch schema would drift.
- **Fix**: Make the guard match only statements that create or alter `kit_items` / depend on `auth.users`, or accept and document the limit.
- **Decision**: Fixed — limit documented in a comment on the guard test (regex kept).

### F7 — Small additions beyond the plan, and an untested `--dry-run` path

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: tests/db/registry-import.test.ts:187-188; scripts/registry-import.mjs:283
- **Detail**: (1) The 10-of-11 test asserts `removed_at` on the left-out product, although "What We're NOT Doing" excludes `removed_at` behaviour (benign, one assertion). (2) `--dry-run` on a file with no products is rejected by code (`:283`) but no test covers it; mutation (e) covers only the import path.
- **Fix**: Add a short `--dry-run` empty-file test, and either keep the `removed_at` assertion with a plan addendum or drop it.
- **Decision**: Fixed — `--dry-run` empty-file test added (`runImport` got a `dryRun` option); `removed_at` assertion kept, noted in the plan addendum.
