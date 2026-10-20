<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Faza 4 wdrażania testów — podpięcie bramek jakości

- **Plan**: context/changes/testing-quality-gates-wiring/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-20
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Evidence for Success Criteria (re-run 2026-10-20): `npm test` 157/157, `npm run lint` clean, `npx astro check` 0 errors, ruleset JSON valid, no `format.mjs` and no "required after §3 Phase 4" hits; repo `PUBLIC`; `rules/branches/main` = deletion, non_fast_forward, pull_request, required_status_checks (`ci`, `smoke`); secret scanning + push protection enabled; PR #45 `ci`/`smoke` fail, closed; PR #46 `ci`/`smoke` pass, merged.

## Findings

### F1 — post-edit.mjs silently skips when git cannot read the payload cwd

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .claude/hooks/post-edit.mjs:48-49
- **Detail**: `sessionRepo = git(cwd, …)` has no fallback. When `cwd` is a path git cannot read (e.g. MSYS `/c/...`, exit 128), `sessionRepo` is `null`, `repo !== sessionRepo`, and the hook exits 0 with no formatting or linting and no message. `end-of-turn.mjs:49` already handles this case with `?? git(process.cwd(), …)` and a comment that names exactly this case.
- **Fix**: `const sessionRepo = git(cwd, […]) ?? git(process.cwd(), […]);` plus a test with an MSYS-style `cwd`, like the one for end-of-turn.
- **Decision**: FIXED — fallback na process.cwd() + test (czerwony bez poprawki)

### F2 — AGENTS.md now says the pre-commit hook runs the `hooks` project; nothing does

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: AGENTS.md:38
- **Detail**: The sentence "The pre-commit hook runs `vitest related` on the staged source files." was inserted before "It also runs the `hooks` project…". "It" now reads as the pre-commit hook. In fact neither lint-staged, CI nor Stop runs `--project hooks`, so a broken hook or a `settings.json` change reaches `main` without its proof running.
- **Fix A ⭐ Recommended**: Change "It also runs" to "`npm test` also runs".
  - Strength: Restores the true statement; the plan keeps `hooks` local on purpose ("What We're NOT Doing").
  - Tradeoff: The hook proof stays manual discipline.
  - Confidence: HIGH — one-word wording fix.
  - Blind spot: None significant.
- **Fix B**: Fix A plus a lint-staged entry `".claude/{hooks/**,settings.json}": "vitest run --project hooks"`.
  - Strength: Changes to hooks cannot be committed without their proof (~37 s, only when those files are staged).
  - Tradeoff: Extends gate scope beyond the plan.
  - Confidence: MED — lint-staged appends the file paths; they would need to be dropped or tolerated.
  - Blind spot: Behaviour of `vitest run --project hooks <paths>` with non-test paths not checked.
- **Decision**: FIXED (Fix A) — „`npm test` also runs the `hooks` project”

### F3 — Stop statusMessage does not mention the tests

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: .claude/settings.json:21-23
- **Detail**: The message still reads "(lint, ui:scan, astro check)" although Stop now also runs unit + component tests.
- **Fix**: Add "tests" to the statusMessage.
- **Decision**: FIXED — statusMessage wymienia unit + component tests

### F4 — lint-staged can run `vitest related` twice in parallel

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: package.json (lint-staged)
- **Detail**: The `*.ts` and `*.{astro,tsx}` groups run at the same time. With both kinds of file staged, two `vitest related` processes run in parallel, may run the same tests twice, and can read a file while the other group's `eslint --fix` rewrites it. Rare.
- **Fix**: Move `vitest related` to a single `*.{ts,tsx,astro}` group.
- **Decision**: FIXED — jedna grupa lint-staged `*.{ts,astro,tsx}`

### F5 — Ruleset checks are not tied to GitHub Actions

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/rulesets/main.json:24-26
- **Detail**: There is no `integration_id`, so a commit status named `ci`/`smoke` from any source satisfies the checks. In a public solo repo only accounts with write access can post statuses, so the risk is low.
- **Fix**: Add `"integration_id": 15368` to both checks and PUT the ruleset again.
- **Decision**: SKIPPED — repo solo, statusy może wysłać tylko autor; nie warte ponownego PUT rulesetu

### F6 — No test that script budgets stay below settings.json timeouts

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/hooks/agent-hooks.test.ts:507
- **Detail**: Only `timeout <= 120` is checked. Raising `BUDGET_MS` (50 000 / 100 000) above the timeouts (60 / 120 s) would bring back the silent kill the budgets exist to prevent.
- **Fix**: Parse `BUDGET_MS` from each script and assert it is below `timeout * 1000`.
- **Decision**: FIXED — test: BUDGET_MS < timeout × 1000 dla każdego skryptu

### F7 — Phase 4 Progress rows have no SHA; infrastructure.md uses the future tense

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: plan.md Progress 4.1–4.5; context/foundation/infrastructure.md:73
- **Detail**: Phase 4 changed only GitHub settings (empty diff), so SHA-less rows are legitimate. infrastructure.md says the repo "staje się publiczne" (was written before the switch).
- **Fix**: Optionally reword infrastructure.md:73 to "publiczne od 2026-10-20".
- **Decision**: FIXED — infrastructure.md: „repo jest publiczne od 2026-10-20”; brak SHA w Fazie 4 zostaje (pusty diff)
