<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Search view reads design tokens

- **Plan**: context/changes/search-view-tokens/plan.md
- **Scope**: Full plan (5 of 5 phases)
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-07
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Automated criteria re-run at review time: `ui:scan` 0 hits, `lint` 0, `astro check` 0 errors, `build` 0. CI on PR #25: `ci` and `smoke` green.

## Findings

### F1 — `/dashboard` is now unreachable from the UI; light Topbar sits on the dark Welcome page

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/components/Topbar.astro:5-29, src/components/Welcome.astro
- **Detail**: Topbar (also rendered by Welcome on a `bg-cosmic` page) is now opaque `bg-card`, and the "Dashboard" link was replaced by "Szukaj leku"; `/dashboard` is a protected route that no page links to. The plan lists both as accepted/deferred (What We're NOT Doing: Welcome/dashboard replaced in S-03), so this is not drift, but nothing records the unreachable dashboard.
- **Fix**: Keep as planned; add a line to the research.md charge ledger (C4) noting `/dashboard` is intentionally unreachable until S-03 replaces it.
- **Decision**: FIXED (Fix now)

### F2 — palette.md still says "None yet" for Phase 2 gate adjustments

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/search-view-tokens/palette.md (last section)
- **Detail**: Gates 2.5 and 3.7 are confirmed with no adjustments, but the section implies the gate is open.
- **Fix**: Change to "None — palette A confirmed on the real screen (Phase 3 gate)."
- **Decision**: FIXED (Fix now)

### F3 — `--label ..` escapes `.ui-shots/`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/ui-shots.mjs:38-40
- **Detail**: `/^[\w.-]+$/` accepts `.` and `..`, so PNGs would land in the repo root.
- **Fix**: Reject labels made only of dots: `&& !/^\.+$/.test(label)`.
- **Decision**: FIXED (Fix now)

### F4 — ui-scan misses some colour utility prefixes

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/ui-scan.mjs:23-33
- **Detail**: Prefixes `placeholder-`, `caret-`, `accent-`, `decoration-` are not scanned; the old code used `placeholder-white/40`, which this scan would not have caught. The pattern is the plan's 10x-ui pattern, so this is a deliberate-scope question.
- **Fix**: Add `placeholder|caret|accent|decoration` to the prefix list.
- **Decision**: FIXED (Fix now)

### F5 — lint-staged runs `eslint --fix` and `ui-scan` concurrently on the same file

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: package.json (lint-staged)
- **Detail**: Separate globs run in parallel; ui-scan reads the working tree while eslint may rewrite it. Worst case is a scan of a half-written file (rare).
- **Fix**: Single ordered entry `["eslint --fix", "node scripts/ui-scan.mjs"]` for `*.{astro,tsx}` (and keep `*.ts` on eslint only).
- **Decision**: FIXED (Fix now)

### F6 — shared sign-up helper has no local-host guard of its own

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: scripts/lib/test-account.mjs:7-8
- **Detail**: Both current callers (ui-shots, perf-search) guard against non-local hosts; a future caller could skip it.
- **Fix**: Check the host inside `signUpTestAccount` using a shared `LOCAL_HOSTS`.
- **Decision**: FIXED (Fix now)
