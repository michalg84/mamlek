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

Źródło: `context/foundation/tech-stack.md`

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

| Sygnał      | Wartość                                                     | Waga   | Uwagi                                                                   |
| ----------- | ----------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| pakiet npm  | nie uruchomiono                                             | n/d    | `cmd_template` zaczyna się od `git clone`; brak CLI `create-*`          |
| repo GitHub | przeprogramowani/10x-astro-starter, ostatni push 2026-09-12 | świeże | z card.docs_url (`gh api repos/.../pushed_at` → `2026-09-12T21:16:08Z`) |

Lokalne narzędzia w chwili uruchomienia (informacyjnie): node v24.19.0, npm 11.17.0, git 2.45.1.windows.1.

## Scaffold log

**Wykonane polecenie**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategia**: git-clone
**Kod wyjścia**: 0
**Przeniesione pliki**: 49 plików projektu przeniesionych na miejsce plus `node_modules/` (30 680 plików) przeniesione jako katalog. W szkielecie było łącznie 51 plików projektu: 49 przeniesionych, 1 odłożony obok (`CLAUDE.md`), 1 scalony przez dopisanie (`.gitignore`).
**Konflikty (pliki obok z sufiksem .scaffold)**: `CLAUDE.md.scaffold`
**Rozwiązane (2026-09-24)**: reguły startera z `CLAUDE.md.scaffold` zostały scalone z `CLAUDE.md`, a plik obok usunięty. Reguły projektu przeniesiono później do śledzonego `AGENTS.md`; ignorowany przez git `CLAUDE.md` importuje je przez `@AGENTS.md`.
**Obsługa .gitignore**: scalony przez dopisanie (linie z cwd zachowane; linie szkieletu dopisane pod separatorem `# from 10x-astro-starter`; żadna niepusta linia nie była duplikatem)
**Sprzątanie .bootstrap-scaffold**: zostawiony na miejscu. Wszystkie pliki projektu zostały przeniesione; został tylko `.bootstrap-scaffold/.git/` (historia startera). Nigdy nie trafił do cwd, więc własny `.git/` projektu jest nietknięty. Obie próby usunięcia zablokowała lokalna polityka uprawnień narzędzi (druga po tym, jak użytkownik zgodził się na usunięcie). Usuń ręcznie: `rm -rf .bootstrap-scaffold` (Git Bash) albo `Remove-Item -Recurse -Force .bootstrap-scaffold` (PowerShell).
**Rozwiązane (2026-09-24)**: `.bootstrap-scaffold/` usunięty ręcznie po przebiegu; nie ma go już w cwd.

**Odstępstwo od kolejności**: strategia git-clone usuwa `.bootstrap-scaffold/.git/` przed przeniesieniem plików w górę. Usunięcie zostało zablokowane, więc zamiast tego `.git/` pominięto przy przenoszeniu. Pliki, które trafiły do cwd, są takie same.

**Dziennik przenoszenia (najwyższy poziom)**:

- `.gitignore`: scalony przez dopisanie
- `CLAUDE.md` → `CLAUDE.md.scaffold` (wygrywa istniejący)
- przeniesione: `.env.example`, `.github/`, `.husky/`, `.nvmrc`, `.prettierrc.json`, `.vscode/`, `AGENTS.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules/`, `package.json`, `package-lock.json`, `public/`, `README.md`, `scripts/`, `src/`, `supabase/`, `tsconfig.json`, `wrangler.jsonc`
- `context/**`: szkielet nic nie dostarczył, więc nic nie pominięto

**Pliki projektu w szkielecie (51, bez `node_modules/` i `.git/`)**:

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

**Wynik instalacji (koniec)**:

```
added 648 packages, and audited 649 packages in 34s
232 packages are looking for funding
found 0 vulnerabilities
```

**Ostrzeżenia instalacji (stderr)**:

```
npm warn allow-scripts 3 packages have install scripts not yet covered by allowScripts:
npm warn allow-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn allow-scripts   workerd@1.20260911.1 (postinstall: node install.js)
npm warn allow-scripts   esbuild@0.28.1 (postinstall: node install.js)
npm warn allow-scripts Run `npm approve-scripts --allow-scripts-pending` to review, or `npm approve-scripts <pkg>` to allow.
```

Te skrypty postinstall się nie wykonały. Jeśli `astro dev` / `astro build` albo `wrangler` zgłosi brak pliku binarnego, przejrzyj je i zatwierdź przez `npm approve-scripts esbuild workerd`, a potem zainstaluj ponownie.
**Rozwiązane (2026-09-24)**: nic nie trzeba robić — `npm run build`, `npm run dev` i test smoke logowania działają lokalnie, a CI (`npm ci`, build, smoke) przechodzi.

**Uwaga o narzędziach**: `.nvmrc` przypina node `22.14.0`, a lokalny node to `v24.19.0`. Instalacja się powiodła. Przełącz się na Node 22, jeśli chcesz zgodności z CI.
**Rozwiązane (2026-09-24)**: lokalny node przełączony na `v22.14.0`, zgodnie z `.nvmrc`.

## Post-scaffold audit

**Narzędzie**: `npm audit --json` (kod wyjścia 0)
**Podsumowanie**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW (0 INFO)
**Bezpośrednie a przechodnie**: 0/0/0/0 bezpośrednich z łącznie 0/0/0/0 (bezpośrednie zależności według `package.json`: 20 dependencies + 18 devDependencies; sprawdzone drzewo: 804 zależności (377 prod, 269 dev, 167 optional))

#### CRITICAL findings

Brak.

#### HIGH findings

Brak.

#### MODERATE findings

Brak.

#### LOW / INFO findings

Brak.

## Hints recorded but not acted on

| Wskazówka               | Wartość              |
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

Dalej: przyszły skill przygotuje kontekst dla agenta (CLAUDE.md, AGENTS.md). Na razie projekt ma szkielet i jest zweryfikowany — miłego kodowania.

Przydatne ręczne kroki w międzyczasie:

- ~~Usuń pozostały katalog `.bootstrap-scaffold/` (zawiera tylko `.git/` startera). Zrób to przed `git add .`, inaczej git zapisze go jako osadzone repozytorium.~~ Zrobione — usunięty przed pierwszym commitem.
- ~~Repo ma już własną historię git (`git init` niepotrzebny). Przejrzyj `git status` przed commitem i sprawdź, czy `.env` i `node_modules/` są ignorowane (są, przez scalony `.gitignore`).~~ Zrobione — szkielet zacommitowany jako `e127c0e`; potwierdzone, że `.env`, `.dev.vars`, `node_modules/`, `dist/` są ignorowane.
- ~~Porównaj `CLAUDE.md.scaffold` z istniejącym `CLAUDE.md` i zdecyduj, co zostawić. Uwaga: `.gitignore` ignoruje `CLAUDE.md`, ale nie `CLAUDE.md.scaffold`.~~ Zrobione — scalony i usunięty; reguły projektu są teraz w śledzonym `AGENTS.md`.
- ~~Zajmij się wynikami audytu zgodnie z tolerancją ryzyka projektu. W chwili tworzenia szkieletu nie ma żadnych.~~ Nie ma czym się zajmować — `npm audit` powtórzony po utworzeniu szkieletu nadal zgłasza 0 wyników.

Poprawki po przebiegu (2026-09-24), poza samym szkieletem:

- Dodany `.gitattributes` (`* text=auto eol=lf`) i znormalizowane końce linii. `core.autocrlf=true` dało pliki z CRLF, a lint padał z 1086 błędami prettiera.
- Workflow CI skierowany na `main` zamiast `master`.
- Włączony hook pre-commit huskiego (`prepare: husky`; hook nadal uruchamia `npx lint-staged`).
- Uruchomiony lokalny Supabase, a `.env` / `.dev.vars` uzupełnione lokalnym URL-em i kluczem anon. Test smoke logowania przechodzi 8/8.
- Projekt przemianowany z `10x-astro-starter` na `mamlek` w `package.json`, `package-lock.json`, `wrangler.jsonc` i `project_id` Supabase.
- Akcje CI podbite do głównych wersji opartych na Node 24 (`checkout` v7, `setup-node` v7, `supabase/setup-cli` v3). CI jest zielone.
