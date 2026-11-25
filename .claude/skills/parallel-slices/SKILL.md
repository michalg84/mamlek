---
name: parallel-slices
description: Coordinate a group of roadmap slices built in parallel — one git worktree and one Claude Code worker session per slice in Herdr, with this session as the coordinator in the main checkout. Sets up workspaces and worktrees, the coordination board, the monitor, the worker briefs, the per-skill models, the shared local database, ports and file overlaps, then watches the group to the merge. Use whenever the user wants to run two or more slices at once or asks you to coordinate them — "odpal S-08 i S-15 równolegle", "praca równoległa", "praca grupowa", "w dwóch workspace'ach", "bądź koordynatorem", "dorzuć jeszcze jeden slice do grupy", "co robią agenci", "sprawdź workerów" — even if Herdr or worktrees are not named. Not for a single slice in this checkout (use the 10x chain directly) and not for background subagents.
---

# Parallel slices (coordinator)

You coordinate. The workers build. Each slice gets its own Herdr workspace, git worktree and Claude Code session. The user answers planning questions directly in each worker's pane. You never relay worker reports to the user. You only handle shared resources: database, ports, files several slices touch, merge order, infra.

Write to the user in Polish (see `CLAUDE.local.md`). The board, briefs-as-rules and this skill stay in English, except the worker brief, which the user reads in the pane, so it is in Polish.

## 0. Ground truth first

Before saying anything about the state of Herdr, a worker or a model, check the source that cannot be stale. Most mistakes in past runs came from stale or guessed state:

| Question                             | Reliable source                                                                                                                              | Unreliable                                                                                                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Is Herdr up?                         | `herdr status`, then `herdr agent list` (retry once)                                                                                         | `HERDR_ENV` in your shell; the first CLI call after a reboot. The desktop app (herdr-app + herdr-core) may not set `HERDR_ENV` in your pane, and one call returned `server_not_running` while the server was fine. |
| What is a worker doing, which model? | `node .claude/skills/parallel-slices/scripts/worker-status.mjs` (reads the session transcripts: real UTC times, model per reply, last skill) | `herdr agent read` screens (can show the start screen of a pane that has worked for an hour); `agent_status` (`blocked` can be stale)                                                                              |
| What time is it?                     | `date +%H:%M`                                                                                                                                | Your own sense of time, and the workers' Status log times (they wrote "12:20" at 11:49 even with the rule on the board). Never write a guessed time on the board.                                                  |
| Commits                              | `git -C <worktree> log --oneline main..HEAD`                                                                                                 | The worker's say-so                                                                                                                                                                                                |

## 1. Pick the group

Read `context/foundation/roadmap.md`: status, Prerequisites, "Parallel with", Streams and the Risk text of each candidate. Do not trust "Parallel with" alone. Check which files each slice will touch: the Outcome text, the change folder's research/plan if one exists, and the code. Two slices that both change the same component (e.g. `KitList.tsx`) are not parallel, even when the roadmap says they are. Flag "(po M-1)" slices: starting them early is the user's call. Give a recommendation, not a survey.

## 2. Prepare the infrastructure (yourself, do not ask the user)

- **Docker and local Supabase.** Starting them is allowed in `.claude/settings.local.json`:
  `powershell -NoProfile -Command "Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'"`, wait for `docker info`, then `npx supabase start` (retry `npx supabase status` while the DB container is "starting"). Record the DB state on the board: registry size, `kit_items`, `auth.users`.
- `git fetch` and check that `main` is clean and up to date.

## 3. Per slice: workspace, worktree, models, env

For each slice `<id>` (change id) with short name `sNN`:

1. **Create workspace + worktree** in one call:
   `herdr worktree create --workspace <coordinator ws> --branch feat/<id> --base main --path <repo>/.claude/worktrees/<id> --label "S-NN <id>" --no-focus`
   Read the new pane id (`.result.root_pane.pane_id`) from the JSON.
2. **Copy the 10x skills.** `.claude/skills/10x-*` is gitignored, so a fresh worktree has none. The model and effort of each skill live in those files, applied from `.claude/skill-models.json`. Without them the worker runs every step on the session model (Opus), including `/10x-implement`, which should run on Sonnet:
   `cp -r .claude/skills/10x-* .claude/worktrees/<id>/.claude/skills/`
   Then check inside the worktree: `node .claude/scripts/skill-models.mjs status`. Do this before the agent starts. A session started without the files kept using Opus even after they were copied.
3. **`.env` / `.dev.vars` are the user's step.** Copying secrets is blocked for you. Ask the user once, for all new worktrees: "skopiuj `.env` i `.dev.vars` z głównego checkoutu do `.claude/worktrees/<id>/`". Then note it on the board.
4. **Assign a port**: 4331, 4332, 4333… `kill-port.mjs` only knows 4321–4323 and 8787, so a worker stops its own server by PID.

## 4. Start the workers

**Wait for the user to attach.** Opening a workspace in the Herdr app interrupts a session already running in its pane. After creating the workspaces, tell the user they are ready (labels and pane ids) and wait for "gotowe" before starting the agents. If the user later cannot see a running agent, `herdr agent focus <name>` brings its pane forward without interrupting it.

Then for each pane:

1. `herdr agent start sNN --kind claude --pane <pane> --timeout 60000`
2. Read the pane. A new path can show the "N new MCP servers found" dialog. Ask the user once what to answer, then apply it: Enter toggles the checkbox under the cursor, so to enable all, leave the checkboxes ticked, press `down` until the cursor is on "Enable selected", then press Enter. Never answer a dialog you have not shown to the user.
3. Send the brief from a file, never inline (apostrophes such as `slice'a` break shell quoting): fill `assets/brief.template.md` into the scratchpad, then run `herdr agent prompt sNN "$(cat <file>)"`.
4. Check the worker started (`worker-status.mjs`, or a working state). A first status line on the board comes within minutes.

## 5. The board and the monitor

Create or reset `.claude/worktrees/COORDINATION.md` (ignored by git) from `assets/COORDINATION.template.md`. Read the old file first: if a previous group is still open, keep its open items. The board is the source of truth. `herdr agent prompt` pings are only a nudge.

- Sign every note as `coordinator (w1:p1)`, with the real time from `date`. If a "coordinator" note appears that you did not write, another session is acting as coordinator (e.g. a duplicate of this session). Tell the user and find which pane it is. Do not let two coordinators approve things.
- Arm the monitor with the Monitor tool: `node .claude/skills/parallel-slices/scripts/watch-board.mjs --needs`. It prints each new status line that needs the coordinator or touches the DB. Use a 30-minute timeout, and re-arm it each time it expires while the group is open. Workers use the same script (without `--needs`, `--notes` to see only coordinator notes) as their fallback when pings fail.
- A worker's ping (`herdr agent prompt w1:p1 "S-NN: …"`) arrives in your session as a new message after your current turn.

## 6. Answer coordination requests

Answer each request in "Coordinator notes" and nudge the worker with a short ping. Rules that worked:

- **Files outside a slice's list.** Grep the other slices' research/plan for the file before approving. Approve with conditions: one shared new component plus a one-line render in the shared page, no reformatting of existing markup, only additions in shared lists (`GUARDED` in `scripts/ui-scan.mjs`, `AGENTS.md`, `README.md`, `context/foundation/*`), and the slice that merges second runs `git merge origin/main` and keeps both sides.
- **Database.** One session at a time. `db reset`, migrations, `registry:import`, `test:db`, `test:api`, `smoke`, `search:check`, `perf`, `ui:shots` only with your go. Watch the sign-up limit: at most ~3 `test:api` runs per 5 min across all slices. `test:api` can be left to CI.
- **Ack and done.** Every worker confirms a coordinator note with an `ack: <HH:MM of the note> | started: <step>` line and closes the step with `done: <step>` (board rule, also in the brief). The monitor prints both. A note with no ack within a few minutes was not delivered: check the worker with `worker-status.mjs`, and if its Herdr status is stuck on `blocked` (a stale dialog on screen while the transcript shows fresh replies, as S-08 had), ask the user to tell the worker in its pane to read the board.
- **Blocked worker.** `herdr agent prompt` to an agent waiting at a question returns `agent_blocked`. Write the note on the board anyway, and send the ping from a background loop that waits until the agent is no longer `blocked`.
- **DB queue.** When several slices wait for the DB, write the order on the board (who is next, on which port) and let each post `DB: free` before you give the next go.
- **Verify a worker's claim before you pass it on.** A worker once reported "another S-15 session" left uncommitted edits. The edits came from its own subagent, as its transcript showed. Read the transcript (or `git status` in its worktree) before you tell the user about duplicate sessions, lost work or conflicts.
- **Machine load and usage limit.** Three workers plus their Stop hooks (`astro check` + the whole suite) overload the machine, and the hooks then fail on their time budget (280 s since 2026-11-18, was 100 s). That is load, not a broken gate. When the user says so, broadcast (board note + ping to every worker): a check that fails on a timeout is not retried or worked around; the worker writes a Status log line and waits until the user says to re-run. The same broadcast works when the usage limit is close: finish the current step, commit if the skill commits, write the status and stop before the next step. When the workers are idle, run the gates once yourself to confirm they fit the budget again. Prefer two workers at once over three on this machine.
- **Decisions that belong to the user** (scope, merge order of slices touching the same files, production `db push`, manual workflow dispatch): ask the user. Everything else you decide.

## 7. Models: verify, do not assume

`/10x-research`, `/10x-plan`, `/10x-plan-review`, `/10x-impl-review`: opus/high. `/10x-implement`, `/10x-tdd`: sonnet/high. `/10x-ui`, `/10x-e2e`: sonnet/medium. `/10x-new`, `/10x-archive`, `/10x-status`: haiku/low. `/ship-pr`: haiku/low. The source is `.claude/skill-models.json`; change models there, never in a SKILL.md.

A skill sets its model only when it is invoked: a worker that resumes on "kontynuuj" or after a context compaction stays on the session model (S-08 and S-16 both ran implement steps on Opus that way). The board rule "Model after continue" makes workers re-invoke the skill; watch the `model:` field after every resume. When a worker reaches `/10x-implement`, run `worker-status.mjs`. If its last replies are `claude-opus-*`, tell the user right away and propose `/model sonnet` in that pane. It takes effect from the next turn, so the current turn still finishes on Opus. The skill files can be present and the model still not switch, so the transcript is the only proof. Every Status log line carries `skill:` and `model:` (board rule) because the user reads the log to see how the workers work; those fields are the worker's own claim, so check them against `worker-status.mjs` when they matter.

## 8. Status checks and wrap-up

When the user asks "co robią agenci": run `worker-status.mjs`, read the board tail and `git log main..HEAD` per worktree, and answer in a short table (slice, phase, model, waits for). Admit stale information plainly when you find it.

After each PR merges (the worker ships with `/ship-pr`, auto-merge on): `git pull` in main, production `npx supabase db push` (dry-run first) if the slice has a migration and the user agreed, `npm run roadmap:sync` from main, then ask the other workers to merge `origin/main`. When a slice is archived, close its workspace (`herdr worktree remove --workspace <ws>`). On "Permission denied", the user runs `rm -rf` on the leftover directory. Update the project memory with the group's lessons.

## Files

- `assets/COORDINATION.template.md`: the board skeleton (rules, shared resources, notes, status log).
- `assets/brief.template.md`: the worker brief (Polish) with placeholders.
- `scripts/watch-board.mjs`: polls the board, prints new lines (`--needs`, `--notes`, `--all`). For the coordinator's Monitor and for workers.
- `scripts/worker-status.mjs`: per worktree, the latest transcript: last reply time, models of the last replies, last skill, commits ahead of main.
