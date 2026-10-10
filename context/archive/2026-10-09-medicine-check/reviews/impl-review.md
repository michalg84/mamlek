<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-03 Sprawdzenie leku przeciwko apteczce

- **Plan**: context/changes/medicine-check/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 7 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Success criteria evidence

Run on head `640292d`, 2026-10-10, local Supabase with the full registry (20 257 products).

| Step          | Command                                           | Result                                                                                                                      |
| ------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1.1           | `npx supabase db reset`                           | Not re-run (it would wipe the locally imported full registry). Migration `20261010120000` is applied in the local database. |
| 1.2           | `node scripts/medicine-check-check.mjs`           | Pass, 13 of 13 cases                                                                                                        |
| 1.3           | fixtures v1, v1, v2 + `registry-import-check.mjs` | Not re-run (it would replace the full registry with fixtures). CI runs it.                                                  |
| 1.4, 2.2, 3.1 | `npm run lint`, `npm run ui:scan`                 | Pass, 0 hits in 7 files                                                                                                     |
| 2.1, 3.1      | `npx astro sync && npx astro check`               | Pass, 0 errors, 0 warnings                                                                                                  |
| 2.3, 3.2      | `npm run build`                                   | Pass                                                                                                                        |
| 2.4, 3.3      | `npm run smoke` (wrangler dev on the build)       | Pass, 30 of 30 steps                                                                                                        |
| 2.5           | `npm run ui:shots -- --label impl-review`         | Pass, 36 of 36 screenshots                                                                                                  |
| 3.4           | `grep -rn "dashboard\|Welcome" src`               | Empty                                                                                                                       |

Manual steps 1.5, 1.6, 2.6–2.9, 3.5 and 3.6 are ticked in Progress. They were not repeated in this review.

## Findings

### F1 — Unlisted generic common names give a false "same substance"

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261010120000_medicine_check.sql:35-53, :166-168
- **Detail**: `medicine_check_is_generic` is an exact match against seven strings, and a common-name match alone is enough for `substance`. Measured on the full local registry: the common names "Preparat witaminowy" (7 products), "Produkt witaminowy" (4), "Produkt odżywczy" (2) and "Produkt immunostymulujący" (3) are not on the list. Cernevit and Soluvit N share "Preparat witaminowy" with different vitamin sets, so having one and checking the other answers "Masz lek z tą samą substancją czynną". Clinimix N17G35E and N9G15E match the same way. These are hospital products, so few home kits are affected, but the registry refreshes daily and new placeholders can appear without a code change. A heuristic search for other shared common names with unrelated substances found only spelling variants of one substance.
- **Fix A ⭐ Recommended**: Treat any common name or substance starting with "produkt " or "preparat " as generic, and keep the exact list for the rest.
  - Strength: Covers all four measured names and future ones of the same shape; Latin common names never start with these Polish class words.
  - Tradeoff: A broader rule than D1 states; needs a line in research.md and a new check-script case.
  - Confidence: MEDIUM — measured on one export; names with one product were not listed.
  - Blind spot: Placeholders of another shape (e.g. "Species sedativae" for herbal mixes) stay matchable.
- **Fix B**: Add the four measured strings to the exact list.
  - Strength: Smallest change, same mechanism as today.
  - Tradeoff: The next new placeholder in a daily import is a false match until someone notices.
  - Confidence: HIGH — fixes exactly the measured cases.
  - Blind spot: Same as Fix A, plus future names.
- **Decision**: FIXED via Fix A — prefix rule added to `medicine_check_is_generic` in the migration (edited in place, not deployed yet), new case in `medicine-check-check.mjs` (failed before, passes after; 14 of 14). On the full registry the prefix hits only class words (13 common names, 2 substance names).

### F2 — Screen-reader announcement leaves out the caution and the "no composition" note

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/registry/MedicineCheckResult.tsx:153, :190-192
- **Detail**: The live region announces only the verdict title and detail. On a substance match a screen-reader user hears "Masz lek z tą samą substancją czynną. Nurofen" without the FR-012 caution; on an uncomparable medicine they hear "Nie masz tego leku" without the note that substances could not be checked.
- **Fix**: Append `CAUTION` or `UNCOMPARABLE` to `announcement` when the note is shown.
- **Decision**: FIXED — the announcement now includes the caution (whenever substance items are shown) and the "no composition" note.

### F3 — Rule check script runs against any DATABASE_URL

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/medicine-check-check.mjs:10-14, :102-103
- **Detail**: The script inserts into `auth.users`, `registry_*` and `kit_items` and always rolls back (`rollback` in `finally`, no `commit`). Pointed at production it would still fire `auth.users` triggers, hold locks and consume `kit_items` identity values. `scripts/registry-search-check.mjs:22-23,94-95` already has a `LOCAL_HOSTS` guard.
- **Fix**: Copy the `LOCAL_HOSTS` guard (exit 2) into the script and mention it in the AGENTS.md tripwire.
- **Decision**: FIXED — `LOCAL_HOSTS` guard added (exit 2 for a missing, invalid or non-local `DATABASE_URL`); AGENTS.md tripwire updated.

### F4 — "Masz ten lek" stays green when every matching pack is expired

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/registry/MedicineCheckResult.tsx:39-47, :80, :92
- **Detail**: One pack expired in 2020 gives the success verdict "Masz ten lek · 1 opakowanie". "przeterminowany" appears only in the row below and is not announced. The plan keeps expiry warnings out of scope (S-08) and asks only for the row label, so this matches the plan.
- **Fix A ⭐ Recommended**: Record it as an input for S-08 (expiry-warning) in the roadmap.
  - Strength: Keeps S-03 at its planned scope; S-08 already owns expiry at the check result.
  - Tradeoff: Until S-08 the verdict can read as "no need to buy" for an expired pack.
  - Confidence: HIGH — "What We're NOT Doing" names S-08 for this.
  - Blind spot: S-08 is nice-to-have and first to slip.
- **Fix B**: Add "przeterminowane" to the verdict detail now when all variant packs are expired.
  - Strength: The answer at the pharmacy counter is correct today.
  - Tradeoff: Scope beyond the plan; overlaps S-08.
  - Confidence: MEDIUM — small code change, but wording and colour are a product decision.
  - Blind spot: Mixed cases (some packs expired) are undecided.
- **Decision**: FIXED via Fix A — recorded as an unknown under S-08 in `context/foundation/roadmap.md`; no code change in S-03.

### F5 — Clear-on-edit behaviour is not in the plan

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/registry/MedicineSuggest.tsx:15, :63; src/components/registry/RegistrySearch.tsx:54-56
- **Detail**: Commit `3c974ae` added an optional `onEdit` prop to `MedicineSuggest` and clears the selected medicine and verdict on any keystroke, plus a `edited-after-pick` state in `ui-shots`. It fixes a real mismatch (a verdict under a different typed name) and is backward compatible, but the plan does not describe it.
- **Fix**: Add a short addendum to plan.md describing the behaviour and the commit.
- **Decision**: FIXED — `## Addenda` section added to plan.md (clear-on-edit, the F1 prefix rule, the announcement changes, the local-only guard).

### F6 — Verdict may be announced twice

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/registry/MedicineCheckResult.tsx:157, :190
- **Detail**: The visible verdict block has `role="status"` and the sr-only region with the same text has it too. Some screen readers read both. Not confirmed with a screen reader in this review; manual step 2.9 is ticked.
- **Fix**: Drop `role="status"` from the visible block and change the `VERDICT` selector in `scripts/ui-shots.mjs` to a data attribute.
- **Decision**: FIXED — the visible verdict block has `data-verdict` instead of `role="status"`; `VERDICT` in `scripts/ui-shots.mjs` selects `[data-verdict]`. Not re-checked with a screen reader.

### F7 — AGENTS.md has stale lines

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: AGENTS.md:41, :55
- **Detail**: The `ui:shots` tripwire still says "7-state matrix" (the script now captures 18 states), and "Product context" still says `supabase/migrations/`, `src/types.ts` and `src/components/hooks/` "don't exist yet".
- **Fix**: Update both lines.
- **Decision**: FIXED — `ui:shots` tripwire describes the `STATES` array; the "don't exist yet" sentence removed.

### F8 — Rule script and smoke miss a few cases

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/medicine-check-check.mjs:38-77, :222-226; scripts/smoke.mjs ("medicine check hides the medicine from another account")
- **Detail**: Not asserted: a multi-part common name in another order ("A + B" vs "B + A"), a partial overlap that must not match ("A" vs "A + B"), a variant match with NULL strength on both sides, and `comparable: false` in the "only substance Preparat złożony" case. The SQL handles all of them correctly on reading. The smoke isolation step checks that the first account's `packageId` is absent; `items.length === 0` is stricter.
- **Fix**: Add the four cases to the script and tighten the smoke assertion.
- **Decision**: FIXED — four cases added to `medicine-check-check.mjs` (17 of 17 pass), `comparable: false` asserted in the generic-substance case, smoke isolation step asserts an empty item list.

### F9 — Response shape is cast, and `searched` repeats `RegistryVariant`

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/medicine-check.ts:16; src/types.ts:84-121; src/components/registry/RegistrySearch.tsx:45
- **Detail**: `kit.ts` maps rows to DTOs; here the RPC builds camelCase JSON and the service casts it, so a renamed key in SQL passes type-checking. `RegistrySearch` stores `MedicineCheckResponse["searched"]` in a `RegistryVariant` state and relies on the two shapes being identical.
- **Fix**: Type `searched` as `RegistryVariant` in `MedicineCheckResponse`.
- **Decision**: FIXED — `MedicineCheckResponse.searched` is typed as `RegistryVariant`.

### F10 — Expired flag exists on /szukaj but not on /apteczka

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/registry/MedicineCheckResult.tsx:74-100; src/pages/apteczka.astro:89-108
- **Detail**: The same pack is marked "przeterminowany" in the check result and not in the kit list. The expiry test is inline in the component, not in `src/lib/kit-format.ts`. The plan leaves `/apteczka` to S-05.
- **Fix**: Move the test to `kit-format.ts` as `isExpired` now; use it on `/apteczka` in S-05.
- **Decision**: FIXED — `isExpired` and `todayIso` moved to `src/lib/kit-format.ts` and used by the check result; `/apteczka` adoption recorded under S-05 in the roadmap.

## Triage

Completed 2026-10-10. All ten findings fixed (F1 and F4 via Fix A); none skipped.

Checks after the fixes, on the working tree (not committed), local Supabase with the full registry:

| Command                                         | Result                     |
| ----------------------------------------------- | -------------------------- |
| `npx astro check`                               | Pass, 0 errors             |
| `npm run lint`, `npm run ui:scan`               | Pass                       |
| `npm run build`                                 | Pass                       |
| `node scripts/medicine-check-check.mjs`         | Pass, 17 of 17 cases       |
| `npm run smoke`                                 | Pass, 30 of 30 steps       |
| `npm run ui:shots -- --label impl-review-fixed` | Pass, 36 of 36 screenshots |

Not re-run: `npx supabase db reset` and the fixture import check (both would wipe the full local registry). The changed `medicine_check_is_generic` function was applied to the local database with `create or replace`; the edited migration file itself has not been applied from scratch. The announcement changes (F2, F6) were not checked with a screen reader.
