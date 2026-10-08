<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Add a Registry Medicine to the Home Kit

- **Plan**: context/changes/add-medicine-to-kit/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 7 observations (triaged 2026-10-08: 4 fixed, 1 accepted, 5 skipped)

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Verification run during review: `npm run lint`, `npx astro check` (0 errors) and `npm run ui:scan` (0 hits) re-run on the committed code. `npm run build` and `npm run smoke` (22/22 incl. page and second-account steps) last ran green at the Phase 3 gate on the same code. Manual checks were run by the agent at the user's request: 1.4/1.5 via psql (18 PASS), 2.3 via curl, 3.4-3.7 in a real browser (3.5 holder display used a temporary sibling product, since removed).

## Findings

### F1 — Unbounded `quantity` overflows Postgres `integer` and returns 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/kit/index.ts:9, src/components/kit/KitAddForm.tsx:79-86
- **Detail**: `quantity` is `z.number().int().min(0)` with no upper bound. The pack-size cap applies only to single-entry packs with a numeric count. For other packs (or any client bypassing the form) a value like 3000000000 passes validation, overflows `integer`, and `addKitItem` throws, so the API answers a generic 500 instead of 400.
- **Fix**: Add `.max(100000)` to the zod schema and use the same limit as the form's `max` when the pack has no cap.
- **Decision**: FIXED — `MAX_QUANTITY = 100000` in `src/lib/kit-format.ts`, used by the API schema and the form (validation and `max` attribute).

### F2 — Kit invariants are enforced only in the API, not the database

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261007120000_kit_items.sql:20-23, 58-71
- **Detail**: RLS lets an authenticated user insert/update their own `kit_items` straight through PostgREST. They can bypass the API and store a quantity above the pack size, an arbitrary `expires_on`, `expiry_precision = 'day'`, or a withdrawn `package_id`. Cross-user access stays blocked by the `with check` policies; this only affects the user's own rows. The migration header already documents the quantity cap as API-only.
- **Fix A ⭐ Recommended**: Accept and record it; F1's API bound covers the crash case
  - Strength: Matches the plan's explicit decision (cap in API because it depends on `units` parsing); damage is limited to the user's own data.
  - Tradeoff: A determined user can store nonsense in their own kit, which later slices (S-03 check, S-08 warnings) must tolerate.
  - Confidence: MED — depends on how defensively S-03/S-08 read `expires_on` and `quantity`.
  - Blind spot: Not checked what the later slices assume about these columns.
- **Fix B**: New migration with CHECKs (`quantity <= 100000`, `expires_on` between 2000-01-01 and 2100-12-31)
  - Strength: The database becomes the boundary that holds against direct clients.
  - Tradeoff: Another migration on a table not yet in production; still cannot enforce the pack-size cap or the withdrawn rule.
  - Confidence: MED — cheap, but covers only part of the gap.
  - Blind spot: Existing rows (none in production) and S-05 edit paths that would need the same limits.
- **Decision**: ACCEPTED (Fix A) — only the user's own rows are affected and F1 closed the crash case. Recorded as an optional post-MVP task in `context/foundation/roadmap.md` under Parked ("Zapis apteczki tylko przez aplikację"); options there: revoke write grants from `authenticated` and write via a DB function or service key, or add CHECK constraints.

### F3 — `roadmap.md` At-a-glance table re-padded by prettier (conflict risk)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: context/foundation/roadmap.md:39-53 (commit 46c1709)
- **Detail**: Setting S-02 to `in-progress` widened the Status column, and the pre-commit prettier hook re-padded every row (26 changed lines for a 2-line intent), including rows S-07 also edits. Merging with main (S-07 landed there as #27) is likely to conflict on the table.
- **Fix**: Before opening the PR, rebase/merge main, resolve the roadmap table once (keep main's rows, re-apply only the S-02 status change), and run prettier on the file.
  - Strength: Resolves the conflict where it appears and keeps the PR diff to the intended two lines.
  - Tradeoff: Needs a rebase or merge of the branch before the PR.
  - Confidence: MED — main has not been fetched in this review, so the conflict is expected but unconfirmed.
  - Blind spot: Whether main's roadmap already carries the widened column.
- **Decision**: FIXED — conflict confirmed on fetch (main changed S-07 status in the table and body). Merged origin/main as `0f26e7a`, kept our table, applied main's S-07 `planning`, ran prettier. Lint, astro check, ui:scan, build and smoke are green on the merged tree. Remaining diff against main in the table is column re-padding only (the wider `in-progress` cell), which prettier requires.

### F4 — `listKitItems` has no limit or pagination

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/kit.ts:122-129
- **Detail**: The kit list is unbounded and there is no per-user row cap. Household sizes are small and a user can only slow their own page.
- **Fix**: Leave for S-05 (`kit-browse-edit`), which owns browsing the kit.
- **Decision**: SKIPPED — left for S-05 (`kit-browse-edit`), which owns browsing the kit.

### F5 — No index supports the `registry_variant_packages` name/strength/form join

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261007120000_kit_items.sql:93-103
- **Detail**: The `lower(...)` join scans `registry_products` on every medicine pick. Likely milliseconds at registry size, but unmeasured.
- **Fix**: Measure on the full registry import; add a functional index only if slow.
- **Decision**: SKIPPED — measure on the full registry import first; add a functional index only if slow.

### F6 — `updated_at` has no update trigger

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261007120000_kit_items.sql:23
- **Detail**: No update path exists today, so the value is accurate. S-05 will add editing and `updated_at` would go stale.
- **Fix**: Add the trigger in S-05's migration when the first update path lands.
- **Decision**: SKIPPED — add the update trigger in S-05's migration when the first update path lands.

### F7 — `POST /api/kit` does not require a JSON content type

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/kit/index.ts:36-42
- **Detail**: `request.json()` accepts any content type, and Astro's `checkOrigin` only blocks form-like types. Supabase cookies are SameSite=Lax, so practical risk is low (same-site subdomains only).
- **Fix**: Reject non-JSON content types with 415.
- **Decision**: FIXED — `POST /api/kit` answers 415 unless `Content-Type` starts with `application/json`. Verified with curl: `text/plain` and no content type give 415, `application/json; charset=utf-8` still gives 201.

### F8 — Form can double-add or stay disabled after a save

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/kit/KitAddForm.tsx:118-133
- **Detail**: If the server answers 201 but `response.json()` throws, the catch shows a connection error and re-enables submit, so a retry would add a duplicate. After `location.assign`, the button stays disabled if the page returns from bfcache via Back.
- **Fix**: Navigate on `response.status === 201` without depending on the body, and reset `saving` on `pageshow`.
- **Decision**: FIXED — on 201 the form always navigates (to `/apteczka` without the banner id if the body is unreadable) and resets `saving` on a persisted `pageshow`. Lint, astro check, build and smoke are green; the bfcache Back path was not exercised in a browser.

### F9 — `getPackage` relies on `undefined !== null` narrowing

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/kit.ts:73
- **Detail**: `row?.registry_products?.removed_at !== null` is correct at runtime but subtle. The explicit form was rewritten into this one to satisfy the `prefer-optional-chain` lint rule, so reverting would re-break lint.
- **Fix**: Keep as is; add a one-line comment that a missing row or embed counts as unavailable.
- **Decision**: SKIPPED — kept as is (the explicit form re-triggers the lint rule).

### F10 — Small additions beyond the plan wording

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: scripts/smoke.mjs, src/components/kit/KitAddForm.tsx:124-185, src/pages/apteczka.astro:42-51
- **Detail**: Extras not in the plan: smoke walks up to 20 variants for one with packs (plan: "first variant") plus a `?product=abc` 400 step; the form adds 401/loading/retry states, a "Wybrano:" line, and clears quantity on pack change; the page adds the search-list preload link. All additive, none touch the "NOT doing" list or the S-07 reserved files.
- **Fix**: No code change; note them in the plan as an addendum if the plan is kept as ground truth.
- **Decision**: SKIPPED — additions accepted as they are.
