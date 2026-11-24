<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Przejścia substancja ↔ lek i dodanie leku z wyszukiwania

- **Plan**: context/changes/substance-medicine-links/plan.md
- **Scope**: Full plan (Phases 1–5 of 5)
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-11-23
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 6 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Automated criteria run on HEAD 4092375: `npm run lint` 0, `npx astro check` 0, `npx vitest run --project unit --project component --project registry` 0, `npm run ui:scan` 0 (30 files, 0 hits), `npx prettier --check AGENTS.md context/foundation/prd.md` 0, `npm run test:db` 0. `test:api` and `search:check` were not re-run (need a running server / full registry); their earlier results are annotated in Progress (4.3, 1.4). All manual Progress rows are ticked; 4.6 was confirmed by the user, 2.7 has a measurement annotation.

## Findings

### F1 — Worker failures in `substance` and `lookup` look like correct answers and are not logged

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/registry-search.worker.ts:69, :78
- **Detail**: Both `catch` blocks reply with an empty result and log nothing (the `match` branch at :55 logs with `console.error`). An exception in the substance filter shows "Brak leków z substancją „X” w rejestrze" (a false statement); an exception in lookup gives `missing`, so `/szukaj?lek=` silently falls back to plain search and the add form stays empty. The plan prescribes the empty answer, but the project rule says a `catch` must log or report the error with its cause.
- **Fix A ⭐ Recommended**: `catch (error)` + `console.error(..., error)` in both branches, like `match`.
  - Strength: matches the sibling branch, tiny edit, keeps the planned protocol.
  - Tradeoff: the user still sees "Brak leków…" on failure.
  - Confidence: HIGH — identical pattern at :55.
  - Blind spot: None significant.
- **Fix B**: add a `failed` flag to the replies so the UI shows the existing error state.
  - Strength: no false "no medicines" message.
  - Tradeoff: protocol and hook changes beyond the plan, more tests.
  - Confidence: MED — needs changes in 3 consumers.
  - Blind spot: error-state behaviour of the lookup in KitAddForm not designed.
- **Decision**: FIXED via Fix A (console.error with the cause in both catch blocks, 2026-11-24)

### F2 — First `lookup` also builds substance keys for the whole list

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/registry-search.ts:336-349, :389
- **Detail**: `lookupsOf` builds `byId` and `substanceKeys` in one pass, so the preselection paths (`?lek=`) pay for normalising every substance (~16k variants) in the Worker. Off the UI thread, but the plan says only the first filter pays this.
- **Fix**: build `byId` and `substanceKeys` as two separate lazy fields.
- **Decision**: FIXED via Fix (byId and substanceKeys are now two separate lazy fields; findVariant builds only the id map, 2026-11-24)

### F3 — "Back" to a substance list re-requests it

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useSubstanceVariants.ts:60-62, src/components/registry/RegistrySearch.tsx:150-151
- **Detail**: Picking a medicine sets the hook's substance to `null` and clears its answer, so after `popstate` the list shows "Wczytywanie…" until the Worker answers; scroll restoration may land early. Code path verified, browser behaviour not.
- **Fix**: keep the last answer for the navigated substance while a card is shown, or accept it (manual check 2.5 covered back navigation).
- **Decision**: FIXED via Fix (useSubstanceVariants keeps the last answer when the substance goes to null, shown only when key, substance and limit match; test asserts the list is back before the Worker answers, 2026-11-24)

### F4 — `?substancja=` text appears on the page

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/registry/SubstanceVariants.tsx:65, :112
- **Detail**: Up to 200 characters from the URL are shown in a heading and messages. React escapes it, hrefs use `encodeURIComponent`: not XSS, only cosmetic content spoofing behind login.
- **Fix**: none required; optionally lower `MAX_SUBSTANCE_LENGTH`.
- **Decision**: SKIPPED (the limit only rejects a too long parameter; lowering it would not change the spoofing exposure and could break a rare real name, 2026-11-24)

### F5 — Preselected medicine lives only in derived lookup state

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/kit/KitAddForm.tsx:303-304
- **Detail**: `selected = variant ?? lookup.variant`; if the list left "ready" the pack form would unmount and drop entered values. Not reachable today.
- **Fix**: copy the found variant into `variant` once.
- **Decision**: SKIPPED (not reachable today, 2026-11-24)

### F6 — "One Worker" assertion covers only about half of the new RegistrySearch tests

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/registry/RegistrySearch.test.tsx (`afterEach` at :612-617)
- **Detail**: The plan says every path creates exactly one Worker; `created === 1` is asserted in 9 of ~19 new tests. Plan also says focus moves to the card after picking a medicine, the code does so only for picks from the substance list (field picks keep focus in the combobox): reasonable, undocumented.
- **Fix**: assert `FakeSearchWorker.created` in a shared `afterEach`; note the focus rule in the plan.
- **Decision**: FIXED via Fix (shared afterEach in the address/substance describe asserts exactly one Worker per test; the focus rule is noted in plan.md, 2026-11-24)

### F7 — Roadmap S-18 rides along on the branch

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/roadmap.md (commit 69ad828)
- **Detail**: Besides S-17 → in-progress, the commit adds the unrelated S-18 password-policy item. Docs only, harmless. Also: PRD notes are dated 2026-11-23, the plan said 2026-11-19 (the 23rd is the real date).
- **Fix**: none; mention it in the PR description.
- **Decision**: SKIPPED (docs only; S-18 to be mentioned in the PR description, 2026-11-24)
