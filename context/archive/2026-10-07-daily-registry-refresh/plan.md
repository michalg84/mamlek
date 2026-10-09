# Daily Registry Refresh Implementation Plan

## Overview

Roadmap slice S-07: the production registry refreshes itself every day, the user sees the registry state date on `/szukaj`, and a failed refresh reaches the author instead of passing silently. Today the production import runs only when started by hand, and the app never shows how old the registry is.

## Current State Analysis

- `.github/workflows/registry-import.yml` has only `workflow_dispatch`. It already has a `registry-import` concurrency group (no cancel), a main-only guard (`if: github.ref == 'refs/heads/main'`), a 30-minute timeout and the `REGISTRY_DATABASE_URL` secret check.
- `scripts/registry-import.mjs` runs the whole import in one transaction with an advisory lock. It rejects an export older than the last imported snapshot, accepts an equal or newer one, writes a `registry_imports` row and rebuilds `registry_search_list` (new `version` on every rebuild).
- RPL stamps its export with the current date: the header of the live export read on 2026-10-07 had `stanNaDzien="2026-10-07"`. So every daily run imports a "new" snapshot and bumps the list version.
- `/szukaj` (`src/pages/szukaj.astro`) already loads `{ version, snapshotDate }` through `getSearchListVersion()` (`src/lib/services/registry-search-list.ts:7`), but displays only the search. `snapshotDate` is a `YYYY-MM-DD` string from the `date` column.
- The repository is private, so GitHub's 60-day auto-disable of scheduled workflows in public repositories does not apply (risk register in `context/foundation/infrastructure.md:73,93`).

## Desired End State

- Production imports are scheduled daily at 04:17 UTC from `main` (GitHub starts them late: observed ~11:20 UTC on 2026-10-08 and 2026-10-09), and can still be started by hand.
- `/szukaj`, with a loaded list, shows a discreet muted line `Stan rejestru na 7.10.2026` (RPL `stanNaDzien`, format `d.MM.yyyy`).
- A failed scheduled run sends the author GitHub's standard failed-workflow email.
- README and AGENTS.md describe the daily schedule.

### Key Discoveries:

- `src/lib/services/registry-search-list.ts:15` — `snapshotDate` is already returned to the page; no new query or migration is needed.
- `src/pages/szukaj.astro:44-52` — three states: failed / list loaded / not imported; the date belongs only to the "list loaded" branch.
- `scripts/smoke.mjs:89` — "search page renders for signed-in user" only checks the status; steps support a `check` on the body (`scripts/smoke.mjs:93`).
- `scripts/ui-scan.mjs:19-24` — `src/pages/szukaj.astro` is a guarded view: role classes only.
- `scripts/registry-import.mjs:215` — the only freshness guard is "not older than the last snapshot"; equal dates re-import.

## What We're NOT Doing

- No 7-day staleness warning or blocking for the user (decided: the date is informational only).
- No heartbeat service (healthchecks.io) and no GitHub issue on failure. Accepted risk: a disabled or skipped schedule sends nothing; it shows only as the date on `/szukaj` getting older.
- No skip of unchanged snapshots and no stable list version for identical content. Accepted cost: one cold list download and index build per phone per day (RPL changes `stanNaDzien` daily, so a skip would never trigger).
- No "last checked" or import-time date in the UI (decided: RPL state date only).
- No date on other screens yet; S-02/S-03 screens decide that when they exist.
- No changes to the import script, migrations or `context/foundation/infrastructure.md`.

## Implementation Approach

UI first, because it can be verified fully on a local stack; then the schedule, which only fires from `main` and is verified after merge. The date comes from data the page already loads, formatted by a pure string split (no `Date` object, so no timezone shift on the Cloudflare runtime or in the browser).

## Phase 1: Registry state date on /szukaj

### Overview

Show `Stan rejestru na <d.MM.yyyy>` under the search when the list is loaded, and make the smoke test assert it.

### Changes Required:

#### 1. Date formatting helper

**File**: `src/lib/registry-date.ts` (new)

**Intent**: Turn the `YYYY-MM-DD` snapshot date into the Polish display form without timezone handling, so the shown day is always the RPL day.

**Contract**: `formatRegistryDate(isoDate: string): string` — `"2026-10-07"` → `"7.10.2026"`, `"2026-09-29"` → `"29.09.2026"` (day without leading zero, month with two digits, four-digit year). Input that does not match `YYYY-MM-DD` is returned unchanged rather than throwing, so a malformed value never breaks the page.

#### 2. Search page

**File**: `src/pages/szukaj.astro`

**Intent**: In the "list loaded" branch, render one muted line with the formatted date below `<RegistrySearch>`, inside the same card.

**Contract**: Text `Stan rejestru na {formatRegistryDate(list.snapshotDate)}`; role classes only (`text-muted-foreground`, `text-xs`, a top margin); not rendered in the failed or not-imported branches. Server-rendered (no change to `RegistrySearch` props).

#### 3. Smoke assertion

**File**: `scripts/smoke.mjs`

**Intent**: Make the existing "search page renders for signed-in user" step also prove the date line is rendered.

**Contract**: Add `check: (actual) => /Stan rejestru na \d{1,2}\.\d{2}\.\d{4}/.test(actual.body)` to that step; the step name stays the same. Confirm `request()` exposes the response body for HTML responses (the search-list steps already read `actual.body`).

### Success Criteria:

#### Automated Verification:

- `/ci-check` passes (astro sync, lint, astro check, build)
- `npm run ui:scan` reports no hits
- `npm run smoke` passes against the local build with the fixtures imported, including the date assertion

#### Manual Verification:

- On `http://localhost:4321/szukaj`, signed in, the line `Stan rejestru na <stanNaDzien of the last imported fixture>` appears under the search, muted, at 1280 and 390 width (`npm run ui:shots -- --label s07`)
- The line does not appear in the "Rejestr leków nie jest jeszcze wczytany" state (empty local database before import)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Daily schedule and docs

### Overview

Run the production import daily from `main` and update the docs that say it is manual-only.

### Changes Required:

#### 1. Workflow schedule

**File**: `.github/workflows/registry-import.yml`

**Intent**: Add a daily trigger next to the manual one; keep the guard, concurrency, timeout and secret check as they are.

**Contract**: `on:` gains `schedule: - cron: "17 4 * * *"` (04:17 UTC, off the full hour, where GitHub delays and drops more runs). `workflow_dispatch` stays. A comment notes that scheduled runs always use the default branch (so the main-only guard passes) and that failure emails go to the user who last changed the cron line.

#### 2. Docs

**File**: `README.md`, `AGENTS.md`

**Intent**: Replace "runs only when started by hand" / "Production imports run only via the manual workflow" with the daily schedule plus manual dispatch, and say where failures are reported (GitHub's failed-workflow email) and that the date on `/szukaj` is the visible freshness signal.

**Contract**: README section describing `.github/workflows/registry-import.yml` (`README.md:83`); the `npm run registry:import` tripwire in AGENTS.md. No new sections.

### Success Criteria:

#### Automated Verification:

- `/ci-check` passes
- `gh workflow view registry-import.yml` on the branch lists the schedule trigger (YAML parses)

#### Manual Verification:

- After merge to `main`, a manual run (`gh workflow run registry-import.yml --ref main`) succeeds, and `/szukaj` in production shows today's state date
- Within a day of the merge (GitHub starts scheduled runs hours after 04:17 UTC; observed ~11:20 UTC), `gh run list --workflow registry-import.yml` shows a run with event `schedule` that succeeded
- GitHub notification settings (Settings → Notifications → Actions) send email for failed workflows, and you are the user who last changed the cron line

**Implementation Note**: The schedule only fires from `main`, so the manual checks of this phase happen after the PR is merged.

---

## Testing Strategy

### Unit Tests:

- None (no unit test runner in the project). `formatRegistryDate` is covered through the smoke regex and the examples in its contract.

### Integration Tests:

- `npm run smoke` against the local build: the signed-in `/szukaj` contains the date line.

### Manual Testing Steps:

1. Locally: `npx supabase db reset`, import the fixtures, build, serve, sign in, open `http://localhost:4321/szukaj` and check the line and its date.
2. Locally, before importing: open `/szukaj` and confirm only "Rejestr leków nie jest jeszcze wczytany" is shown.
3. Production, after merge: run the workflow by hand, then check `/szukaj` shows today's date; the next day confirm a `schedule` run.

## Performance Considerations

The date line is server-rendered from data `/szukaj` already loads: no extra query. The daily import gives every phone a new list version each day (one cold download + index build on the first search of the day); accepted for the MVP, revisit with `npm run perf` if it hurts in real use.

## Migration Notes

None. The first scheduled run after merge behaves like today's manual import.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-07)
- Freshness risk: `context/foundation/infrastructure.md:69,73,93`
- Snapshot date read: `src/lib/services/registry-search-list.ts:7`
- Import guard on snapshot date: `scripts/registry-import.mjs:215`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Registry state date on /szukaj

#### Automated

- [x] 1.1 `/ci-check` passes (astro sync, lint, astro check, build)
- [x] 1.2 `npm run ui:scan` reports no hits
- [x] 1.3 `npm run smoke` passes against the local build with the fixtures imported, including the date assertion

#### Manual

- [x] 1.4 On `http://localhost:4321/szukaj`, signed in, the date line appears under the search, muted, at 1280 and 390 width
- [x] 1.5 The line does not appear in the "Rejestr leków nie jest jeszcze wczytany" state

### Phase 2: Daily schedule and docs

#### Automated

- [x] 2.1 `/ci-check` passes
- [x] 2.2 `gh workflow view registry-import.yml` on the branch lists the schedule trigger

#### Manual

- [x] 2.3 After merge, a manual run succeeds and production `/szukaj` shows today's state date
- [x] 2.4 Within a day of the merge, a `schedule` run of the workflow succeeded — runs 37769510168 (2026-10-08 11:21 UTC), 37922993073 (2026-10-09 11:19 UTC)
- [x] 2.5 GitHub notification settings send email for failed workflows to the author
