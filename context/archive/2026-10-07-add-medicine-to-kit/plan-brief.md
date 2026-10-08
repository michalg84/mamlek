# Add a Registry Medicine to the Home Kit — Plan Brief

> Full plan: `context/changes/add-medicine-to-kit/plan.md`

## What & Why

Roadmap slice S-02: a signed-in household account adds a medicine picked from the registry suggestions to its home kit, choosing the exact pack and optionally the remaining quantity and expiry month/year (FR-003, FR-013, US-01, NFR access). It is the first data the app writes, and the north-star check (S-03), CSV import (S-04) and kit editing (S-05) all build on it.

## Starting Point

The registry (products, packs, substances) is imported and read-only for signed-in users; `/szukaj` offers fast suggestions via `MedicineSuggest`, which returns a product id but no pack data. No table has an owner yet and no write endpoint exists.

## Desired End State

`/apteczka` (top-bar link „Apteczka”) shows an add form — medicine → pack → quantity → MM/YYYY — and a read-only list of the kit where missing quantity or date reads „nieznane” and withdrawn packs are labelled. After saving the page confirms „Dodano: …” and warns when the same pack is already in the kit. Another account never sees or changes these items.

## Key Decisions Made

| Decision               | Choice                                                         | Why (1 sentence)                                                                                     |
| ---------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Pack                   | User picks one pack; single pack auto-selected                 | FR-003 takes pack size and unit from the registry, and S-03 needs full pack data on both sides.      |
| Pack list coverage     | All active packs of the whole variant (incl. parallel imports) | The suggestion id is only a representative product; the user's box may come from a sibling one.      |
| Quantity               | Whole units of the pack, capped at pack size when derivable    | It is what you count in the drawer, and S-05 edits it inline later.                                  |
| Expiry                 | Month/year only; stored as last day + `expiry_precision`       | Matches the box; the column lets day precision arrive later without migrating rows.                  |
| Validity after opening | Out of S-02; new roadmap item after S-05                       | Not in RPL data and usually known only after adding, so it needs editing first.                      |
| Duplicates             | Separate item per pack, with a „kolejne opakowanie” notice     | Two boxes with different dates stay distinguishable for S-08; the notice catches accidental doubles. |
| After adding           | `/apteczka` with a read-only list                              | Shows the add worked and makes „nieznane” visible; S-05 extends the same list.                       |
| Ownership              | `user_id default auth.uid()`, per-operation RLS                | PRD: one account = one kit; the request never carries an owner.                                      |
| Isolation test         | Smoke with a second account                                    | The NFR „only after login, nobody else” gets an automated check.                                     |

## Scope

**In scope:**

- `kit_items` table, RLS, `registry_variant_packages` function
- `GET /api/registry/packages`, `POST /api/kit` (zod, server-side quantity cap)
- `/apteczka` page, `KitAddForm` island, Topbar link, `ui-scan` guard
- Smoke steps incl. cross-account isolation

**Out of scope:**

- Editing/deleting items, inline quantity (S-05); expiry warnings (S-08); checking (S-03); CSV (S-04)
- Day-precision expiry and validity after opening (future roadmap item)
- Fractional quantities, free-text medicines, sharing between households

## Architecture / Approach

Postgres owns isolation (RLS on `auth.uid()`) and the variant→packs lookup (SQL function, security invoker). A thin service in `src/lib/services/kit.ts` and two JSON endpoints follow the existing `search-list` pattern. Pure helpers in `src/lib/kit-format.ts` (pack label, quantity cap, expiry display) are shared by API and island. The island reuses `MedicineSuggest`; after a 201 it navigates to `/apteczka?dodano=<id>` and the server-rendered page shows the confirmation and list, so no client list state exists.

## Phases at a Glance

| Phase                    | What it delivers                                              | Key risk                                                           |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1. Data model            | Table, per-operation RLS, variant packs function              | A policy mistake leaks or blocks kit data — checked with two users |
| 2. Services and API      | Types, helpers, service, two endpoints, smoke incl. isolation | `units[]` shapes the fixtures don't cover (multi-entry packs)      |
| 3. Kit page and add form | `/apteczka`, add form, read-only list, nav link               | Phone-width layout of a long pack list                             |

**Prerequisites:** S-01 done (it is); local Supabase with fixtures imported; email confirmation off locally for smoke.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- RPL pack ids stay stable across exports — assumed from the upsert design, not guaranteed by RPL.
- Real `units[]` data may hold multi-entry packs more often than fixtures suggest; those get no quantity cap or unit word.
- „Validity after opening” must be added to the roadmap (via `/10x-roadmap`) so S-08 is planned with it in mind.

## Success Criteria (Summary)

- A signed-in user adds a medicine with the exact pack in under a minute on a phone, with or without quantity and date.
- The list shows what was added, with „nieznane” for missing fields.
- A second account sees an empty kit — verified by smoke on every CI run.
