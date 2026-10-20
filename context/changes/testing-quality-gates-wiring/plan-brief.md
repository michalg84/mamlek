# Faza 4 wdrażania testów — podpięcie bramek jakości: brief planu

> Full plan: `context/changes/testing-quality-gates-wiring/plan.md`
> Research: `context/changes/testing-quality-gates-wiring/research.md`

## What & Why

Zestawy testów z Faz 1–3 (werdykt, stan wyniku, wyszukiwanie, izolacja apteczki, walidacja wejścia) mają stać się bramkami, które naprawdę blokują — lokalnie, w CI i przy merge'u — a agent ma dostawać błędy lintu zaraz po edycji. Bramka liczy się tylko wtedy, gdy celowo zepsuty test daje czerwony check albo sygnał, który dociera do agenta (`change.md`).

## Starting Point

Testy unit + component nie działają dziś w żadnej bramce (ani CI, ani pre-commit, ani hook Stop, ani `/ci-check`). `test:db` i `test:api` dają czerwony check `smoke`, ale repo jest prywatne na darmowym planie, więc GitHub nie pozwala wymusić checków, a `ship` ma opcję „Zmerguj teraz”. Hook po edycji to sam Prettier, którego błąd agent nie widzi.

## Desired End State

PR z czerwonym testem ma czerwony check i GitHub odmawia merge'a; push wprost na `main` jest odrzucany; czerwony test unit/component blokuje też deploy. Agent widzi błędy ESLint edytowanego pliku od razu, a czerwone testy na końcu tury. Commit zmian źródłowych z czerwonym powiązanym testem jest odrzucany lokalnie.

## Key Decisions Made

| Decision                   | Choice                                                                       | Why (1 sentence)                                                     | Source        |
| -------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------- |
| Co znaczy „wymagana”       | Repo publiczne + ruleset na `main` (PR, checki `ci` i `smoke`, bez obejść)   | Jedyna darmowa droga do prawdziwej blokady merge'a.                  | Plan          |
| E-mail w commitach         | Noreply od teraz, historia bez przepisywania                                 | Bez force-pusha i zmiany SHA; gmail zostaje w starych commitach.     | Plan          |
| Pre-commit                 | `vitest related --run --passWithNoTests` w lint-staged                       | Łapie też edycje bez agenta za ok. 3 s.                              | Plan          |
| Hook po edycji             | Prettier, potem ESLint `--quiet` edytowanego pliku, kod 2                    | Zasada kursu „per edit = lint pliku”; testy zostają w Stop.          | Plan          |
| Testy w hooku Stop         | Cały zestaw unit + component (ok. 3 s)                                       | Łapie edycje przez Bash i zależności pośrednie taniej niż `related`. | Plan (pomiar) |
| Polecenie w CI             | `npx vitest run --project unit --project component`, projekt `hooks` lokalny | Ustalone w przeglądzie Fazy 2.                                       | Research      |
| `ship`                     | Bez „Zmerguj teraz”                                                          | Ruleset i tak odrzuci merge przy czerwonym lub niedokończonym CI.    | Plan          |
| Dowód                      | Osobny PR z zepsutym testem unit i `test:db`, potem zamknięty                | Dowodzi całego łańcucha aż po blokadę rulesetu.                      | Plan          |
| Skan przed upublicznieniem | `gitleaks` całej historii; prawdziwy sekret = rotacja                        | Historii nie przepisujemy, więc sekret trzeba unieważnić.            | Plan          |

## Scope

**In scope:**

- Krok Vitest w jobie `ci` i w `/ci-check`; `vitest related` w pre-commicie; testy w hooku Stop
- `format.mjs` → `post-edit.mjs` (Prettier + ESLint, kod 2) z dowodem w `agent-hooks.test.ts`
- E-mail noreply, skan sekretów, `.github/rulesets/main.json`, poprawka `ship`, dokumenty
- Upublicznienie (autor), ruleset i skanowanie sekretów (agent), PR-dowód, statusy w §5 test-planu

**Out of scope:**

- `git filter-repo`, GitHub Pro, pre-push, testy w hooku po edycji, projekt `hooks` w CI
- Keepalive harmonogramu importu (ryzyko 60 dni przyjęte), lista obejść w rulesecie, licencja

## Architecture / Approach

Warstwy po zmianie: PostToolUse (Prettier + ESLint pliku) → Stop (lint, `ui:scan`, `astro check`, unit + component) → pre-commit (lint-staged + `vitest related`) → CI `ci` (z Vitest; blokuje deploy) → CI `smoke` (`test:db`, `test:api`) → ruleset na `main` (wymaga `ci` i `smoke`, wymaga PR). Bez nowej infrastruktury: Vitest, husky, hooki i GitHub Actions już są.

## Phases at a Glance

| Phase                                | What it delivers                                                        | Key risk                                                  |
| ------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| 1. Unit + component w CI i lokalnie  | Krok w `ci` i `/ci-check`, pre-commit, Stop z dowodem                   | Zimny start Vitest wydłuża Stop (mieści się w 100 s)      |
| 2. Lint po edycji                    | `post-edit.mjs` z sygnałem do agenta                                    | ESLint z typami na zimno blisko limitu czasu (limit 60 s) |
| 3. Przygotowanie do upublicznienia   | Noreply, skan sekretów, plik rulesetu, `ship`, dokumenty; PR zmergowany | Skan znajdzie prawdziwy sekret → rotacja przed Phase 4    |
| 4. Upublicznienie i ruleset          | Repo publiczne (autor), ruleset aktywny, push protection                | Krok nieodwracalny — tylko po zielonym skanie             |
| 5. Dowód blokady i zamknięcie bramek | Czerwony PR zablokowany, §5/§6/§7 test-planu                            | Check wyjdzie zielony → defekt bramki do naprawy          |

**Prerequisites:** Docker (dla `gitleaks`), `gh` z uprawnieniami admina repo, lokalny Supabase do `test:db`/`test:api` nie jest potrzebny (działają w CI).
**Estimated effort:** ok. 2–3 sesje: Phase 1–2 jedna sesja, Phase 3 z PR jedna, Phase 4–5 krótka (głównie czekanie na CI).

## Open Risks & Assumptions

- Po upublicznieniu GitHub wyłącza zaplanowany import rejestru po 60 dniach bez commitów; sygnałem jest tylko data stanu na `/szukaj` (ryzyko przyjęte, zapis w §7).
- Prywatny gmail zostaje widoczny w 133 starych commitach (decyzja autora).
- Pola API rulesetu i `security_and_analysis` trzeba sprawdzić z dokumentacją GitHub w dniu wdrożenia.
- Bez obejść w rulesecie awaria CI (np. `supabase/setup-cli`) blokuje merge, dopóki autor nie wyłączy rulesetu na chwilę.

## Success Criteria (Summary)

- PR-dowód z zepsutymi testami ma czerwone `ci` i `smoke`, a GitHub odmawia merge'a.
- Agent dostaje błąd ESLint zaraz po edycji i czerwony test na końcu tury.
- §5 test-planu: obie bramki `required (wired)`, hook po edycji `recommended (wired)`.
