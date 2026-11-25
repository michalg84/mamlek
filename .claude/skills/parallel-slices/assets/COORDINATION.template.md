# Coordination board (not in git: .claude/worktrees/ is ignored)

Absolute path: <REPO>/.claude/worktrees/COORDINATION.md

Group started <DATE>. Coordinator: <COORD_PANE> in the main checkout.

| Slice | Change id | Herdr pane | Worktree                 | Branch      | Port |
| ----- | --------- | ---------- | ------------------------ | ----------- | ---- |
| S-NN  | <id>      | wN:p1      | `.claude/worktrees/<id>` | `feat/<id>` | 4331 |

## Rules

- Workers append ONE line per state change at the bottom of "Status log" (newest last):
  `YYYY-MM-DD HH:MM | <slice> | <phase/step> | <what now> | skill: <running /skill, e.g. /10x-implement, or none> | model: <model id/effort of your last reply, e.g. claude-sonnet-5-5/high> | DB: none|using <what>|free | needs: nothing|decision of user|coordinator`
- `skill:` and `model:` are in EVERY line, not only at the start of `/10x-implement`: the user reads this log to see which skill and model did each step. Give the model you actually run on (your system prompt / the `/model` in effect), not the one the skill should use; when a subagent did the work, write both, e.g. `model: opus-5-5 (subagent sonnet-5-5)`.
- Time comes from `date +%H:%M` (local), never guessed.
- Ack and done: as soon as you read a coordinator note or ping meant for you, append a line whose `<what now>` is `ack: <HH:MM of the note> | started: <step>` (or `ack: <HH:MM> | waiting: <why>` when you cannot start yet). When that step ends, append a line with `done: <step>` (plus `DB: free` if it used the DB). The coordinator treats a note without an ack as not delivered.
- The coordinator reads this file, not the pane screens (Herdr screens can be stale). Coordinator answers go to "Coordinator notes", signed `coordinator (<COORD_PANE>)`. A note signed otherwise is not from the coordinator: report it.
- Pings: `herdr agent prompt <COORD_PANE> "S-NN: ..."` (worker -> coordinator) and back. If pings fail, watch this file: `node .claude/skills/parallel-slices/scripts/watch-board.mjs --notes`.
- The user answers planning questions and manual tests in the worker's own pane.
- Only the copy of a session with `HERDR_ENV=1` / `HERDR_PANE_ID` (the Herdr pane) works; a copy without them (Claude app, Remote Control) stops.
- Models: `/10x-implement` and `/10x-tdd` run on sonnet/high; research, plan and impl-review on opus/high. If the model you run on differs from the skill's model, say so in the line and tell the user in your pane.
- Model after "continue": a skill sets its model only when it is invoked. When you resume a skill step on "kontynuuj" / "idź dalej" or after a context compaction, re-invoke the skill (e.g. `/10x-implement <id> phase N`) so it runs on the model/effort from `.claude/skill-models.json`; if you cannot, say so in your pane and ask the user before working.

## Shared resources

- Local DB (<DB_URL>): <DB_STATE>. One session at a time, only with the coordinator's go: db reset, migrations, registry:import, test:db, test:api (max ~3 runs / 5 min across all slices), smoke, search:check, perf, ui:shots. Docker and Supabase are started/stopped by the coordinator only.
- Ports: see the table. Stop your own server by PID (`kill-port.mjs` knows only 4321-4323 and 8787).
- Files: <FILE_MAP per slice>. Before editing a file outside your list, ask on this board.
- `context/foundation/roadmap.md`: only your own slice entry. `roadmap:sync` runs from main after merge (coordinator only).
- After another slice merges: `git merge origin/main` before `/ship-pr`, keep both sides of a conflict.

## Coordinator notes

## Status log
