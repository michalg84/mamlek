<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Ostrzeżenie o kończącej się dacie ważności — plan implementacji

- **Plan**: context/changes/expiry-warning/plan.md
- **Scope**: Full plan (3 of 3)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-18
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

Gates re-run in this review (exit codes): vitest unit+component+registry 796/796 = 0, lint = 0, ui:scan = 0, astro check = 0. test:db (171) and ui:shots (42/42) were run in phase 3 and not repeated (DB is shared; it was taken by S-16).

## Findings

### F1 — `check-have` waits for a substring that the red verdict also contains

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/ui-shots.mjs:344
- **Detail**: `checkState("check-have", …, "Masz ten lek")` matches by substring, so "Masz ten lek, ale przeterminowany" would satisfy it. `check-have` is the mixed case and its default pack date is expired, so a date bug turning it red would still produce a screenshot without failing the state. Both reviewers found this independently.
- **Fix**: wait for "Masz ten lek ·" (the green title always has " · N opakowań").
- **Decision**: FIXED — `check-have` waits for "Masz ten lek ·" (the green title only); ui:shots not re-run (needs the shared DB), the mocked answer renders "Masz ten lek · 1 opakowanie" as seen on the phase-3 screenshot

### F2 — No test of the summary after a real date edit in the edit panel

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/kit/KitList.test.tsx:229
- **Detail**: Plan (phase 2, point 4) asks for "zmiana po edycji daty". The test "changes after a save that brings a new date" saves a quantity inline and the stubbed server returns another date, so it covers `handleSaved` but not the edit panel itself. The path is shared and the summary is derived from `items`, so the risk is small; the manual run on :4331 did not click a date edit either.
- **Fix**: add a test that opens „Edytuj”, changes the expiry month/year, saves, and asserts the summary and the row marker change.
- **Decision**: FIXED — new test "a date changed in the panel updates the marker and the expiry summary" in KitList.test.tsx (Edytuj → month 3, year 2028 → PATCH `expiry`, marker and summary gone); break-check: went red when handleSaved skipped the new date

### F3 — Different "ending" rule for variants and for substance, undocumented

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/lib/medicine-check-verdict.ts:131, :148
- **Detail**: For the medicine ("Masz ten lek") the detail "Ważność kończy się" shows when all valid packs are ending, even if expired packs also exist. For the substance verdict the suffix shows only when no pack is expired. Both match the plan text (Desired End State, lines 24–25) and both are pinned by tests, but the reason for the difference is nowhere in the code.
- **Fix**: add a one-line comment at both places stating why (the title of the variant verdict already counts only valid packs; the substance detail lists names, so mixing two states in one line would be unclear). No behaviour change.
- **Decision**: FIXED — one-line comment at each place in medicine-check-verdict.ts, no behaviour change

### F4 — Empty packs are counted by the list summary but not by the verdict

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/kit/KitList.tsx:344
- **Detail**: Known and recorded as an open risk in plan-brief.md ("można zmienić przy przeglądzie"), pinned by the test "counts an empty pack by its date too". Defensible: the list shows every pack in the kit.
- **Fix**: none needed; keep as is.
- **Decision**: ACCEPTED — known risk recorded in plan-brief.md

### F5 — `text-warning-foreground` used without `bg-warning`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/kit/KitItemDetails.tsx:44
- **Detail**: Elsewhere the token is paired with `bg-warning`. The plan prescribes exactly this class and the screenshots show it readable on the white card, so it is a deliberate choice, not drift.
- **Fix**: none needed; keep as is.
- **Decision**: ACCEPTED — the class the plan prescribes, readable on the screenshots

### F6 — `isExpired` still exported though only `expiryStatus` uses it

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/kit-format.ts:230
- **Detail**: Plan says `isExpired` stays (used by the rest of the code); in fact its only caller outside its tests is `expiryStatus`. Harmless.
- **Fix**: none needed; keep as is.
- **Decision**: ACCEPTED — harmless export, used by expiryStatus

## Notes

- Manual rows 3.4 and 3.5 were done by the agent (user's standing instruction), 3.6 (screen reader) stays open and optional. Evidence: Playwright pass on :4331 (markers, summary, delete) and screenshots `check-expired`, `check-have`, `check-have-expiring` (the mixed case is green "Masz ten lek · 1 opakowanie", readable).
- No change to `global.css`, `Layout.astro`, `ui-scan.mjs`, `AGENTS.md`, migrations or API: "What We're NOT Doing" respected.
