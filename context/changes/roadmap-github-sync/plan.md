# Roadmap → GitHub Projects Sync Implementation Plan

## Overview

Add a dependency-free local script, `npm run roadmap:sync`, that mirrors `context/foundation/roadmap.md` into GitHub one way: one issue per F-NN/S-NN, a repo milestone for the open roadmap milestone, a user-owned Projects board ("MamLek Roadmap") whose Status column matches the five roadmap statuses, text fields for Roadmap ID / Change ID / Stream, and GitHub "blocked by" dependencies derived from Prerequisites. `roadmap.md` stays the single source of truth; the 10x skills keep writing statuses there, and the sync only reflects them.

## Current State Analysis

- `context/foundation/roadmap.md` holds milestone M-1 (`milestone_id: first-pharmacy-check` in frontmatter, `**M-1: …** — Status: open` under `## Milestone`) and 9 items: F-01, S-01…S-08.
- Every item appears in four places with stable shapes (produced by `/10x-roadmap`):
  - `## At a glance` table — columns `ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status`. Prerequisites are comma-separated IDs or `—`.
  - `## Backlog Handoff` table — `Roadmap ID | Change ID | Suggested issue title | Ready for /10x-plan | Notes`. This is the issue-title source.
  - `## Streams` table — `Stream | Theme | Chain | Note`, Chain lists backticked IDs (`` `F-01` → `S-01` … ``). F-01 appears in stream A only; S-04 in B, S-05/S-08 in C, S-07 in D.
  - `### <ID>: …` body blocks with `- **Status:**` lines (kept in sync with the table by the skills).
- Status vocabulary is `proposed | ready | planning | in-progress | done`: `/10x-plan` → `planning`, `/10x-implement` → `in-progress`, `/10x-archive` → `done` (`.claude/skills/10x-plan/SKILL.md`, "Roadmap status sync").
- GitHub: repo `michalg84/mamlek` has no issues, only default labels, no user projects. `gh` 2.101.0 is logged in with scopes `gist, project, read:org, repo, workflow`.
- Script precedent: `scripts/smoke.mjs` — plain ESM, zero dependencies, `console.log` output, wired as `npm run smoke`. ESLint lints `**/*` including `.mjs` (`no-console` is only a warning); `tsconfig.json` includes `**/*`.
- No unit test runner exists (AGENTS.md: "`smoke` is the only automated test").

## Desired End State

Running `npm run roadmap:sync` with the current roadmap produces, on GitHub:

- 9 open issues labelled `roadmap`, titled `F-01: Wczytanie kopii Rejestru Produktów Leczniczych do bazy` … `S-08: …`, each assigned to milestone `M-1: Pierwsze sprawdzenie leku w aptece`.
- A user project "MamLek Roadmap" linked to `michalg84/mamlek`, with Status options exactly `Proposed, Ready, Planning, In progress, Done`, text fields `Roadmap ID`, `Change ID`, `Stream`, and all 9 issues on it with fields set (F-01 → Ready, others → Proposed).
- Blocked-by links matching Prerequisites (e.g. S-03 blocked by S-01 and S-02; S-08 by S-03 and S-05).

A second run immediately afterwards reports "no changes". `npm run roadmap:sync -- --dry-run` prints the planned actions and performs no writes. Verify by the board view in the browser and by the idempotent second run.

### Key Discoveries:

- Backlog Handoff table already carries a human-friendly issue title per item — `context/foundation/roadmap.md` `## Backlog Handoff`.
- `updateProjectV2Field` accepts `singleSelectOptions` (verified against live GraphQL schema) — the only way to rename the built-in Status options.
- Issue dependencies: REST `GET/POST /repos/{owner}/{repo}/issues/{n}/dependencies/blocked_by` (POST body `{"issue_id": <database id>}`), `DELETE …/blocked_by/{issue_id}`; GraphQL `addBlockedBy` / `removeBlockedBy` also exist. POST/DELETE may hit secondary rate limits when called quickly.
- `GITHUB_TOKEN` in Actions cannot write user-owned Projects v2 — a reason the trigger stays local.

## What We're NOT Doing

- No two-way sync: edits made on GitHub to synced fields (title, body, milestone, Status, custom fields) are overwritten on the next run.
- No CI job or scheduled trigger; no new repository secrets.
- No reopening of closed issues and no closing of issues by the sync — closing happens via PR `Closes #N` (or by hand).
- No deletion or archiving of issues/board items whose ID disappeared from `roadmap.md` — warn only.
- No issues for Open Roadmap Questions or Parked items.
- No two-way status write-back into `roadmap.md`, and no changes to the 10x skills.
- No unit-test runner introduction; parser correctness is enforced by fail-fast validation plus `--dry-run` inspection.
- No npm dependencies — everything goes through the `gh` CLI.

## Implementation Approach

One ESM script, `scripts/roadmap-sync.mjs`, in the style of `scripts/smoke.mjs`: a pure parse step that builds the desired state from `roadmap.md`, then idempotent "ensure" steps that read current GitHub state, diff, and write only differences. All GitHub access goes through `gh` via `child_process.execFileSync` (`gh api`, `gh api graphql`, `gh project …` with `--format json`), so authentication is whatever `gh auth` holds. Every write step is guarded by `--dry-run`, which prints `would create/update …` lines instead. Output is one line per action plus a final summary and a warnings block.

Owner/repo come from `gh repo view --json owner,name`. Issues are matched by a hidden body marker `<!-- roadmap-id: S-03 -->` among issues carrying the `roadmap` label (all states), not by title, so title edits in the roadmap update the issue instead of duplicating it.

## Critical Implementation Details

- **State sequencing (Status options):** replacing Status options via `updateProjectV2Field` regenerates option IDs and clears every item's Status value. Compare current option names to the desired five first and update only when they differ; do it before any item status is set, then re-read option IDs.
- **Closed issues:** the sync never reopens a closed issue and never writes its board Status (GitHub's built-in project workflow moves closed items to Done). Title, body, milestone and the custom text fields are still kept in sync. If `roadmap.md` says anything other than `done` for a closed issue, emit a warning suggesting `/10x-archive`.
- **Dependency pass ordering:** blocked-by links need the database `id` of every roadmap issue, so they run after all issues exist (including ones created in the same run).

## Phase 1: Roadmap parser and dry-run

### Overview

Parse `roadmap.md` into a validated desired state and print it; no GitHub calls yet. Wire the npm script.

### Changes Required:

#### 1. Sync script — parse step

**File**: `scripts/roadmap-sync.mjs`

**Intent**: Read `context/foundation/roadmap.md` (path resolved from repo root), extract the milestone and every roadmap item, validate it, and in `--dry-run` print the desired state per item. Without `--dry-run`, Phase 1 exits with a clear "GitHub sync not implemented yet" message (removed in Phase 2).

**Contract**: Desired state shape consumed by later phases:

- `milestone`: `{ id: "M-1", title: "M-1: Pierwsze sprawdzenie leku w aptece", status: "open" }` from the `## Milestone` bold line.
- `items[]`: `{ id, changeId, title, outcome, prerequisites: string[], prdRefs, status, stream }` where `title` = `"<ID>: <Suggested issue title>"` from Backlog Handoff, `outcome`/`prdRefs`/`prerequisites`/`status` from At a glance, `stream` = the Streams-table letter whose Chain contains the ID in backticks (empty string if none).
- Fail fast (non-zero exit, message naming the offending ID/row) when: a required section or column header is missing; an ID in At a glance has no Backlog Handoff row or vice versa; a status is outside `proposed|ready|planning|in-progress|done`; a prerequisite references an unknown ID; duplicate IDs.
- CLI flags: `--dry-run`. No other options.

#### 2. npm script

**File**: `package.json`

**Intent**: Expose the script next to `smoke`.

**Contract**: `"roadmap:sync": "node scripts/roadmap-sync.mjs"`.

### Success Criteria:

#### Automated Verification:

- `npm run roadmap:sync -- --dry-run` exits 0 and lists 9 items with IDs F-01, S-01…S-08, statuses matching the At a glance table, and streams F-01→A, S-04→B, S-05→C, S-07→D
- `npm run lint` passes (warnings allowed, no errors)
- `npx astro check` passes

#### Manual Verification:

- Temporarily changing one status in a scratch copy of the roadmap to `blocked` (or removing a Backlog Handoff row) makes the dry run fail with a message naming the item; the real `roadmap.md` is left untouched

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Issues and milestone

### Overview

Make GitHub issues and the milestone match the desired state, idempotently.

### Changes Required:

#### 1. Sync script — issues & milestone step

**File**: `scripts/roadmap-sync.mjs`

**Intent**: Ensure the `roadmap` label exists; ensure a repo milestone titled with `milestone.title` exists (open); for each item, find its issue by marker among `roadmap`-labelled issues (state all) and create or update title/body/milestone so they match. Closed issues are never reopened; mismatches between a closed issue and a non-`done` roadmap status are collected as warnings. Issues carrying the `roadmap` label whose marker ID is not in the roadmap are reported as warnings and left alone.

**Contract**:

- Label: `roadmap` (created via `gh label create`, skipped if present).
- Issue body template (regenerated on every run, compared as a whole string):
  - first line `<!-- roadmap-id: <ID> -->` (hidden marker; the matching key)
  - `**Outcome:** <outcome>`
  - `**Change ID:** \`<changeId>\``
  - `**PRD refs:** <prdRefs>`
  - `**Prerequisites:** <comma-separated IDs or —>`
  - a footer line stating the issue is generated from `context/foundation/roadmap.md` and edits here are overwritten, with a link to the file on `main`
- Updates are issued only when title, body or milestone differ; output one line per create/update and a `no changes` summary when nothing differs.
- `--dry-run` performs the reads but prints `would …` instead of writing.

### Success Criteria:

#### Automated Verification:

- `npm run roadmap:sync -- --dry-run` against the empty repo lists "would create" for the label, milestone and 9 issues, and performs no writes (`gh issue list --label roadmap --state all` still returns nothing)
- `npm run roadmap:sync` creates the label, milestone and 9 issues; `gh issue list --label roadmap --json title --jq length` returns 9
- A second `npm run roadmap:sync` reports no issue/milestone changes
- `npm run lint` passes

#### Manual Verification:

- Issues on GitHub read well: Polish titles with ID prefix, body fields correct, milestone shows 0/9
- Editing an issue title by hand on GitHub and re-running the sync restores the roadmap title
- Closing one issue by hand and re-running prints a warning for it and does not reopen it (reopen it by hand afterwards)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Project board

### Overview

Create and maintain the "MamLek Roadmap" user project with roadmap statuses and custom fields.

### Changes Required:

#### 1. Sync script — board step

**File**: `scripts/roadmap-sync.mjs`

**Intent**: Find the user project titled "MamLek Roadmap" for the repo owner (create it if missing) and link it to the repo; make the Status field options exactly the five roadmap statuses; ensure the three text fields exist; add every roadmap issue to the board; set Status and text fields per item, writing only values that differ. Status is not written for closed issues.

**Contract**:

- Project title constant: `MamLek Roadmap`; owner = repo owner; linked via `gh project link`.
- Status option names and order, mapped from roadmap values: `proposed→Proposed`, `ready→Ready`, `planning→Planning`, `in-progress→In progress`, `done→Done`. Options are replaced via GraphQL `updateProjectV2Field(input: { fieldId, singleSelectOptions })` only when names/order differ (see Critical Implementation Details).
- Text fields: `Roadmap ID`, `Change ID`, `Stream` (created with `gh project field-create --data-type TEXT` when missing).
- Items added with `gh project item-add` (idempotent — returns the existing item); values set with `gh project item-edit` (`--single-select-option-id` / `--text`).
- `--dry-run` honoured for every write, including project creation (in which case later board steps print "would …" for all items).

### Success Criteria:

#### Automated Verification:

- `npm run roadmap:sync` creates the project; `gh project list --owner michalg84 --format json` contains "MamLek Roadmap"
- `gh project field-list <n> --owner michalg84 --format json` shows Status with exactly Proposed, Ready, Planning, In progress, Done and the three text fields
- `gh project item-list <n> --owner michalg84 --format json` returns 9 items with F-01 = Ready and the rest = Proposed
- A second run reports no board changes
- `npm run lint` passes

#### Manual Verification:

- The board is visible from the repo's Projects tab and a Board view grouped by Status shows the five columns in roadmap order
- Grouping or filtering by Stream / Change ID works in the GitHub UI

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Blocked-by dependencies and docs

### Overview

Mirror Prerequisites as GitHub issue dependencies, document the command, and do the first full real sync.

### Changes Required:

#### 1. Sync script — dependency step

**File**: `scripts/roadmap-sync.mjs`

**Intent**: After all issues exist, make each roadmap issue's blocked-by set among roadmap issues equal its Prerequisites: add missing links, remove links to other roadmap issues that are no longer prerequisites. Links to non-roadmap issues are left alone. Runs after the issue step so newly created issues are included.

**Contract**: REST `GET /repos/{owner}/{repo}/issues/{n}/dependencies/blocked_by`, `POST` with `{"issue_id": <database id of blocker>}`, `DELETE …/blocked_by/{issue_id}`. Writes are sequential (no parallel calls) to stay under secondary rate limits. `--dry-run` honoured.

#### 2. Command reminder for agents

**File**: `AGENTS.md`

**Intent**: Remind agents (and the human) to re-sync after the roadmap changes, since the trigger is manual.

**Contract**: One bullet in `## Command tripwires`: `npm run roadmap:sync` mirrors `context/foundation/roadmap.md` to GitHub Issues + the "MamLek Roadmap" project (one-way; GitHub edits to synced fields get overwritten); run it after any roadmap status/item change (e.g. after `/10x-plan`, `/10x-implement`, `/10x-archive`, `/10x-roadmap`); needs `gh` with the `project` scope (`gh auth refresh -h github.com -s project`, from a real terminal); `-- --dry-run` previews.

#### 3. README scripts table

**File**: `README.md`

**Intent**: List the new command alongside the others.

**Contract**: One row in the `## Scripts` table: `npm run roadmap:sync` — one-way sync of the roadmap to GitHub Issues + Project (`-- --dry-run` to preview; needs `gh` with `project` scope).

### Success Criteria:

#### Automated Verification:

- `npm run roadmap:sync` adds blocked-by links; `gh api repos/michalg84/mamlek/issues/<S-03 number>/dependencies/blocked_by --jq '[.[].title]'` lists the S-01 and S-02 issues
- A second `npm run roadmap:sync` reports no changes at all (issues, milestone, board, dependencies)
- `npm run lint` passes
- `npx astro check` passes

#### Manual Verification:

- S-03 and S-08 show "Blocked by" relationships in the GitHub issue sidebar; F-01 shows none
- AGENTS.md and README entries read correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None (no test runner in the repo). Parser correctness is covered by fail-fast validation and by the `--dry-run` output checked in Phase 1.

### Integration Tests:

- The real sync against `michalg84/mamlek` is the integration test: first run creates, second run must report no changes (idempotency), per phase.

### Manual Testing Steps:

1. `npm run roadmap:sync -- --dry-run` — inspect planned actions.
2. `npm run roadmap:sync` — then open the repo Projects tab, check the board, issues, milestone and blocked-by sidebar.
3. Re-run — expect "no changes".
4. Change one item's status in `roadmap.md` locally (e.g. S-01 `proposed` → `ready`), run the sync, see only that board item move; revert the edit and sync again.
5. Close one issue by hand, sync, see the warning and no reopen; reopen it by hand.

## Performance Considerations

~9 items → a few dozen `gh` calls per run; sequential execution is fine. Dependency writes stay sequential to avoid secondary rate limits.

## Migration Notes

None — GitHub starts empty. When a later milestone replaces M-1, the new milestone is created and new items get synced; old issues stay as they are (warnings only if their IDs vanish from the roadmap).

## References

- Roadmap source: `context/foundation/roadmap.md`
- Status lifecycle: `.claude/skills/10x-plan/SKILL.md` ("Roadmap status sync")
- Script precedent: `scripts/smoke.mjs`
- Issue dependencies REST API: https://docs.github.com/en/rest/issues/issue-dependencies
- Decision record (tool choice): user memory note "backlog-tool-github-projects"

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Roadmap parser and dry-run

#### Automated

- [x] 1.1 `npm run roadmap:sync -- --dry-run` exits 0 and lists 9 items with IDs F-01, S-01…S-08, statuses matching the At a glance table, and streams F-01→A, S-04→B, S-05→C, S-07→D — 53ad3c6
- [x] 1.2 `npm run lint` passes (warnings allowed, no errors) — 53ad3c6
- [x] 1.3 `npx astro check` passes — 53ad3c6

#### Manual

- [x] 1.4 Temporarily changing one status in a scratch copy of the roadmap to `blocked` (or removing a Backlog Handoff row) makes the dry run fail with a message naming the item; the real `roadmap.md` is left untouched — 53ad3c6

### Phase 2: Issues and milestone

#### Automated

- [x] 2.1 `npm run roadmap:sync -- --dry-run` against the empty repo lists "would create" for the label, milestone and 9 issues, and performs no writes (`gh issue list --label roadmap --state all` still returns nothing)
- [x] 2.2 `npm run roadmap:sync` creates the label, milestone and 9 issues; `gh issue list --label roadmap --json title --jq length` returns 9
- [x] 2.3 A second `npm run roadmap:sync` reports no issue/milestone changes
- [x] 2.4 `npm run lint` passes

#### Manual

- [x] 2.5 Issues on GitHub read well: Polish titles with ID prefix, body fields correct, milestone shows 0/9
- [x] 2.6 Editing an issue title by hand on GitHub and re-running the sync restores the roadmap title
- [x] 2.7 Closing one issue by hand and re-running prints a warning for it and does not reopen it (reopen it by hand afterwards)

### Phase 3: Project board

#### Automated

- [ ] 3.1 `npm run roadmap:sync` creates the project; `gh project list --owner michalg84 --format json` contains "MamLek Roadmap"
- [ ] 3.2 `gh project field-list <n> --owner michalg84 --format json` shows Status with exactly Proposed, Ready, Planning, In progress, Done and the three text fields
- [ ] 3.3 `gh project item-list <n> --owner michalg84 --format json` returns 9 items with F-01 = Ready and the rest = Proposed
- [ ] 3.4 A second run reports no board changes
- [ ] 3.5 `npm run lint` passes

#### Manual

- [ ] 3.6 The board is visible from the repo's Projects tab and a Board view grouped by Status shows the five columns in roadmap order
- [ ] 3.7 Grouping or filtering by Stream / Change ID works in the GitHub UI

### Phase 4: Blocked-by dependencies and docs

#### Automated

- [ ] 4.1 `npm run roadmap:sync` adds blocked-by links; `gh api repos/michalg84/mamlek/issues/<S-03 number>/dependencies/blocked_by --jq '[.[].title]'` lists the S-01 and S-02 issues
- [ ] 4.2 A second `npm run roadmap:sync` reports no changes at all (issues, milestone, board, dependencies)
- [ ] 4.3 `npm run lint` passes
- [ ] 4.4 `npx astro check` passes

#### Manual

- [ ] 4.5 S-03 and S-08 show "Blocked by" relationships in the GitHub issue sidebar; F-01 shows none
- [ ] 4.6 AGENTS.md and README entries read correctly
