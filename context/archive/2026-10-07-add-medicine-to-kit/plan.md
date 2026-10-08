# Add a Registry Medicine to the Home Kit Implementation Plan

## Overview

Roadmap slice S-02 (FR-003, FR-013, US-01, NFR access). A signed-in household account picks a medicine from the registry suggestions, chooses one of its packs, optionally gives the remaining quantity (whole units of the pack) and the expiry month/year, and saves it to its home kit (`apteczka`). The kit is a new user-owned table isolated per account by RLS; a new `/apteczka` page holds the add form and a read-only list where missing quantity or date reads „nieznane”. This is the first write path in the app and unblocks S-03, S-04 and S-05.

## Current State Analysis

- Registry data is read-only for `authenticated` and owner-written by the import script. Re-imports never delete rows; withdrawn products and packs get `removed_at` (`scripts/registry-import.mjs:232-242`, `context/archive/2026-10-01-registry-copy-load/plan.md:47`), so a foreign key from a kit item to `registry_packages(id)` is stable.
- Packs live in `registry_packages` (`supabase/migrations/20261001120000_registry_tables.sql:92-114`): `id bigint` (RPL `opakowanie@id`), `product_id`, nullable `gtin`, `availability_category`, `units jsonb` = array of `{count, kind, capacity, capacity_unit, info}` with raw string values (`scripts/lib/rpl-parser.mjs:122-131`). Typical units: `30 sasz.`, `1 fiol. 5 ml`, `20 sasz. 2 g`. A product usually has several packs.
- Suggestions (`src/components/registry/MedicineSuggest.tsx`, props `{version, onSelect, label?}`) return a `RegistryVariant` (`src/types.ts:25-32`) whose `id` is a _representative_ `registry_products.id` of a variant = distinct `(lower(name), lower(strength), lower(form))` among active products (`supabase/migrations/20261002130000_registry_search_list_version.sql:391-431`). Suggestions carry no pack data. The S-01 plan intended `MedicineSuggest` for reuse in this form (`context/archive/2026-10-02-registry-search-suggestions/plan.md:220`).
- No table has an owner column or an `auth.uid()` policy yet; registry migrations explicitly revoke writes from `anon`/`authenticated` (`20261001120000_registry_tables.sql:185-193`). No write API exists.
- Patterns to follow: service functions taking a `SupabaseClient` and throwing on error (`src/lib/services/registry-search-list.ts:7-30`); page frontmatter with `createClient` + try/catch → failed/empty/data states (`src/pages/szukaj.astro:10-24, 45-53`); JSON API with zod from `astro/zod`, `json()` helper, 503 null client → 401 no user → 400 invalid → 500 (`src/pages/api/registry/search-list.ts:2-43`).
- `src/middleware.ts:4` `PROTECTED_ROUTES = ["/dashboard", "/szukaj"]`; API routes check `locals.user` themselves. Nav links live in `src/components/Topbar.astro:7,15-23`.
- `scripts/smoke.mjs` posts urlencoded forms only (`:23-41`), one global cookie jar (`:7-21`), steps array (`:68-114`).
- UI components available: `button`, `card`, `input` only. `ui-scan` GUARDED list at `scripts/ui-scan.mjs:19-24`.

## Desired End State

A signed-in user opens `/apteczka` (link „Apteczka” in the top bar), types a medicine name, picks a suggestion, picks a pack from the list (auto-selected when only one), optionally enters quantity „12” (shown with the cap „z 30 sasz.”) and expiry month/year, and saves. The page reloads with „Dodano: …” and, when the kit already held the same pack, „To już kolejne opakowanie tego leku w apteczce”. The read-only list below shows every item with name, strength, form, pack label, quantity (or „nieznane”), expiry „MM/RRRR” (or „nieznane”) and a „wycofany z rejestru” label for withdrawn packs. A second account never sees or modifies the first account's items. Verified by `db reset` + fixture import, `npm run smoke` (incl. cross-account isolation), `/ci-check` and a manual phone-width pass.

### Key Discoveries:

- Pack IDs are stable and never deleted — FK with no `on delete` action needed beyond the default (`scripts/registry-import.mjs:240-242`).
- A variant can span several products (parallel imports, different MAHs); the pack list must cover all of them, not only the representative id (`20261002130000_registry_search_list_version.sql:391-431`).
- `units[]` values are text and can have several entries — pack size/unit must be derived defensively (`scripts/lib/rpl-parser.mjs:122-131`).
- REFERENCES is revoked from API roles on registry tables; the FK is created by the migration owner, so it is unaffected (`20261001120000_registry_tables.sql:188-193`).

## What We're NOT Doing

- Editing, deleting, grouping or inline quantity editing of kit items — S-05 (`kit-browse-edit`).
- Day-precision expiry and „valid N days after opening” tracking — a new roadmap item after S-05; the schema already stores `expiry_precision` so the day arrives without a data migration. In S-02 `expiry_precision` is always `'month'`.
- Expiry warnings — S-08.
- Checking a medicine against the kit — S-03. CSV import — S-04.
- Free-text medicines (not from the registry) — PRD forbids them.
- Households with several logins, invites or sharing — PRD: one account = one kit.
- Fractional quantities ("half a bottle") — quantity is whole units of the pack.
- Cleaning up the starter `dashboard.astro`.
- Showing the registry state date on `/apteczka` (S-07 adds it to `/szukaj` only and leaves other screens to their own slices).

## Implementation Approach

Database first (table, RLS, pack lookup function), then a thin service + JSON API layer verified by smoke (including a second account), then the UI. After a successful POST the island navigates to `/apteczka?dodano=<id>`; the server-rendered page reads the list and the duplicate count, so no client-side list state needs syncing.

## Critical Implementation Details

- **Pack size and unit derivation** (shared by API validation and UI): when `units` has exactly one entry and its `count` is a positive integer string, the quantity unit is that entry's `kind` and the cap is `count`; otherwise the quantity has no cap and no unit word (the pack label is still shown). The pack label joins every entry as `<count> <kind>[ <capacity> <capacity_unit>]` with `+` between entries, falling back to „opakowanie” when `units` is empty. Keep this in one pure helper used by both server and client.
- **Expiry storage**: month/year is stored as the last day of that month in `expires_on`, with `expiry_precision = 'month'`; display reads precision, never the day, so „31.03.2027” is never shown for a month-only date. Past dates are allowed (expired boxes exist in drawers).
- **Parallel change S-07 (`daily-registry-refresh`, worktree `../mamlek-s07`)**: it edits `scripts/smoke.mjs` (one `check` on the `/szukaj` step), `src/pages/szukaj.astro`, `.github/workflows/registry-import.yml`, `README.md`, `AGENTS.md` and the S-07 lines of `roadmap.md`. Keep S-02's smoke edits additive (above) and don't touch `szukaj.astro`, so whichever PR merges second rebases without conflicts. After S-07 the registry re-imports daily: pack/product `removed_at` changes daily (handled by the withdrawn label) and the search-list `version` bumps daily (the form already takes `version` from the page).
- **Ownership is set by the database**, not the request: `user_id` defaults to `auth.uid()` and the insert policy's `with check` requires `user_id = (select auth.uid())`; the API never accepts a `user_id`.

## Phase 1: Data model

### Overview

Create the kit table with per-operation RLS for the owning account, and a function that lists the active packs of a suggestion's whole variant.

### Changes Required:

#### 1. Kit table migration

**File**: `supabase/migrations/20261007120000_kit_items.sql`

**Intent**: Introduce `public.kit_items` as the household's kit — one row per physical pack — owned by the signed-in account and readable/writable only by it.

**Contract**:

- Columns: `id bigint generated always as identity primary key`; `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`; `package_id bigint not null references public.registry_packages(id)`; `quantity integer null check (quantity >= 0)`; `expires_on date null`; `expiry_precision text null check (expiry_precision in ('month','day'))`; `created_at`, `updated_at timestamptz not null default now()`.
- Table check: `(expires_on is null) = (expiry_precision is null)`.
- Index on `(user_id, package_id)` (list per user + duplicate count).
- RLS enabled; four policies `to authenticated` — select / insert (`with check`) / update (`using` + `with check`) / delete — each on `user_id = (select auth.uid())`. No policies for `anon`.
- Grants: `select, insert, update, delete` on the table to `authenticated`; revoke all from `anon`; revoke `truncate, references, trigger` from `authenticated`. Comment why this differs from the read-only registry tables.
- Quantity cap is enforced in the API (it depends on `units` parsing), not by a constraint.

#### 2. Variant packs function

**File**: same migration

**Intent**: Return the active packs of every active product sharing the picked suggestion's variant key, so the user can find their box even when it comes from a parallel import.

**Contract**: The variant key is read from `p_product_id` _without_ filtering its `removed_at` (the daily S-07 import can withdraw the representative between page load and pick; its siblings must still be found). `public.registry_variant_packages(p_product_id bigint)` → table `(package_id bigint, product_id bigint, gtin text, availability_category text, units jsonb, marketing_authorization_holder text)`; `language sql stable security invoker`; matches products where `lower(name)`, `lower(coalesce(strength,''))`, `lower(coalesce(pharmaceutical_form,''))` equal those of `p_product_id` (same keying as the search-list variant definition — copy its null handling), both product and package `removed_at is null`; ordered by `product_id = p_product_id desc, product_id, package_id`. `revoke execute ... from public, anon`; `grant execute ... to authenticated`. Empty result for an unknown id.

### Success Criteria:

#### Automated Verification:

- Local database resets with the new migration: `npx supabase db reset`
- Fixture imports and the import check still pass: import `scripts/fixtures/rpl-sample-v1.xml` twice and `rpl-sample-v2.xml` once with `npm run registry:import -- --file <path>`, then `node scripts/registry-import-check.mjs`
- Type check, lint and build pass: `/ci-check`

#### Manual Verification:

- In Supabase Studio SQL (as two different `authenticated` users via `set local role` + `request.jwt.claims`), user B selects 0 rows of user A's kit item and cannot update/delete it; an insert with someone else's `user_id` is rejected
- `select * from registry_variant_packages(<fixture product id>)` returns that product's active packs and none with `removed_at`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Services and API

### Overview

Shared types and pure helpers, a kit service, a pack lookup endpoint and an add endpoint; smoke covers anonymous access, adding and cross-account isolation.

### Changes Required:

#### 1. Types

**File**: `src/types.ts`

**Intent**: Shared shapes for packs and kit items used by API, page and island.

**Contract**: `RegistryPackageUnit {count, kind, capacity, capacity_unit, info}` (strings or null); `RegistryVariantPackage {packageId, productId, gtin, availabilityCategory, units, holder}`; `KitItem {id, packageId, name, strength, form, holder, units, quantity: number | null, expiresOn: string | null, expiryPrecision: "month" | "day" | null, withdrawn: boolean, createdAt}`; `AddKitItemRequest {packageId: number, quantity?: number | null, expiry?: {month: number, year: number} | null}`; `AddKitItemResponse {id: number}`.

#### 2. Pure formatting helpers

**File**: `src/lib/kit-format.ts`

**Intent**: One place for the pack label, quantity unit/cap and expiry display/storage rules (see Critical Implementation Details), used by the API and the browser.

**Contract**: `packLabel(units)`, `packQuantity(units): {unit: string | null, max: number | null}`, `expiryToDate(month, year): string` (ISO last day of month), `formatExpiry(expiresOn, precision): string` („MM/RRRR”, „DD.MM.RRRR” for `day`, „nieznane” for null), `formatQuantity(quantity, units): string` („12 z 30 sasz.”, „12”, „nieznane”). No imports from server-only modules.

#### 3. Kit service

**File**: `src/lib/services/kit.ts`

**Intent**: Database access for the kit, following `registry-search-list.ts` (takes the session client, throws `Error` with context on failure).

**Contract**: `getVariantPackages(supabase, productId)` → `RegistryVariantPackage[]` via `rpc("registry_variant_packages")`; `getPackage(supabase, packageId)` → active package with `units` or null; `addKitItem(supabase, input)` → `{id}`; `listKitItems(supabase)` → `KitItem[]` (join package → product, newest first; `withdrawn` = package or product `removed_at` not null); `countKitItemsWithPackage(supabase, packageId)` → number.

#### 4. Pack lookup endpoint

**File**: `src/pages/api/registry/packages.ts`

**Intent**: Give the form the packs for a picked suggestion.

**Contract**: `GET /api/registry/packages?product=<positive int>` → `200 {packages: RegistryVariantPackage[]}` (possibly empty); 503 null client, 401 no user, 400 invalid param, 500 service error; `Cache-Control: no-store`. Same order of checks and `json()` helper style as `search-list.ts`.

#### 5. Add endpoint

**File**: `src/pages/api/kit/index.ts`

**Intent**: Validate and store one kit item for the signed-in account.

**Contract**: `POST /api/kit`, JSON body validated with zod (`astro/zod`): `packageId` positive int; `quantity` optional nullable int ≥ 0; `expiry` optional nullable `{month: 1–12, year: 2000–2100}`; unknown keys rejected (`.strict()`). Server loads the package: missing or withdrawn → 400 `{error}`; quantity above `packQuantity(units).max` → 400. Inserts with `expires_on = expiryToDate(...)`, `expiry_precision = 'month'` when expiry is given. Responses: `201 {id}`, 400 `{error, issues?}`, 401, 503, 500. Same `json()` helper style.

#### 6. Protect the page route

**File**: `src/middleware.ts`

**Intent**: Redirect anonymous users away from the kit page.

**Contract**: add `"/apteczka"` to `PROTECTED_ROUTES`.

#### 7. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Cover the first write path and account isolation end-to-end against fixtures.

**Contract**: `request()` gains optional `json` and `jar` options (`json` sets `Content-Type: application/json`; `jar` defaults to the existing global jar, so every existing call and step stays byte-for-byte unchanged — S-07 adds a `check` to the „search page renders for signed-in user” step in parallel, see Critical Implementation Details); `cookieHeader`/`storeCookies` take the jar as a parameter. New steps go in their own block after the search-list steps and before signout, never edit existing step lines. New steps: anonymous `GET /apteczka` → redirect to `/auth/signin`, anonymous `POST /api/kit` → 401; signed in: take the first variant id from the search list, `GET /api/registry/packages?product=<id>` → 200 with ≥1 pack, `POST /api/kit` with `{packageId}` → 201, with `{packageId, quantity: -1}` → 400, with unknown `packageId` → 400, `GET /apteczka` → 200 containing „nieznane” and the medicine name; second account: `GET /apteczka` → 200 without that medicine name. Keep signout steps last.

### Success Criteria:

#### Automated Verification:

- Type check, lint and build pass: `/ci-check`
- Smoke passes against the local production build with fixtures imported: `npm run smoke`

#### Manual Verification:

- `POST /api/kit` with `quantity` above the pack's count returns 400 for a single-unit pack (e.g. via browser devtools fetch while signed in)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Kit page and add form

### Overview

The `/apteczka` page with the add form island and the read-only list, linked from the top bar.

### Changes Required:

#### 1. shadcn components

**File**: `src/components/ui/label.tsx`, `src/components/ui/radio-group.tsx`

**Intent**: Accessible form labels and the pack choice list.

**Contract**: `npx shadcn@latest add label radio-group`.

#### 2. Add form island

**File**: `src/components/kit/KitAddForm.tsx`

**Intent**: Pick medicine → pack → optional quantity and expiry → save.

**Contract**: props `{version: number}`. Steps: `MedicineSuggest` (label „Lek”) → on select fetch `/api/registry/packages?product=<id>`; radio list of packs labelled with `packLabel(units)` plus the holder when packs come from more than one product; single pack preselected; empty list → message „Brak aktywnych opakowań tego leku w rejestrze”. Quantity: `Input type="number" inputMode="numeric" min=0 max=<cap>` with suffix „z <cap> <unit>” when known; empty = unknown. Expiry: month select (01–12) + year select (current year − 5 … + 10), both empty = unknown; one without the other is a field error. Submit disabled until a pack is chosen and while saving; on 201 `window.location.assign("/apteczka?dodano=<id>")`; on error show the API message (role `alert`, `text-destructive`). Changing the medicine resets pack, quantity and expiry. Role classes only; `cn()` for conditional classes; logic beyond trivial state goes to a hook in `src/components/hooks/` if it grows (e.g. `useVariantPackages`).

#### 3. Kit page

**File**: `src/pages/apteczka.astro`

**Intent**: Server-render the form, the post-add confirmation and the read-only list.

**Contract**: frontmatter follows `szukaj.astro`: `createClient` → `getSearchListVersion` + `listKitItems`; when `?dodano=<id>` matches a listed item, show „Dodano: <name>” and, if `countKitItemsWithPackage > 1`, „To już kolejne opakowanie tego leku w apteczce”. States: failure → destructive message; registry not imported → muted message instead of the form (list still shown); empty kit → „Apteczka jest pusta”. List rows: name, strength, form, `packLabel`, „Ilość: ” `formatQuantity`, „Ważny do: ” `formatExpiry`, muted „wycofany z rejestru” when `withdrawn`. Layout: `Layout` + `Topbar` + `Card` like `/szukaj`, phone-width safe (`min-w-0`, wrapping text).

#### 4. Navigation

**File**: `src/components/Topbar.astro`

**Intent**: Reach the kit from every signed-in page.

**Contract**: „Apteczka” link next to „Szukaj leku”, `aria-current="page"` on `/apteczka`, same `buttonVariants` styling.

#### 5. UI guard

**File**: `scripts/ui-scan.mjs`

**Intent**: Keep the new views on tokens.

**Contract**: add `src/pages/apteczka.astro` and `src/components/kit/KitAddForm.tsx` to `GUARDED`.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan is clean: `npm run ui:scan`
- Type check, lint and build pass: `/ci-check`
- Smoke still passes: `npm run smoke`

#### Manual Verification:

- At http://localhost:4321/apteczka: add a medicine with quantity and expiry, then the same pack again without them — confirmation, duplicate notice, „12 z 30 …”, „03/2027” and „nieznane” render correctly
- Pack auto-selected for a single-pack medicine; holder shown when packs come from several products
- At 390 px width no horizontal scroll; keyboard-only flow works with visible focus
- Second account at http://localhost:4321/apteczka sees an empty kit

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — there is no unit test runner yet (AGENTS.md). The pure helpers in `src/lib/kit-format.ts` are kept side-effect free so they can be covered when Module 3 adds a runner.

### Integration Tests:

- `npm run smoke`: anonymous redirect/401, pack lookup, add 201, invalid add 400, list shows „nieznane”, second account isolation.

### Manual Testing Steps:

1. Sign in, open http://localhost:4321/apteczka, add „Ibuprom”-like fixture medicine with quantity and expiry.
2. Add the same pack without quantity/date — duplicate notice, „nieznane” twice.
3. Try quantity above the pack size — field/API error.
4. Sign in as a second account — empty kit.
5. Repeat 1 at 390 px width.

## Performance Considerations

The form reuses the S-01 suggestion worker and list download (cached by `?v=`), so no new large payloads. The pack lookup is one small RPC per pick. The kit list is per-user and small; index `(user_id, package_id)` covers list and duplicate count.

## Migration Notes

New table and function only; no existing data touched. Production migrations reach the cloud database through the usual deploy path; the page shows its failure state if the app ships before the migration.

## References

- Roadmap: `context/foundation/roadmap.md` (S-02)
- PRD: `context/foundation/prd.md` (FR-003, FR-013, Access Control, NFR)
- Registry schema: `supabase/migrations/20261001120000_registry_tables.sql:21-193`
- Variant definition: `supabase/migrations/20261002130000_registry_search_list_version.sql:391-431`
- Service / API / page patterns: `src/lib/services/registry-search-list.ts`, `src/pages/api/registry/search-list.ts`, `src/pages/szukaj.astro`
- Suggestion component intended for reuse: `context/archive/2026-10-02-registry-search-suggestions/plan.md:220`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data model

#### Automated

- [x] 1.1 Local database resets with the new migration — 46c1709
- [x] 1.2 Fixture imports and the import check still pass — 46c1709
- [x] 1.3 Type check, lint and build pass — 46c1709

#### Manual

- [x] 1.4 In Supabase Studio SQL (as two different `authenticated` users via `set local role` + `request.jwt.claims`), user B selects 0 rows of user A's kit item and cannot update/delete it; an insert with someone else's `user_id` is rejected — 46c1709
- [x] 1.5 `select * from registry_variant_packages(<fixture product id>)` returns that product's active packs and none with `removed_at` — 46c1709

### Phase 2: Services and API

#### Automated

- [x] 2.1 Type check, lint and build pass — f069e0c
- [x] 2.2 Smoke passes against the local production build with fixtures imported — f069e0c

#### Manual

- [x] 2.3 `POST /api/kit` with `quantity` above the pack's count returns 400 for a single-unit pack (e.g. via browser devtools fetch while signed in) — f069e0c

### Phase 3: Kit page and add form

#### Automated

- [x] 3.1 Hardcoded-value scan is clean — 8bee9e0
- [x] 3.2 Type check, lint and build pass — 8bee9e0
- [x] 3.3 Smoke still passes — 8bee9e0

#### Manual

- [x] 3.4 At http://localhost:4321/apteczka: add a medicine with quantity and expiry, then the same pack again without them — confirmation, duplicate notice, „12 z 30 …”, „03/2027” and „nieznane” render correctly — 8bee9e0
- [x] 3.5 Pack auto-selected for a single-pack medicine; holder shown when packs come from several products — 8bee9e0
- [x] 3.6 At 390 px width no horizontal scroll; keyboard-only flow works with visible focus — 8bee9e0
- [x] 3.7 Second account at http://localhost:4321/apteczka sees an empty kit — 8bee9e0
