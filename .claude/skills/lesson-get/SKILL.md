---
name: lesson-get
description: Fetch a new 10xDevs lesson pack (10x-cli skills, prompts and the CLAUDE.md rules block) into this project, keeping the local model/effort settings of the 10x-* skills. Use whenever the user wants the next or a specific course lesson — "pobierz lekcję", "pobierz nową lekcję 10x", "zaciągnij m3l4", "get lesson", "10x-cli get", "nowa lekcja", "update 10x skills" — even if they do not name the lesson id.
argument-hint: "[lesson id, e.g. m3l4]"
model: haiku
effort: low
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

# Lesson get

Fetch a lesson with `node .claude/scripts/lesson-get.mjs <lesson>`. The script does the fiddly parts so you do not have to:

- removes the local `model` / `effort` block from the 10x-* skills before the fetch (10x-cli skips files it thinks were edited) and puts it back afterwards, from `.claude/skill-models.json`;
- prints a short summary instead of 10x-cli's raw JSON, which lists every file (~6k tokens);
- when 10x-cli skips the CLAUDE.md block as "locally modified" (Prettier reformats it on each commit), replaces the text between the `10x-cli` markers with the lesson's rules, keeping the header and `@AGENTS.md`.

Never call `10x-cli get` yourself, and never edit `.claude/skills/10x-*` by hand — both bypass that protection.

## 1. Pick the lesson

- The user named one (`m3l4`, "lekcja 4 modułu 3") → use it, lowercase `m<module>l<lesson>`.
- Not named → read `lessonId` from `.claude/.10x-cli-manifest.json` (the last lesson applied) and propose the next one, e.g. `m3l3` → `m3l4`. Ask with AskUserQuestion (Polish): the next lesson in the same module first, then the first lesson of the next module (`m4l1`), so the user can confirm or type another id.

## 2. Fetch

```bash
node .claude/scripts/lesson-get.mjs <lesson>
```

It may take a minute (npx downloads the latest 10x-cli). Exit codes: `0` ok, `1` fetch failed, `2` bad lesson id.

## 3. Handle the result

- **Exit 0** → go to step 4.
- **Exit 1, auth error** (not logged in, token expired) → tell the user to log in from their terminal and run the skill again:
  `! npx @przeprogramowani/10x-cli@latest auth`
- **Exit 1, lesson locked or not found** → say so, with the release date if the output gives one. Do not retry with a different id on your own.
- **Exit 1, anything else** → show the error lines and stop.
- **`warning: model/effort could not be re-applied`** → run `node .claude/scripts/skill-models.mjs apply` once and report what it prints.
- **`WARNING CLAUDE.md lost its @AGENTS.md import`** → tell the user; the import must be the first content line of `CLAUDE.md`.

## 4. Report (in Polish, short)

1. Lesson id and title.
2. What changed: new or updated skills (from the `files` lines), and whether the CLAUDE.md block was replaced.
3. **`no model` line** → these are skills new to this project with no entry in `.claude/skill-models.json`. For each, propose a model and effort in a small table, using the existing entries as the pattern (thinking and decisions → `opus`/`high`; executing a ready plan → `sonnet`; mechanical file operations → `haiku`/`low`; one-off setup or audits → `{}`, the session model). Ask the user to approve; after approval add the entries to `.claude/skill-models.json` and run `node .claude/scripts/skill-models.mjs apply`.
4. Next step: read the new block in `CLAUDE.md` (its Task Router table) and name the lesson's first skill to run. Suggest that next lesson step, not feature work.

Do not commit. `CLAUDE.md` and possibly `.claude/skill-models.json` are tracked, so mention that `/ship` will pick them up.
