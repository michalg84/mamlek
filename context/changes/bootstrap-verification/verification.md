---
bootstrapped_at: 2026-09-24T19:43:43Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: mamlek
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

Source: `context/foundation/tech-stack.md`

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: mamlek
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: true
```

### Why this stack

MamLek to mobilna aplikacja webowa dla jednego gospodarstwa domowego, budowana solo po godzinach w 3 tygodnie przy małej skali, dlatego wybór padł na polecany starter dla aplikacji webowej w TypeScripcie: Astro, React, Supabase i Cloudflare. Przechodzi on wszystkie cztery kryteria przyjazności dla agenta AI i od razu daje Postgresa oraz logowanie na konto domu (FR-013). Autor jest doświadczonym programistą backendu w Javie; rozważał Spring Boot i świadomie wybrał TypeScript mimo słabszej bazy w tym języku, więc kod generowany przez agenta wymaga uważniejszego przeglądu. Jedyna funkcja, której starter nie zapewnia od razu, to zadanie w tle: okresowe odświeżanie pełnego Rejestru Produktów Leczniczych (około 70 MB, FR-001, dane nie starsze niż 7 dni) nie mieści się w limitach pamięci i czasu procesora Cloudflare, więc trafia do codziennego zadania cyklicznego w GitHub Actions, które wgrywa rejestr do tabeli tymczasowej i podmienia ją w jednej transakcji. Aplikacja jest wdrażana na Cloudflare Pages, a CI w GitHub Actions wdraża ją automatycznie po merge'u do main. Logika wyszukiwania i porównywania substancji czynnych powinna żyć w warstwie serwisów i endpointach API, a nie w kodzie renderującym strony, żeby po MVP zostawić otwartą drogę na Androida.

## Pre-scaffold verification

| Signal      | Value                                                     | Severity | Notes                                                                      |
| ----------- | --------------------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| npm package | not run                                                   | n/a      | `cmd_template` starts with `git clone`; no `create-*` CLI                  |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-09-12 | fresh    | from card.docs_url (`gh api repos/.../pushed_at` → `2026-09-12T21:16:08Z`) |

Local toolchain at run time (informational): node v24.19.0, npm 11.17.0, git 2.45.1.windows.1.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 49 project files moved into place, plus `node_modules/` (30,680 files) moved as a directory. 51 project files in the scaffold in total: 49 moved, 1 sidelined (`CLAUDE.md`), 1 append-merged (`.gitignore`).
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold`
**Resolved (2026-09-24)**: the starter's rules from `CLAUDE.md.scaffold` were merged into `CLAUDE.md` and the sibling was removed. The project rules were later moved into the tracked `AGENTS.md`; the gitignored `CLAUDE.md` imports them via `@AGENTS.md`.
**.gitignore handling**: append-merged (cwd lines kept; scaffold lines appended under a `# from 10x-astro-starter` separator; no non-blank lines were duplicates)
**.bootstrap-scaffold cleanup**: left in place. Every project file was moved out; only `.bootstrap-scaffold/.git/` (the upstream starter's history) remains. It was never moved into cwd, so the project's own `.git/` is untouched. Both attempts to delete it were blocked by the local tool-permission policy (the second came after the user approved deletion). Delete it manually: `rm -rf .bootstrap-scaffold` (Git Bash) or `Remove-Item -Recurse -Force .bootstrap-scaffold` (PowerShell).
**Resolved (2026-09-24)**: `.bootstrap-scaffold/` was deleted manually after the run; it is no longer present in cwd.

**Order deviation**: the git-clone strategy deletes `.bootstrap-scaffold/.git/` before the move-up. The deletion was blocked, so `.git/` was left out of the move-up instead. The files that ended up in cwd are the same.

**Top-level move log**:

- `.gitignore`: append-merged
- `CLAUDE.md` → `CLAUDE.md.scaffold` (existing wins)
- moved: `.env.example`, `.github/`, `.husky/`, `.nvmrc`, `.prettierrc.json`, `.vscode/`, `AGENTS.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules/`, `package.json`, `package-lock.json`, `public/`, `README.md`, `scripts/`, `src/`, `supabase/`, `tsconfig.json`, `wrangler.jsonc`
- `context/**`: none shipped by the scaffold, so nothing dropped

**Scaffold project files (51, excluding `node_modules/` and `.git/`)**:

```
.env.example
.github/workflows/ci.yml
.gitignore
.husky/pre-commit
.nvmrc
.prettierrc.json
.vscode/extensions.json
.vscode/launch.json
.vscode/settings.json
AGENTS.md
astro.config.mjs
CLAUDE.md
components.json
eslint.config.js
package.json
package-lock.json
public/.assetsignore
public/favicon.png
public/template.png
README.md
scripts/smoke.mjs
src/components/auth/FormField.tsx
src/components/auth/PasswordToggle.tsx
src/components/auth/ServerError.tsx
src/components/auth/SignInForm.tsx
src/components/auth/SignUpForm.tsx
src/components/auth/SubmitButton.tsx
src/components/Banner.astro
src/components/Topbar.astro
src/components/ui/button.tsx
src/components/ui/LibBadge.astro
src/components/Welcome.astro
src/env.d.ts
src/layouts/Layout.astro
src/lib/config-status.ts
src/lib/supabase.ts
src/lib/utils.ts
src/middleware.ts
src/pages/api/auth/signin.ts
src/pages/api/auth/signout.ts
src/pages/api/auth/signup.ts
src/pages/auth/confirm-email.astro
src/pages/auth/signin.astro
src/pages/auth/signup.astro
src/pages/dashboard.astro
src/pages/index.astro
src/styles/global.css
supabase/.gitignore
supabase/config.toml
tsconfig.json
wrangler.jsonc
```

**Install output (tail)**:

```
added 648 packages, and audited 649 packages in 34s
232 packages are looking for funding
found 0 vulnerabilities
```

**Install warnings (stderr)**:

```
npm warn allow-scripts 3 packages have install scripts not yet covered by allowScripts:
npm warn allow-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn allow-scripts   workerd@1.20260911.1 (postinstall: node install.js)
npm warn allow-scripts   esbuild@0.28.1 (postinstall: node install.js)
npm warn allow-scripts Run `npm approve-scripts --allow-scripts-pending` to review, or `npm approve-scripts <pkg>` to allow.
```

These postinstall scripts did not run. If `astro dev` / `astro build` or `wrangler` fails with a missing-binary error, review and approve them with `npm approve-scripts esbuild workerd` and reinstall.
**Resolved (2026-09-24)**: no action needed — `npm run build`, `npm run dev` and the auth smoke test all run locally, and CI (`npm ci`, build, smoke) passes.

**Toolchain note**: `.nvmrc` pins node `22.14.0`, but local node is `v24.19.0`. The install succeeded. Switch to Node 22 if you want parity with CI.
**Resolved (2026-09-24)**: local node switched to `v22.14.0`, matching `.nvmrc`.

## Post-scaffold audit

**Tool**: `npm audit --json` (exit code 0)
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW (0 INFO)
**Direct vs transitive**: 0/0/0/0 direct of total 0/0/0/0 (direct deps per `package.json`: 20 dependencies + 18 devDependencies; audited tree: 804 dependencies (377 prod, 269 dev, 167 optional))

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

None.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | false                |
| has_background_jobs     | true                 |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- ~~Delete the leftover `.bootstrap-scaffold/` directory (it holds only the upstream starter's `.git/`). Do this before `git add .`, or git will record it as an embedded repository.~~ Done — deleted before the first commit.
- ~~The repo already has its own git history (no `git init` needed). Review `git status` before committing, and check that `.env` and `node_modules/` are ignored (they are, via the merged `.gitignore`).~~ Done — scaffold committed as `e127c0e`; `.env`, `.dev.vars`, `node_modules/`, `dist/` confirmed ignored.
- ~~Review `CLAUDE.md.scaffold` against your existing `CLAUDE.md` and decide what to keep. Note that your `.gitignore` ignores `CLAUDE.md` but not `CLAUDE.md.scaffold`.~~ Done — merged and removed; project rules now live in the tracked `AGENTS.md`.
- ~~Address audit findings per your project's risk tolerance. There are none at bootstrap time.~~ Nothing to address — `npm audit` re-run after the scaffold still reports 0 findings.

Follow-ups applied after the run (2026-09-24), outside the scaffold itself:

- Added `.gitattributes` (`* text=auto eol=lf`) and normalized line endings. `core.autocrlf=true` had produced CRLF files, and lint failed with 1,086 prettier errors.
- Pointed the CI workflow at `main` instead of `master`.
- Enabled the husky pre-commit hook (`prepare: husky`; the hook still runs `npx lint-staged`).
- Started local Supabase and filled `.env` / `.dev.vars` with the local URL and anon key. The auth smoke test passes 8/8.
- Renamed the project from `10x-astro-starter` to `mamlek` in `package.json`, `package-lock.json`, `wrangler.jsonc` and the Supabase `project_id`.
- Bumped CI actions to Node 24-based majors (`checkout` v7, `setup-node` v7, `supabase/setup-cli` v3). CI is green.
