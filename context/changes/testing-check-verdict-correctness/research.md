---
date: 2026-10-12T22:23:10+02:00
researcher: michalg84 (with Claude Code)
git_commit: cd431a41422572f20e1bcd87bc92730b294a01f8
branch: test/check-verdict-correctness
repository: michalg84/mamlek
topic: "Test rollout Phase 1 — check verdict correctness: ground risks #1 and #2 from the database rule to the rendered verdict, the existing rule-check coverage, and the test-runner choice"
tags: [research, testing, medicine-check, verdict, vitest, rls, test-plan-phase-1]
status: complete
last_updated: 2026-10-12
last_updated_by: michalg84 (with Claude Code)
---

# Research: Test rollout Phase 1 — check verdict correctness

**Date**: 2026-10-12T22:23:10+02:00
**Researcher**: michalg84 (with Claude Code)
**Git Commit**: cd431a41422572f20e1bcd87bc92730b294a01f8
**Branch**: test/check-verdict-correctness
**Repository**: michalg84/mamlek

## Research Question

For Phase 1 of `context/foundation/test-plan.md` ("Check verdict correctness", risks #1 and #2):

1. How are "same medicine" and "same substance" defined, where is the verdict the user sees derived, and how is an empty or failed result translated on the way from the database rule to the screen?
2. What does the existing rule check (`scripts/medicine-check-check.mjs`) already cover, and what does it leave out?
3. Is "Vitest through Astro's `getViteConfig()`" the right runner setup?

Nothing was executed against a database or a test runner. Statements about how the SQL behaves come from reading it.

## Summary

- **The verdict is derived in two places.** The database function `public.medicine_check` labels each matching kit item `variant` or `substance` (`supabase/migrations/20261010120000_medicine_check.sql:152-155`). The React component turns the list of items into one of three titles in a non-exported function `verdictOf` (`src/components/registry/MedicineCheckResult.tsx:39-62`). The service and the API route pass the JSON through unchanged.
- **No unit-testable verdict module exists today.** `src/lib/services/medicine-check.ts` is a 17-line wrapper around the RPC call, not a mapping. A unit test of the mapping needs `verdictOf` (and the split at `MedicineCheckResult.tsx:140-141`) moved to a pure module first, or it has to be a component test.
- **Failures do not become "nie masz" on the inspected path.** An RPC error, an unknown product, a non-2xx response, a network failure and an unreadable body each end in the error state with a retry button, and a 401 ends in "session expired" (anchors in the layer table below).
- **One silent path to "Nie masz tego leku" exists in the component.** `verdictOf` falls through to "Nie masz tego leku" for any item list in which no item has `match` equal to exactly `"variant"` or `"substance"` (`MedicineCheckResult.tsx:140-141`, `:56-61`). The JSON is cast, not validated, at both hops (`src/lib/services/medicine-check.ts:16`, `src/components/hooks/useMedicineCheck.ts:43`), so a renamed key or value in the SQL would pass type-checking and render as "nie masz". The archived review recorded this cast as finding F9 and left it in place.
- **The consult-a-pharmacist notice is tied to the substance items, not to the verdict title.** It renders in both branches that show substance items (`MedicineCheckResult.tsx:160`, `:175`) and is part of the screen-reader announcement (`:147`). No automated check asserts it against real component output today.
- **The existing rule check has 17 cases and covers the main rule branches.** It leaves out, among others, a second active pack of the same product, same brand with another strength, strict substance subsets with identical spelling, and uppercase Polish letters in placeholders. The full gap list is below.
- **The runner hypothesis is half right.** Vitest 5 fits (Node 22 and Vite 8 are in its supported ranges). `getViteConfig()` is not needed for any Phase 1 test and would load the Cloudflare workerd plugin into the test config, which has a history of start-up failures. A plain `vitest.config.ts` with the `@/` alias and the React plugin is the lower-risk setup.
- **Two rule behaviours need a product decision before tests fix them as expected results**: a match on common name alone when the substance sets differ, and the known false "nie masz" for a different salt with a different common name. See Open Questions.

## Detailed Findings

### The oracle: what the PRD and the archived design say

PRD wording (`context/foundation/prd.md`):

- Three results: "masz ten lek / masz lek z tą samą substancją czynną (w zakresie wynikającym z wybranego poziomu dopasowania) / nie masz" (FR-011, `prd.md:167`).
- Guardrail: "Fałszywe wskazanie leku o tej samej substancji jest gorsze niż brak odpowiedzi." (`prd.md:73-80`).
- Guardrail: "Przy każdym wskazaniu leku o tej samej substancji czynnej widoczne wprost zastrzeżenie: decyzję konsultuj z farmaceutą lub lekarzem. Przy wyniku, nie w stopce." (`prd.md:73-80`), and FR-012 (`prd.md:169`).
- Precise match level: "dokładna zgodność zestawu substancji czynnych" (`prd.md:221-225`).
- The PRD does not define "ten sam lek" operationally (`prd.md:204-208`). The operational definition comes from the archived S-03 design.

Design decisions recorded in `context/archive/2026-10-09-medicine-check/`:

- Same medicine = same variant key: lowercase name, strength and pharmaceutical form, compared in the database and not by id (`plan.md:9`, `research.md:33`).
- D1, same substance at the precise level: the set of common-name parts is equal, **or** the set of substance names is equal (`research.md:43`, `plan.md:113`). Reason given: each field alone loses salts of the same substance (`research.md:55-56`).
- D2: a parallel import (same name, strength, form, other importer) is the same medicine (`research.md:44`).
- D3: withdrawn products and packs still count, labelled "wycofany z rejestru" (`research.md:45`).
- A variant match never appears in the same-substance section (`plan.md:80`).
- An error is a state of its own and not "Nie masz"; an empty `items` list is "Nie masz tego leku" (`plan.md:262-277`).

Hand-verified pairs from the 2026-09-23 registry export, usable as test oracles:

| Searched vs in the kit                                  | Expected                                 | Source                          |
| ------------------------------------------------------- | ---------------------------------------- | ------------------------------- |
| Sortis vs Atoris                                        | same substance, by common name           | `research.md:55`, `plan.md:136` |
| Asbima vs Dafiro                                        | same substance, by substances            | `research.md:56`                |
| Neo-Angin tablets vs Neo-Angin Spray                    | same substance, by substances            | `research.md:56`                |
| Metafen vs Lizymax                                      | same substance, by substances            | `research.md:56`, `plan.md:137` |
| Smecta without substances vs Smecta with "Diosmectitum" | same substance, by common name           | `research.md:58`, `plan.md:138` |
| Afronis vs Aroma-Activ (both "Preparat złożony")        | no match                                 | `research.md:58`                |
| Cernevit vs Soluvit N (both "Preparat witaminowy")      | no match                                 | `reviews/impl-review.md:49`     |
| Sinupret (only substance "Preparat złożony")            | not comparable, "nie masz" with the note | `research.md:74`, `plan.md:448` |

### The database rule

`public.medicine_check(p_product_id bigint) returns jsonb`, `stable`, `security invoker`, `search_path = ''` (`supabase/migrations/20261010120000_medicine_check.sql:110-115`).

- **Searched product**: read by id with no `removed_at` filter (`:117-128`). Its sets come from that one product, not from its variant siblings (comment `:106`).
- **Kit rows**: `kit_items` inner-joined to packages and products, with no filter on quantity, expiry or withdrawal (`:129-148`).
- **Variant flag**: `lower()` equality on name, strength and form, with NULL strength and form coalesced to an empty string (`:165-168`). No trim and no whitespace collapse on this key.
- **Common-name flag**: the searched set is non-empty and equals the kit product's set (`:169-171`). The set is the common name split on `+`, each part trimmed, lowercased and whitespace-collapsed, unique and sorted (`:61-76`).
- **Substances flag**: the searched set is non-empty and equals the kit product's set of normalized substance names (`:172-174`, `:81-97`). Amounts are not compared.
- **Placeholders**: one generic part empties the whole set (`:68`, `:88`). Generic means one of seven listed strings or a value starting with "produkt " or "preparat " (`:43-55`).
- **Label**: `variant` wins, otherwise `substance`; `matchedBy` is `common_name` before `substances` (`:152-160`).
- **Result**: `{searched, comparable, items}`; `items` is `[]` when nothing matches (`:178-224`). An unknown id returns SQL NULL (comment `:108`).
- **Access**: execute is revoked from `public` and `anon` and granted to `authenticated` (`:234-244`). Because the function is security invoker, the `kit_items` select policy `user_id = (select auth.uid())` limits the kit to the caller (`supabase/migrations/20261007120000_kit_items.sql:48`).

Set comparison is array equality on sorted unique arrays. A subset or an overlap is therefore not a match on this path, and an empty set is excluded by the `cardinality > 0` guards (`:169`, `:172`).

### From the rule to the screen

| Layer                          | What it does with the result                                                                                                 | Anchor                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Service `getMedicineCheck`     | throws on an RPC error; returns `null` when the data is null; otherwise casts the JSON                                       | `src/lib/services/medicine-check.ts:13-16`                |
| API route `GET /api/kit/check` | 503 without Supabase, 401 without a user, 400 for a bad `product`, 404 for `null`, 500 for a thrown error, 200 with the JSON | `src/pages/api/kit/check.ts:17-39`                        |
| Hook `useMedicineCheck`        | 401 → `unauthorized`; any other non-2xx, a network failure or an unreadable body → `error`; 2xx → `ready` with the body cast | `src/components/hooks/useMedicineCheck.ts:35-47`          |
| Component, error branch        | `unauthorized`, `error` or a missing result → an error message with a sign-in link or a retry button                         | `src/components/registry/MedicineCheckResult.tsx:118-137` |
| Component, verdict             | splits items by `match`, then `verdictOf` picks the title                                                                    | `MedicineCheckResult.tsx:140-142`, `:39-62`               |

`verdictOf` returns:

- "Masz ten lek · N opakowań" when at least one item has `match === "variant"` (`:40-46`).
- "Masz lek z tą samą substancją czynną" when no variant item exists and at least one item has `match === "substance"` (`:48-54`).
- "Nie masz tego leku" otherwise, with the sub-line "Ani leku z tą samą substancją czynną" only when `comparable` is true (`:56-61`).

Observed weak points on this path, relevant to risk #1:

- **Unknown `match` value.** An item whose `match` is anything other than the two literals is dropped from both lists and the verdict becomes "Nie masz tego leku" (`:140-141`, `:56`). The SQL emits only those two values today (`medicine_check.sql:152-155`), so this is reachable only after a change to the SQL or the JSON keys.
- **Malformed 200 body.** A 200 body without an `items` array makes `result.items.filter` throw during render (`:140`). No error boundary was found in `RegistrySearch.tsx:42-70`; the rest of the page tree was not inspected for one.
- **Not comparable looks like "no".** `comparable: false` with no items shows the title "Nie masz tego leku" plus a warning note (`:56-61`, `:161`). The title alone does not say that the comparison by substance was impossible.
- **Session path.** The route checks `locals.user`, which the middleware fills from `supabase.auth.getUser()` (`src/middleware.ts:10-13`), and then calls the RPC with the same cookie-based client (`src/pages/api/kit/check.ts:16`, `:30`). A caller in the `authenticated` role with no user id would get an empty kit and `items: []` (inferred from the policy at `kit_items.sql:48`). Whether the app can reach that state was not established.

Notice condition, relevant to risk #2:

- No variant items and at least one substance item: the notice renders under the verdict (`:160`).
- Variant items and substance items together: the notice renders inside the "Także z tą samą substancją czynną" section (`:170-178`).
- The announcement includes the notice whenever at least one substance item exists (`:147`).

### What the existing checks cover

`scripts/medicine-check-check.mjs` (357 lines):

- Refuses a non-local `DATABASE_URL` (`:13-30`).
- Inserts 20 synthetic products, one package each, one extra withdrawn package and synthetic users in one transaction that is rolled back (`:33-185`, `:329`, `:352`).
- Switches to the `authenticated` role and sets the JWT claims per call (`:186-196`).
- Runs in the CI `smoke` job on pull requests (`.github/workflows/ci.yml:55`).

Its 17 cases:

| #   | Case                                               | Expected                                             | Lines   |
| --- | -------------------------------------------------- | ---------------------------------------------------- | ------- |
| 1   | same product and package                           | `variant`, full `searched` object, `comparable` true | 214-229 |
| 2   | other id, other letter case (parallel import)      | `variant`                                            | 230-235 |
| 3   | withdrawn package and withdrawn sibling product    | 2 × `variant`, `withdrawn` true                      | 236-244 |
| 4   | Sortis vs Atoris                                   | `substance` by `common_name`                         | 245-250 |
| 5   | Metafen vs Lizymax                                 | `substance` by `substances`                          | 251-256 |
| 6   | Smecta without substances                          | `substance` by `common_name`                         | 257-262 |
| 7   | same placeholder common name, different substances | no items, `comparable` true                          | 263-268 |
| 8   | generic common name and generic substance on both  | no items, `comparable` false                         | 269-274 |
| 9   | "Preparat witaminowy" (generic by prefix)          | no items                                             | 275-280 |
| 10  | "A + B" vs "B + A" with other spacing and case     | `substance` by `common_name`                         | 281-286 |
| 11  | mono vs combination                                | no items                                             | 287-292 |
| 12  | NULL strength on both sides                        | `variant`                                            | 293-298 |
| 13  | unrelated medicine in the kit                      | non-null, no items                                   | 299     |
| 14  | listed placeholder, no substances                  | no items, `comparable` false                         | 300-305 |
| 15  | unknown id                                         | NULL                                                 | 306     |
| 16  | another user's kit holds the medicine              | no items                                             | 307-312 |
| 17  | three variant items and one substance item         | item order                                           | 313-324 |

Other existing coverage:

- `scripts/smoke.mjs` checks 401, 400 and 404 on the endpoint, that the added medicine is found, and that a second account gets an empty list (`:192-194`, `:220-256`).
- `scripts/ui-shots.mjs` renders the verdict titles from fixed, hand-written answers (`:159-172`, `:264-267`). It is not run in CI, and its answers do not come from the database.

So no existing automated check feeds a real rule result into the component, and none asserts the notice.

### Gaps in the rule check

"Looks correct" below is a reading of the SQL, not a test result.

Risk #1 (false "nie masz"):

- **G1.** A second active pack of the same product. The only other-package case is the withdrawn one (#3). Looks correct: the key is at product level.
- **G2.** Same brand, other strength or form (Sortis 40 mg in the kit, 20 mg searched). Falls to `substance`; untested. For a product with only placeholder names the result would be `[]`.
- **G3.** Whitespace differences in name, strength or form. The variant key applies only `lower()` (`medicine_check.sql:165-167`), so a trailing or double space gives no variant match. The same key is used by the search list, so this is consistent, but unasserted.
- **G4.** NULL strength against a non-null strength. Only NULL against NULL is tested (#12).
- **G5.** The searched product itself is withdrawn. Never passed as the searched id.
- **G6.** A withdrawn kit item matched by substance. `withdrawn` is asserted only on variant items.
- **G7.** A positive match by substances when the common name is a placeholder. Only the negatives #7 and #9 exist.
- **G8.** Different salt and different common name together. No match, by design (`medicine_check.sql:19-20`). This is a real false-"nie masz" class; see Open Questions.
- **G9.** Substance sets in a different order. Case #10 tests order only for common names.
- **G10.** Common-name separators other than `+`. "A, B" is one part and does not equal "A + B". Whether the registry holds such values is unknown.
- **G11.** Uppercase Polish letters ("PREPARAT ZŁOŻONY", a name with Ł or Ż in the variant key). Every placeholder fixture uses the listed casing. `lower()` on non-ASCII depends on the database locale, which was not checked.
- **G12.** A non-breaking space inside a name. Whether `\s` matches it was not checked.
- **G13.** `quantity = 0`. The rule has no quantity filter, so an empty pack counts as "masz"; no fixture sets a quantity.

Risk #2 (false "same substance"):

- **G14.** A strict subset with identical spelling, in both directions. Case #11 covers one direction and its names also differ in spelling.
- **G15.** A mixed common name: a real part plus a placeholder. The whole set becomes empty (`medicine_check.sql:68`); untested.
- **G16.** A placeholder on one side only. Looks correct: an empty set does not equal a non-empty one.
- **G17.** A placeholder that is neither listed nor prefixed "produkt " / "preparat ". Two unrelated products sharing it would match by common name. The archived review named "Species sedativae" as an example of this shape (`reviews/impl-review.md:54`). This is the main open path to a false "same substance".
- **G18.** The same common name with different substance sets. This matches by design (D1). See Open Questions.
- **G19.** `matchedBy` precedence when both flags are true on one item. No such fixture.

Shape and access:

- **G20.** The helper functions are not called directly by any case.
- **G21.** The `anon` grant (`medicine_check.sql:234-238`) is not asserted.
- **G22.** Item payload keys other than `id`, `match`, `matchedBy` and `withdrawn` are asserted only in case 17's first item (`expiresOn`, `expiryPrecision`). The component depends on `name`, `strength`, `form`, `substances`, `units`, `quantity` (`MedicineCheckResult.tsx:72-87`).

### The test runner

Verified on the npm registry and in `node_modules` on 2026-10-12:

- Vitest latest is 5.0.4; it needs Node `^22.12.0 || ^24.0.0 || >=26.0.0` and Vite `^6.4.0 || ^7.0.0 || ^8.0.0`.
- Local Node is 22.14.0; CI uses `node-version: 22` (`.github/workflows/ci.yml:16`). The installed Vite is 8.3.0.
- jsdom latest is 30.1.2 and needs Node `^22.22.2 || ^24.15.0 || >=26.0.0`, which the local Node 22.14.0 does not satisfy.
- Installed: `@astrojs/cloudflare` 14.3.1, `@cloudflare/vite-plugin` 1.54.8, `@vitejs/plugin-react` 5.2.0 (transitive, through `@astrojs/react`).

Why `getViteConfig()` is not needed for Phase 1:

- The only `astro:*` imports in `src` reported by the search are `astro:middleware` (`src/middleware.ts:1`) and `astro:env/server` (`src/lib/supabase.ts:3`, `src/lib/config-status.ts:1`).
- The component, the hook, `src/lib/kit-format.ts`, `src/lib/utils.ts` and the service import no virtual modules.
- A route-handler test of `src/pages/api/kit/check.ts` would need `astro:env/server` through `@/lib/supabase`; mocking that module covers it.

Why `getViteConfig()` is the risky part (reported by the runner research; issue contents were not re-read here):

- `getViteConfig()` runs every integration's setup hook, and the installed adapter adds the Cloudflare Vite plugin there with no Vitest guard. A search of `node_modules/@astrojs/cloudflare/dist` for `VITEST` returned nothing; Astro core has one guard at `node_modules/astro/dist/vite-plugin-astro-server/plugin.js:28`.
- withastro/astro#15878 reported start-up failures for Vitest with the Cloudflare adapter through `getViteConfig()`. The patch that skipped the plugin under Vitest was not merged.
- cloudflare/workers-sdk#15969 is reported open: `vitest run` fails with a config containing `cloudflare()` on plugin 1.58.0 and later. The installed 1.54.8 is below that, but the adapter's range `^1.53.0` allows it after a lockfile refresh.
- Whether the installed versions start cleanly under Vitest 5 with `getViteConfig()` was not tried.

What a plain config has to handle:

- The `@/*` alias from `tsconfig.json:8-10`.
- `tsconfig.json:3` includes `**/*`, so test files and the Vitest config are type-checked by `npx astro check` and linted with the strict typed ESLint rules.
- A DOM environment for the component test. jsdom 29 or happy-dom fits the local Node; jsdom 30 does not.
- `todayIso()` at `MedicineCheckResult.tsx:144` makes the "przeterminowany" label depend on the current date.
- The component fetches through `useMedicineCheck` in an effect, so a component test must stub `fetch` or mock the hook.

Database tests:

- The CI `smoke` job is the only job with a local Supabase (`.github/workflows/ci.yml:43-55`). `DATABASE_URL` is exported inside one step and does not carry over to the next.
- The `ci` job has no database (`:10-26`); a unit and component run fits there without secrets.
- `deploy` depends only on `ci` (`:71`), so anything in `smoke` does not gate a deploy, as today.

## Code References

- `supabase/migrations/20261010120000_medicine_check.sql:110-225` — the rule
- `supabase/migrations/20261010120000_medicine_check.sql:21-97` — normalization, placeholder and set helpers
- `supabase/migrations/20261010120000_medicine_check.sql:234-244` — grants
- `supabase/migrations/20261007120000_kit_items.sql:18` — `package_id` foreign key, no cascade
- `supabase/migrations/20261007120000_kit_items.sql:48` — owner-only select policy
- `src/lib/services/medicine-check.ts:8-17` — RPC wrapper with the unchecked cast
- `src/pages/api/kit/check.ts:15-40` — status mapping
- `src/components/hooks/useMedicineCheck.ts:18-66` — request state, abort on product change
- `src/components/registry/MedicineCheckResult.tsx:39-62` — `verdictOf`
- `src/components/registry/MedicineCheckResult.tsx:138-180` — item split, notice conditions, announcement
- `src/components/registry/RegistrySearch.tsx:63-68` — where the result component is mounted
- `scripts/medicine-check-check.mjs:214-324` — the 17 existing cases
- `scripts/smoke.mjs:192-256` — endpoint status and isolation checks
- `scripts/ui-shots.mjs:159-172` — hand-written check answers
- `.github/workflows/ci.yml:10-26`, `:30-68` — `ci` and `smoke` jobs

## Architecture Insights

- The rule returns the response shape directly as JSON built in SQL. The key names (`matchedBy`, `expiresOn`) and the two `match` literals are a contract between the migration and `src/types.ts:84-115` that nothing checks at build time or at run time.
- The verdict is a function of the item list alone plus `comparable`. That makes it cheap to unit-test once it is a pure function.
- A test that feeds real `medicine_check` output into the verdict function would cover the contract above and the "layer between rule and screen" challenge from the test plan in one place.
- The existing check script already has the pattern the test plan asks for: synthetic rows, one transaction, rollback, role switch with JWT claims.

## Historical Context (from prior changes)

- `context/archive/2026-10-09-medicine-check/reviews/impl-review.md:141-149` — F9: the RPC JSON is cast in the service, "a renamed key in SQL passes type-checking". Still true on this commit (`src/lib/services/medicine-check.ts:16`).
- `context/archive/2026-10-09-medicine-check/reviews/impl-review.md:43-60` — F1: unlisted generic common names gave a false "same substance"; fixed with the prefix rule, with the blind spot for other placeholder shapes recorded.
- `context/archive/2026-10-09-medicine-check/reviews/impl-review.md:82-99` — F4: "Masz ten lek" stays green when every matching pack is expired; deferred to S-08.
- `context/archive/2026-10-09-medicine-check/reviews/impl-review.md:176` — the edited migration was never applied from scratch locally.
- `context/archive/2026-10-09-medicine-check/research.md:59`, `:157` — the false-indication rate of D1 across the whole registry is unmeasured.
- `context/archive/2026-10-09-medicine-check/plan-brief.md:92` — a registry change of name, strength or form moves a kit medicine from "masz ten lek" to "ta sama substancja".
- `context/archive/2026-10-07-add-medicine-to-kit/reviews/impl-review.md:37-54` — F2: kit invariants are enforced only in the API, so the check must tolerate an arbitrary quantity, expiry or a withdrawn package written directly.
- `context/foundation/roadmap.md:162-174` — S-06 adds match levels on top of this rule. Nothing records how "common name or substances" maps onto "zawiera wszystkie" and "zawiera jeden".
- `context/foundation/test-plan.md:93`, `:106` — records "Astro documents Vitest through `getViteConfig()`". The statement is supported; it does not cover the Cloudflare adapter case.

## Related Research

- `context/archive/2026-10-09-medicine-check/research.md` — the S-03 research with the registry measurements and the hand-verified pairs.

## Open Questions

1. **Common name alone as a same-substance match (G18).** D1 accepts a match on the common-name set even when the substance sets differ. The test plan lists "The same common name means the same substance" as the assumption to challenge. Should Phase 1 tests fix D1 as the expected behaviour, or is this a rule change for a separate change?
2. **Different salt with a different common name (G8).** The rule returns no match by design. Is that an accepted false "nie masz" to document in a test, or a rule gap to close?
3. **Unlisted placeholders (G17).** The full registry is needed to list common names shared by products with different substance sets. Is a one-off measurement on the full local registry in scope for Phase 1?
4. **Where the mapping lives.** Extract `verdictOf` into a pure module for a unit test, or test it only through the component? Extraction changes production code in a testing change.
5. **Response validation.** Should an unknown `match` value or a malformed body be turned into the error state (a production change), or only be pinned by a contract test between the SQL output and the TypeScript type?
6. **Database tests: port or extend.** Add the missing cases to `scripts/medicine-check-check.mjs`, or move the rule cases into the new runner as a database project?
7. **Locale behaviour (G11, G12).** `lower()` and `\s` on non-ASCII text need one query against the local and the production database to settle.
8. **DOM environment.** jsdom 29 or happy-dom on the local Node 22.14.0, or raise the local Node for jsdom 30.
