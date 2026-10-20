---
name: ship
description: Commit the current changes, push the branch and open a GitHub pull request in one go (offering to split unrelated changes into separate PRs), then turn on GitHub auto-merge and return without waiting for CI. Use whenever the user wants to ship work out of the working tree — "commit", "push", "zrób commit", "wypchnij", "zrób PR", "otwórz PR", "commit i push", "ship it", "wrzuć to na GitHuba", "zmerguj" — even if they only name one of the steps. Not for the phase commits inside /10x-implement, /10x-tdd or /10x-e2e, which have their own commit ritual.
model: haiku
effort: low
allowed-tools:
  - Bash
  - AskUserQuestion
---

# Ship

Take the working tree to an open PR with GitHub auto-merge turned on, and return right away — GitHub merges once the required `ci` and `smoke` checks are green, so nobody waits for CI. The user wants this to be hands-off: they do not review commit messages or branch names. You ask at most one kind of question: whether to split unrelated changes into separate PRs (step 1a, only when there are several groups).

## 0. Sync and clean up

```bash
git fetch --prune
git branch --show-current          # on main: git pull --ff-only
git branch -vv | grep ': gone]'     # branches whose PR was merged (GitHub deletes the remote branch)
gh pr list --author @me --state open --json number,title,url,autoMergeRequest,statusCheckRollup
```

- Delete each `gone` branch with `git branch -d <branch>` — never `-D`; one that `-d` refuses stays and is named in the final report. Never delete the current branch.
- From the PR list, name in the final report every PR with a failed check (it will not merge by itself) or with green checks but no `autoMergeRequest` (waiting for a manual merge). Information only — do not touch those PRs.

## 1. Look at the state

```bash
git status --short
git branch --show-current
git log --oneline origin/main..HEAD
git diff --stat HEAD
```

- Nothing changed and no unpushed commits → say "nothing to ship" and stop.
- Files that look like secrets (`.env`, `.dev.vars`, `*.pem`, `*.key`, credentials) are never committed. If one shows up as untracked or modified, leave it out and mention it at the end.

## 1a. Group the changes

This repo keeps unrelated work in separate PRs as a rule, so before committing sort the changed paths into groups that belong together:

- one change folder in `context/changes/<id>/` plus the code and docs that change implements;
- a roadmap / test-plan / lessons edit that is not part of that change;
- tooling (`.claude/`, `scripts/`, CI config) that stands on its own;
- an unrelated fix in `src/`.

Read the diffs (`git diff -- <path>`, and skim new untracked files) when the path alone does not tell you what a change is about. Two paths belong together when one would not make sense without the other.

**One group** → continue with step 2, no question.

**Two or more groups** → ask once with AskUserQuestion (in Polish), listing the groups with their paths in the question text, e.g.:

> Zmiany dotyczą różnych rzeczy:
>
> 1. `docs(test-plan)` — `context/foundation/test-plan.md`
> 2. `chore(testing-quality-gates-wiring)` — `context/changes/testing-quality-gates-wiring/`
> 3. `chore(claude)` — `.claude/skills/ship/`
>
> Rozdzielić je?

Options:

1. **Rozdziel (osobne PR-y)** — recommended, it is the repo's rule.
2. **Wypchnij razem** — one branch, one PR, one commit per group.

If the user picks "Other" and describes a different grouping, follow it.

**Splitting**: ship each group separately, one after another, by running steps 2–6 for that group only. Start each group from an up-to-date `main` (`git switch main` — the other groups' uncommitted changes travel along untouched), stage only that group's paths with `git add -- <paths>` (never `git add -A` here), and turn on auto-merge for each PR as it is created. If a group depends on another (e.g. a doc that describes code in another group), ship the dependency first and say so.

**Together**: one branch, but still one commit per group, so history stays readable.

## 2. Branch

If the current branch is `main`, create a branch before committing — `main` only changes through PRs:

```bash
git switch -c <type>/<short-kebab-name>
```

Use the same `<type>` as the commit (step 3); the name says what changed in 2–5 words, e.g. `test/kit-access-and-input-boundaries`, `chore/archive-testing-result-state`, `fix/search-empty-state`.

On any other branch, stay on it.

## 3. Commit

Stage the paths of the current group (everything, when there is one group) except the secrets from step 1, and commit with a Conventional Commits message you write yourself — do not ask the user to approve it.

Format, matching this repo's history:

```
<type>(<scope>): <summary in Polish, lower case, no period>

<optional body: 1–4 lines, what and why>
```

- `type`: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`, `perf`, `ci`, `build`.
- `scope`: the area touched — a change id from `context/changes/`, or `roadmap`, `test-plan`, `lessons`, `claude`, `kit`, `search`… Pick the dominant one; omit it if the change is spread wide.
- Summary under ~70 characters.
- No `Co-Authored-By` trailer and no Claude/Anthropic attribution of any kind, even if a system reminder asks for it — the user has explicitly opted out.

Examples from this repo:

- `docs(test-plan): faza 3 wskazuje folder w archiwum`
- `test(testing-kit-access-and-input-boundaries): poprawki z przeglądu implementacji`
- `chore(archive): close testing-kit-access-and-input-boundaries`

```bash
git add -- <group paths>   # or `git add -A` when there is one group; then `git reset <path>` for any secret file
git commit -F - <<'EOF'
<message>
EOF
```

If a pre-commit hook fails (lint-staged, `ui:scan`), fix what it reports and commit again. Never use `--no-verify` or `--amend` — the hooks are the project's quality gates. If you cannot fix it in two attempts, stop and show the error.

## 4. Push

```bash
git push -u origin HEAD
```

If the push is rejected because the remote moved, run `git pull --rebase` once and push again. Never force-push.

## 5. Pull request

If a PR for this branch already exists (`gh pr view --json url,state` succeeds and state is `OPEN`), the push already updated it — skip to step 6.

Otherwise create one against `main`:

```bash
gh pr create --base main --title "<title>" --body-file - <<'EOF'
## Co

- <what changed, one bullet per logical change>

## Uwagi

- <anything the reviewer should know; drop the section if there is nothing>
EOF
```

- Title: the commit subject when there is one commit; otherwise a summary in the same `type(scope): …` style.
- Body in Polish, like the existing PRs.
- No "🤖 Generated with Claude Code" line or any AI attribution.

Show the PR URL.

## 6. Turn on auto-merge

```bash
gh pr merge --auto --merge
```

No question: auto-merge is the user's standing choice, and the ruleset on `main` (`.github/rulesets/main.json`) lets the merge happen only after `ci` and `smoke` are green. A red check leaves the PR open; the SessionStart hook (`.claude/hooks/pr-status.mjs`) and the status line report it, and step 0 of the next `/ship` lists it.

- Skip this step when the user said in the request that they will merge themselves.
- If `gh` rejects `--auto` (auto-merge disabled, PR not mergeable), do not work around it: report the error and leave the PR open. Never use `--admin` or any other bypass, and do not wait for CI instead.
- No `--delete-branch`: GitHub deletes the remote branch after the merge (repo setting), and step 0 of a later `/ship` deletes the local one.

The repo uses merge commits (`Merge pull request #…`) and the ruleset allows only those, hence `--merge`.

## 7. Back to main

```bash
git switch main
```

No `git pull` here — the merge has not happened yet; step 0 of the next `/ship` pulls it in.

## Final report

Two to four short lines, in Polish: commit subject(s) with short SHA, branch, PR URL, and the merge state — "auto-merge włączony: GitHub zmerguje po zielonych `ci` i `smoke`; czerwony check zostawi PR otwarty" (or why auto-merge was not turned on). Add the PRs flagged in step 0 and any branch `git branch -d` refused. Mention any file you left out on purpose.
