<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-01: Wyszukiwanie leku w rejestrze z podpowiedziami — plan implementacji

- **Plan**: context/changes/registry-search-suggestions/plan.md
- **Scope**: Phase 2 of 3
- **Reviewed phases**: 2
- **Date**: 2026-10-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Evidence: all 4 planned items MATCH (commit dd77dcd). Small non-contract additions: try/catch → generic 500, a `json()` helper, smoke helpers. `astro check` (0 errors) and `npm run lint` re-run on the committed code: clean. Smoke (12 steps) and build passed at gate time; break-check went red. Manual 2.5 is backed by the DevTools paste (`200 OK (from disk cache)`, `Cache-Control: private, max-age=31536000, immutable`); 2.6 is pending by decision (measure after deploy).

## Findings

### F1 — Cache version can repeat, so a one-year `immutable` entry can go stale

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/registry/search-list.ts:51 and supabase/migrations/20261002120000_registry_search_list.sql:71
- **Detail**: `version = coalesce(max(version), 0) + 1` restarts at 1 when the row is gone (`supabase db reset`, restored backup, re-created project). A browser that cached `?v=N` as `immutable` for a year never revalidates and keeps the old list. Concrete in local dev: this session reset the DB and the fixtures list is cached as `?v=3`; a later reset plus fixtures import yields `v=3` again with different content. In production it only matters after a disaster recovery.
- **Fix A ⭐ Recommended**: New migration making the version non-resettable, e.g. `greatest(max(version) + 1, extract(epoch from now())::bigint)`
  - Strength: Versions stay unique across resets and restores; no endpoint change.
  - Tradeoff: Changes the Phase 1 function (new migration + a second manual `db push`); version numbers become large.
  - Confidence: HIGH — epoch seconds fit bigint and JS numbers; nothing in the plan depends on small versions.
  - Blind spot: Phase 3 must not assume a small `version`.
- **Fix B**: Keep versions, shorten `max-age` (e.g. 30 days) and document that local resets need a cache clear
  - Strength: One-line change, no migration.
  - Tradeoff: Does not remove the stale-list case, only bounds it; more revalidation traffic.
  - Confidence: MEDIUM — depends on how often prod is restored.
  - Blind spot: Not verified how the browser handles `max-age` expiry combined with `immutable`.
- **Decision**: FIXED via Fix A — migration `20261002130000_registry_search_list_version.sql` (version = `greatest(max+1, epoch)`), check relaxed to `after.version > before.version`; verified locally (reset + fixtures + registry-import-check all PASS); prod `db push` pending (manual)

### F2 — Smoke covers only one branch of the cache logic and can crash on a bad first response

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:55-58, 86-90
- **Detail**: `requestVersionedSearchList()` calls `JSON.parse(body).version` without checking the first response; a 404/500 crashes the script with a stack trace instead of a `FAIL` line and skips the sign-out steps. The step only checks that `Cache-Control` contains `immutable`: no step asserts the other branch (a valid `v` that is not the current version → `private, no-cache`), and the regex does not require `private`.
- **Fix**: Make the helper fail clearly when the first response is not 200; add a step `?v=<version+1>` expecting `no-cache`; tighten the immutable check to `/^private,.*immutable/`.
- **Decision**: FIXED via Fix now — `requestVersionedSearchList(offset)` returns a non-200 first response as is, new step "not immutable for another version" (`v` = version + 1 → `private, no-cache`), immutable check tightened to `/^private,.*\bimmutable\b/`; smoke re-run PASS (13 steps)

### F3 — 404 hides "session not accepted by the data API" as "list not built"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/registry/search-list.ts:42-44
- **Detail**: RLS returns zero rows, not an error, so a request whose own Supabase client was not accepted (e.g. a token rotated by the middleware's `getUser()`) gets 404, the same as an unbuilt list. Phase 3 maps 404 to "Rejestr leków nie jest jeszcze wczytany".
- **Fix**: Log a distinct `console.warn` when `list === null`, and keep the Phase 3 message wording non-committal.
- **Decision**: FIXED via Fix now — `console.warn` when `list === null` in the endpoint; Phase 3 message wording to stay non-committal

### F4 — Every no-cache request reads and re-encodes the full ~2 MB row

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/registry/search-list.ts:34-53, src/lib/services/registry-search-list.ts:19-30
- **Detail**: Requests without a matching `v` have no validator, so each is a full DB read plus JSON-envelope parse plus re-encode of the payload. The plan's Workers Paid plan (infrastructure.md:15) makes CPU limits a non-issue, and the browser fetches `?v=<version>` after the first load. Real size and cost are unmeasured until 2.6.
- **Fix**: Defer. After the 2.6 measurement, if needed: read `getSearchListVersion` first and send `ETag` with 304 on `If-None-Match`.
- **Decision**: SKIPPED — revisit after the 2.6 measurement on the deployed Worker

### F5 — Cache-key and error-response hardening nits

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/registry/search-list.ts:8-13, 23-32, 51
- **Detail**: `v=007` and `v=7` are different browser cache keys with identical content; error responses carry no `Cache-Control` (a 404 is heuristically cacheable).
- **Fix**: Compare `rawVersion === String(list.version)` for `immutable`; add `Cache-Control: no-store` in the `json()` helper.
- **Decision**: FIXED via Fix now — `immutable` only when `rawVersion === String(list.version)`; `Cache-Control: no-store` on error responses

### F6 — `immutable` is keyed by URL only; the cache is not proof of authentication

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/registry/search-list.ts:51
- **Detail**: After sign-out, another user in the same browser profile can read `?v=<current>` from the disk cache without an auth check. The data is the public registry list and the cache is per profile, so exposure is small; the only fix would remove the feature.
- **Fix**: Accept; note in Phase 3 that the UI must not treat a cached list as proof of a session.
- **Decision**: ACCEPTED — public registry data, per-profile cache; Phase 3 must not treat a cached list as proof of a session

### F7 — Smoke now needs an imported database; AGENTS.md does not say so

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: AGENTS.md ("Command tripwires", `npm run smoke`)
- **Detail**: The 200 and immutable steps need at least one variant, so a smoke run on a DB without an import (or a cloud project) fails with 404. CI imports fixtures first, so CI is fine.
- **Fix**: Add one sentence to the `npm run smoke` tripwire: requires the registry fixtures imported (the list must be non-empty).
- **Decision**: FIXED via Fix now — sentence added to the `npm run smoke` tripwire in AGENTS.md
