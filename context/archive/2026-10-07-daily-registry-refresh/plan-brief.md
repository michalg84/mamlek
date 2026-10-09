# Daily Registry Refresh — Plan Brief

> Full plan: `context/changes/daily-registry-refresh/plan.md`

## What & Why

Roadmap slice S-07: the production registry refreshes itself every day, and the app shows how old it is. The infrastructure risk register describes the failure this prevents: a scheduled import that stops silently while the app looks fine, until a newly registered medicine can't be found at the pharmacy counter.

## Starting Point

The production import (`registry-import.yml`) runs only when started by hand. Every import already records the RPL state date (`stanNaDzien`) and `/szukaj` already loads it, but the page never shows it.

## Desired End State

The import runs daily at 04:17 UTC from `main` (manual runs still possible). `/szukaj` shows a discreet line `Stan rejestru na 7.10.2026`. A failed scheduled run emails the author through GitHub's standard notification.

## Key Decisions Made

| Decision          | Choice                                  | Why (1 sentence)                                                                                        |
| ----------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Date shown        | RPL state date (`snapshot_date`)        | It is the age of the data behind the answer, not of our job.                                            |
| Placement         | Always visible, muted line on `/szukaj` | Explains a "not found" result and keeps the registry's age visible without adding noise.                |
| Staleness warning | None                                    | When a medicine is found, the date doesn't matter to the user; the app should not nag or block.         |
| Failure alert     | GitHub's failed-workflow email only     | Zero new code, providers or secrets.                                                                    |
| Unchanged days    | Import as-is daily                      | RPL changes `stanNaDzien` daily, so a skip would never trigger; MVP accepts a new list version per day. |
| Run time          | `17 4 * * *` (04:17 UTC)                | Off the full hour, where GitHub delays and drops more scheduled runs.                                   |

## Scope

**In scope:**

- Date formatting helper and the date line on `/szukaj`
- Smoke assertion for the date line
- Daily `schedule` trigger in `registry-import.yml`
- README and AGENTS.md updates

**Out of scope:**

- 7-day staleness warning or blocking
- Heartbeat service or GitHub issue on failure
- Skipping unchanged snapshots or keeping the list version stable
- Import script, migration or `infrastructure.md` changes; date on future screens

## Architecture / Approach

No new data path: `getSearchListVersion()` already returns `snapshotDate`, so `szukaj.astro` formats it with a pure string split (no `Date`, no timezone shift) and renders it server-side. The workflow gains a cron next to `workflow_dispatch`; its main-only guard, concurrency group and timeout already fit unattended runs.

## Phases at a Glance

| Phase                             | What it delivers                                  | Key risk                                                     |
| --------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| 1. Registry state date on /szukaj | Date line + smoke assertion, verified locally     | A guarded-view slip (palette class) caught by `ui:scan`      |
| 2. Daily schedule and docs        | Cron trigger + docs; verified after merge to main | The schedule can only be confirmed from `main`, the next day |

**Prerequisites:** F-01 done (it is); `REGISTRY_DATABASE_URL` secret set; local Supabase + fixtures for smoke.
**Estimated effort:** ~1 short session; small enough for `/goal` or `claude -p`, with Phase 2's manual checks after merge.

## Open Risks & Assumptions

- A disabled or skipped schedule sends no email; the only signal is the date on `/szukaj` getting older (accepted).
- Failure emails go to the user who last changed the cron line and depend on GitHub notification settings.
- Every phone downloads the list again once a day (cold load on the first search); revisit with `npm run perf` if it hurts.
- Making the repository public would bring back the 60-day auto-disable of scheduled workflows.

## Success Criteria (Summary)

- `/szukaj` shows `Stan rejestru na <today's RPL date>` in production.
- A `schedule` run of the import succeeds without anyone starting it.
- A failed run reaches the author's inbox.
