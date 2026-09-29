# Roadmap → GitHub Projects Sync — Plan Brief

> Full plan: `context/changes/roadmap-github-sync/plan.md`

## What & Why

A local command, `npm run roadmap:sync`, mirrors the roadmap items (F-NN/S-NN) from `context/foundation/roadmap.md` into GitHub Issues and a GitHub Projects board. The roadmap stays the source of truth: the 10x skills keep updating statuses there, and GitHub becomes a view of it with issues that PRs can close via `Closes #N`. GitHub was chosen over Linear because code, PRs, CI and deploy already live there.

## Starting Point

The roadmap has milestone M-1 and 9 items, each with an ID, Change ID, outcome, prerequisites, PRD refs and status, plus an issue title in the Backlog Handoff table. The repo has no issues and the owner has no projects; `gh` is logged in with the `project` scope. `scripts/smoke.mjs` shows the repo's pattern for a dependency-free Node script.

## Desired End State

One run creates 9 `roadmap`-labelled issues (`S-03: …`) on milestone "M-1: Pierwsze sprawdzenie leku w aptece". It also creates a "MamLek Roadmap" board with columns Proposed / Ready / Planning / In progress / Done and fields Roadmap ID, Change ID and Stream, plus blocked-by links taken from Prerequisites. A second run reports no changes. After a roadmap status changes, re-running moves only that card.

## Key Decisions Made

| Decision         | Choice                                                          | Why (1 sentence)                                                                              |
| ---------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Backlog tool     | GitHub Projects, not Linear                                     | Solo project, and everything else is already on GitHub.                                       |
| Direction        | One-way, roadmap.md → GitHub                                    | The skills already write statuses to the roadmap, so there are no conflicts to resolve.       |
| Trigger          | Local `npm run roadmap:sync` (+ `--dry-run`)                    | No secrets or CI changes, and it works with the current `gh` login.                           |
| Trigger reminder | Line in AGENTS.md "Command tripwires" + README scripts row      | A manual trigger is easy to forget; this reminds both agents and the human.                   |
| Status mapping   | 5 board columns matching roadmap statuses 1:1                   | Keeps the proposed/ready and planning/in-progress distinctions visible on the board.          |
| Closed issue     | Never reopen; skip Status; warn if the roadmap isn't `done`     | A merged `Closes #N` is the real signal, and the warning reminds you to run `/10x-archive`.   |
| Extras           | Board fields + milestone, and Prerequisites as blocked-by links | Lets you filter/group by stream, shows milestone progress, and shows which items are blocked. |
| Issue matching   | Hidden `<!-- roadmap-id: … -->` marker in the issue body        | Renaming an item in the roadmap updates its issue instead of creating a duplicate.            |

## Scope

**In scope:**

- Parsing and validating roadmap.md; `--dry-run`
- Issues, `roadmap` label, milestone
- User project board: Status options, 3 text fields, items and their values
- Blocked-by dependencies between roadmap issues
- AGENTS.md + README notes, `package.json` script

**Out of scope:**

- Two-way sync, CI/scheduled trigger, new secrets
- Reopening, closing or deleting issues; handling items removed from the roadmap (warn only)
- Issues for Open Roadmap Questions or Parked items
- New npm dependencies or a unit-test runner

## Architecture / Approach

`scripts/roadmap-sync.mjs` first parses roadmap.md into a validated desired state: the milestone, plus each item's title, body fields, status, stream and prerequisites. It then runs idempotent "ensure" steps in order: label + milestone → issues → board (Status options before any item values) → blocked-by links. Each step reads GitHub's current state through `gh` (`gh api`, `gh api graphql`, `gh project`) and writes only what differs; `--dry-run` prints `would …` instead of writing.

## Phases at a Glance

| Phase                               | What it delivers                                             | Key risk                                                                           |
| ----------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 1. Roadmap parser and dry-run       | Validated desired state printed; `roadmap:sync` npm script   | Parsing depends on the table layout `/10x-roadmap` produces                        |
| 2. Issues and milestone             | 9 issues + M-1 milestone, created and updated only on change | Accidental duplicates if marker matching is wrong (dry-run first)                  |
| 3. Project board                    | "MamLek Roadmap" board with 5 statuses and 3 text fields     | Replacing Status options clears existing values, so it must run before item values |
| 4. Blocked-by dependencies and docs | Prerequisite links; AGENTS.md/README notes; clean second run | Secondary rate limits on dependency writes (kept sequential)                       |

**Prerequisites:** `gh` logged in with the `project` scope (done on 2026-09-29).
**Estimated effort:** ~1–2 sessions across 4 phases.

## Open Risks & Assumptions

- Assumes `/10x-roadmap` keeps the table headers stable; a template change makes the parser stop with an error rather than sync bad data.
- The board lags the roadmap until someone runs the sync; the AGENTS.md reminder is the only safeguard.
- Edits made on GitHub to synced fields are overwritten without warning.

## Success Criteria (Summary)

- The board in the repo's Projects tab shows all roadmap items in their correct status columns, with blocked-by links.
- After any roadmap change, one command brings GitHub up to date, and repeated runs are no-ops.
- A PR with `Closes #N` closes the issue, and the sync never reopens it.
