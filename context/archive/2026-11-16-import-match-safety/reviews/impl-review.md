<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Import match safety

- **Plan**: context/changes/import-match-safety/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-11-16
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Gates re-run 2026-11-16: vitest unit+component+registry 610/610, lint exit 0, astro check 0 errors, ui:scan 0 hits. Mutations re-run (each restored with `git checkout --`): dropping the complete-row condition fails 4 tests, dropping `sameName` fails 1, dropping the edit-mode reason fails 1.

## Findings

### F1 — Numeric strength prefix gets an automatic assignment with a different dose

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/kit-import.ts:121 (with src/lib/registry-search.ts:111 `restMatches`)
- **Detail**: Strength words are matched by prefix, so the strength in the row only has to be the start of the registry strength. Probe on `searchVariants` + `sameName`: row `No-Spa;4 mg;tabletki` → one hit "No-Spa 40 mg", same name → `auto`; row `Xanax;0,2 mg;tabletki` → one hit "Xanax 0,25 mg" → `auto`. The label then says "jedyny lek w rejestrze o tej nazwie, mocy i postaci", but the dose is different. The plan accepted prefix matching of strength and form ("What We're NOT Doing"), but only showed the form example ("tabletki" → "tabletki powlekane"); a number that is the prefix of another number is a dose error, not a wording difference.
- **Fix A ⭐ Recommended**: For `auto`, also require every strength word of the row to equal (not prefix) a word of the variant's strength; form stays prefix-matched. Otherwise the hit becomes the only suggestion.
  - Strength: Closes the dose class without changing `searchVariants`; same pattern as `sameName` (word lists after normalization); one red unit test (`4 mg` vs `40 mg`) first.
  - Tradeoff: `exactStrength` must travel in `RowMatchRequest`; rows written "400mg" vs "400 mg" still match (words 400/mg vs 400mg? — check with a test).
  - Confidence: MED — word-level equality is simple, but unit spellings in CSV from chats (µg, mcg) may turn some correct rows into suggestions.
  - Blind spot: How many real rows fall back to suggestions — not measured on the full registry.
- **Fix B**: Keep the rule and change the label to not claim equal strength and form (e.g. "jedyny lek o tej nazwie pasujący do mocy i postaci z pliku"), PRD note updated.
  - Strength: Copy-only change; behaviour as decided in the plan.
  - Tradeoff: A 4 mg → 40 mg assignment still happens without a click; only the claim is honest.
  - Confidence: HIGH — trivial change.
  - Blind spot: Users rarely read the label; the risk stays.
- **Decision**: FIXED (Fix A) — `RowMatchRequest.exactStrength` + `hasEveryWord` in `src/lib/registry-search.ts`; `matchRow` assigns on its own only when every word of the row's strength is a whole word of the hit's strength. Red-first unit tests (`4 mg` vs `40 mg`, `0,2 mg` vs `0,25 mg`, `hasEveryWord`); dropping the condition turns the F1 test red. PRD FR-009 note updated. On the full local registry the old rule auto-assigned another dose for 5 030 generated "dose minus last digit" rows (e.g. `Accordeon;4 mg;Tabletki` → Accordeon 40 mg). Manual check by the agent at the user's request (2026-11-16, http://localhost:4321/apteczka/import, full registry): `Accordeon;40 mg;Tabletki` assigned on its own with the label; `Accordeon;4 mg;Tabletki` shows "Wybierz lek z rejestru:" with Accordeon 40 mg as the only suggestion, no label.

### F2 — Manual checks 1.6 and 2.7 marked done without a trace of who ran them

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/import-match-safety/plan.md:247, :262
- **Detail**: Both manual items are `[x]` with the phase SHA. A manual check leaves no evidence in the diff; lessons.md requires the user to decide which manual checks they run before any is ticked.
- **Fix**: Confirm the user ran (or delegated) them; if not, untick and run them on http://localhost:4321/apteczka/import.
- **Decision**: DISMISSED — the user delegated both manual checks to the implementing agent in the session before /clear; `.astro/dev.log` shows `/apteczka/import`, `search-list` and `packages` requests up to 13:15, right after the phase 2 commit (13:14).
