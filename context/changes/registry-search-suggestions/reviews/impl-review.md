<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-01: Wyszukiwanie leku w rejestrze z podpowiedziami — plan implementacji

- **Plan**: context/changes/registry-search-suggestions/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-02
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Evidence: range 87f1893..HEAD (a700a52, dd77dcd, 82b09e6, c435109, fea0541), 20 files. Drift check: every planned item MATCH, no DRIFT, nothing MISSING. Deviations are the documented Phase 2 review decisions (F1 epoch version, F2/F3/F5/F7) and small benign additions (`isQueryLongEnough`, `RegistrySearchResult`, the hook's `isPayload` guard and `cache: "reload"` on retry, a haystack pre-filter, an sr-only count). Level D pools the words of all substances for following query words; the plan's "jakieś słowo w polu tego poziomu" allows it (B and C also use their whole field). All "What We're NOT Doing" guardrails respected.

Re-run on HEAD by the reviewer: `npx astro sync` + `npx astro check` (0 errors), `npm run lint` (clean), `npm run build` (pass), `npm run smoke` (15/15, against the full import). Phase 1 automated criteria (`db reset`, fixture import, `registry-import-check`) were not re-run: a reset would wipe the user's full local import, and DB commands run by the agent are blocked by the auto-mode classifier. The last evidence is the user's `run-all.sh` ALL PASS on 82b09e6, after the F1 migration; Phase 3 did not touch SQL or the import.

Manual: 1.5, 1.6, 2.5 backed by recorded measurements/DevTools output; 3.5–3.10 confirmed by the user in one message ("all done") with 3.8 numbers; 2.6 pending by decision (measure on the deployed Worker).

## Findings

### F1 — Dragging the list's scrollbar with the mouse closes the list

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/registry/MedicineSuggest.tsx:164-167, 171-176, 186-188
- **Detail**: `preventDefault` on mousedown is set only on each `<li>`. The `<ul>` scrolls (`max-h-[min(24rem,50vh)] overflow-y-auto`) and 20 rows of ~60 px exceed 24rem, so most queries show a scrollbar. A mousedown on the scrollbar hits the `<ul>`, the input can lose focus, `onBlur` sets `open=false`, and the list disappears mid-drag (Chrome 130+ also makes scroll containers without focusable children keyboard-focusable). Wheel and touch scrolling are not affected. Verified in code, not in a browser.
- **Fix**: Move `onMouseDown={(e) => e.preventDefault()}` from each `<li>` to the `<ul>` (react-select/downshift pattern; tap-to-select keeps working).
- **Decision**: FIXED via Fix now — `onMouseDown` preventDefault moved from each `<li>` to the `<ul>`

### F2 — Diacritics regex written with invisible combining characters

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/registry-search.ts:40
- **Detail**: `/[̀-ͯ]/g` holds the raw code points U+0300 and U+036F (bytes `CC 80`, `CD AF`, verified). The range is correct today, but it renders as an empty-looking class in diffs and review tools, and an editor, formatter or copy-paste that drops or normalizes combining marks would break it silently — `żel` would stop matching `zel`, a rule the plan agreed on. No unit test runner exists and smoke does not exercise the matcher, so nothing would catch it.
- **Fix**: Write it as `/[̀-ͯ]/g` (same behavior).
- **Decision**: FIXED via Fix now — regex now `/[̀-ͯ]/g` (escapes; sanity check: "Żel" → "zel", "Łódź" → "lodz")

### F3 — 3.8 is ticked without the per-keystroke delay

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/registry-search-suggestions/plan.md:347-348 (Progress 3.8)
- **Detail**: The criterion asks for "czas od wejścia na `/szukaj` do gotowości listy oraz opóźnienie podpowiedzi po znaku zanotowane". The note records the list request (12,11 s on the local, likely uncompressed preview) and other request times, and says the per-keystroke delay was not recorded. A synthetic benchmark (16 165 variants, Node/V8) gives ~4–5 ms per search (~25 ms at 6x) and 88–120 ms for `buildSearchIndex`, but that is not the measurement the plan asks for.
- **Fix**: Measure the longest task while typing `ibu 400` (Performance panel, CPU 6x) and add it to the 3.8 note — or note it together with 2.6 on the deployed Worker.
- **Decision**: FIXED via Fix now — user measured the longest interaction while typing `ibu 400` at CPU 6x: 336 ms; added to the 3.8 note. Above the 200 ms "good" INP threshold at 6x, against the ~25 ms synthetic search estimate — most of it is likely React render/layout, not the matcher (not profiled)

### F4 — Screen-reader announcements are noisy

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/registry/MedicineSuggest.tsx:101-141, 156, 204-217; src/components/registry/RegistrySearch.tsx:46
- **Detail**: The single `role="status"` region changes text on almost every keystroke ("Pokazano 20 z 345…" → "…z 120…", sr-only "N podpowiedzi"); the end of loading announces "Wpisz co najmniej 3 litery" even if the field is not focused; the region contains the "Spróbuj ponownie" button and the "Zaloguj się" link, so via `aria-describedby` they become part of the input's description; the `aria-live` wrapper in RegistrySearch reads the whole card on every selection. Verified in code, not with a screen reader; the user reported 3.7 as working.
- **Fix**: Keep the button and link outside the live region; announce only the selected name instead of a live wrapper around the card; debounce the count/truncation text ~700 ms after the last keystroke.
  - Strength: Follows the WAI-ARIA APG combobox guidance; less chatter on every key.
  - Tradeoff: A debounce adds a timer and state to the component; the truncation message would lag visually unless only the announced copy is debounced.
  - Confidence: MEDIUM — standard guidance, but not verified with NVDA/VoiceOver on this page.
  - Blind spot: 3.7 was reported as working; actual severity for users is unknown.
- **Decision**: FIXED via Fix now — visible status text is no longer live (button/link outside any live region, `aria-describedby` only on the visible message); a separate sr-only live region announces the status 700 ms after the last change (problems at once, hints only while the field has focus); RegistrySearch announces only "Wybrano: {name}" instead of a live card wrapper. Not yet re-tested with a screen reader

### F5 — Index build is one long main-thread task

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/registry-search.ts:70-88; src/components/hooks/useRegistrySearchList.ts:53-58
- **Detail**: Synthetic benchmark: `buildSearchIndex` 88–120 ms on this machine (collator sort only 18–24 ms; most cost is `normalize("NFD")`, regex `match` and spreads), roughly 0.5–0.7 s at CPU 6x plus `JSON.parse` of ~2 MB, in one task. Typing stays cheap (~25 ms at 6x). Synthetic data, not the real list.
- **Fix**: None now; if the 2.6 measurement on the deployed Worker shows jank, build the index in chunks with yielding or in a Web Worker.
- **Decision**: DEFERRED — revisit with the 2.6 measurement on the deployed Worker, together with the 336 ms per-keystroke interaction at CPU 6x (F3); profile typing and load before choosing chunking/worker or trimming the per-key render

### F6 — Middleware `startsWith` protects more than the route

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:4, 18
- **Detail**: `pathname.startsWith("/szukaj")` also covers `/szukajka`, `/szukaj-…`, `/szukaj.json` (same pre-existing behavior for `/dashboard`). It fails closed; a future public route sharing the prefix would redirect to sign-in. Even with a bypass nothing leaks: the page's query returns no row for anon (RLS) and the endpoint checks `locals.user` itself.
- **Fix**: Match `pathname === route || pathname.startsWith(route + "/")`.
- **Decision**: FIXED via Fix now — middleware matches the route exactly or as a `route/` prefix

### F7 — `<html lang="en">` while all copy is Polish

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/layouts/Layout.astro:13
- **Detail**: Screen readers read the Polish text with English pronunciation (WCAG 3.1.1). Predates this change; the new page makes it visible. Outside the plan's file list.
- **Fix**: Set `lang="pl"` in the layout (or make it a layout prop).
- **Decision**: FIXED via Fix now — `src/layouts/Layout.astro:14` now `<html lang="pl">`

### F8 — Payload carries the spaces of `jsonb::text`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261002130000_registry_search_list_version.sql:84 (same in 20261002120000_registry_search_list.sql:116)
- **Detail**: PostgreSQL's jsonb output puts a space after every `:` and `,` (`[1, "X", null, …]`), ~7 per tuple × 16k tuples ≈ 100–150 KB of the 2 MB raw size. Matters only where the response is not compressed (e.g. the local preview behind the 12 s measurement); compression mostly removes it.
- **Fix**: None now; revisit together with F4 of the Phase 2 review after the 2.6 measurement confirms Cloudflare compression.
- **Decision**: DEFERRED — revisit with the 2.6 measurement on the deployed Worker, together with Phase 2 F4
