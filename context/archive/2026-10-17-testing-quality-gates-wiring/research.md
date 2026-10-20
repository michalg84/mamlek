---
date: 2026-10-20T11:11:52+02:00
researcher: michalg84 (z Claude Code)
git_commit: 2fe72a37c4b5ee487c8ca389c6b07d5e4243925a
branch: main
repository: mamlek
topic: "Faza 4 wdrażania testów: co trzeba zrobić, żeby zestawy z Faz 1–3 były wymaganymi bramkami lokalnie i w CI, oraz jak dodać hook po edycji"
tags: [research, testing, quality-gates, ci, hooks, vitest, github-actions]
status: complete
last_updated: 2026-10-20
last_updated_by: michalg84 (z Claude Code)
---

# Research: Faza 4 wdrażania testów — podpięcie bramek jakości

**Date**: 2026-10-20T11:11:52+02:00
**Researcher**: michalg84 (z Claude Code)
**Git Commit**: 2fe72a37c4b5ee487c8ca389c6b07d5e4243925a (zmiana statusu w `test-plan.md` §3 i folder zmiany niescommitowane)
**Branch**: main
**Repository**: mamlek

## Research Question

Faza 4 z `context/foundation/test-plan.md:77`: uczynić zestawy z Faz 1–3 wymaganymi lokalnie i w CI oraz dodać hook po edycji. Bramki do podpięcia (`test-plan.md:130-132`):

- **unit + component** — `local + CI`, `required after §3 Phase 4` (ryzyka #1, #2, #3, #5);
- **kit access and input integration** — `CI on PR`, `required after §3 Phase 4` (#4, #6);
- **post-edit hook** — `local (agent loop)`, `recommended after §3 Phase 4`.

Kryterium z `change.md:14`: bramka liczy się tylko wtedy, gdy celowo zepsuty test naprawdę ją blokuje (czerwony check w CI albo sygnał hooka, który dociera do agenta), a nie wtedy, gdy krok się po prostu uruchamia.

Pytania: co dziś uruchamia każdy zestaw i gdzie; co w tym projekcie może znaczyć „wymagana”; co robią obecne hooki agenta i czego im brakuje; ile to kosztuje czasu; co musi rozstrzygnąć plan.

## Summary

1. **Unit + component nie uruchamia dziś żadna bramka.** Brak kroku Vitest w jobie `ci` (`.github/workflows/ci.yml:18-26`). Nie ma go też w pre-commicie (`.husky/pre-commit` → `npx lint-staged`, w `package.json` w bloku `lint-staged` tylko ESLint, `ui-scan` i Prettier), w hooku Stop (`.claude/hooks/end-of-turn.mjs:6` — świadomie odłożone do Fazy 4) ani w skillu `/ci-check` (`.claude/skills/ci-check/SKILL.md:6-11`). Lokalny przebieg `npx vitest run --project unit --project component` (2026-10-20): **exit 0, 4 pliki, 116 testów, ok. 23 s** (75% to przygotowanie środowiska jsdom). Żaden z czterech plików testów ani komponentów, które importują, nie używa `astro:*`, `import.meta.env` ani `process.env`. Na Linuksie w CI nie widać więc przeszkód. Git Bash jest potrzebny tylko projektowi `hooks`, który zostaje lokalny (`test-plan.md:80`).
2. **`test:db` i `test:api` już działają i już dają czerwony check.** Oba są w jobie `smoke` (`ci.yml:55`, `ci.yml:69`), a job działa tylko na PR (`ci.yml:31`). Faza 4 nie dopisuje ich do CI (`test-plan.md:82`).
3. **GitHub nie pozwala tu wymusić checków.** Repo jest prywatne (`gh repo view`: `"isPrivate":true`). Dla `branches/main/protection` i `rulesets` API zwraca w obu przypadkach HTTP 403 „Upgrade to GitHub Pro or make this repository public to enable this feature” (sprawdzone 2026-10-20). Nie da się więc ustawić „required status checks” ani zablokować przycisku merge. Dziś bramka „wymagana” to czerwony check plus proces. Proces jest dziurawy z dwóch powodów:
   - skill `ship` oferuje „Zmerguj teraz — bez czekania na CI” (`.claude/skills/ship/SKILL.md:143`);
   - autor sam czasem merguje PR przed końcem CI (pamięć `project-gotchas.md:18`).

   Żaden dokument w repo nie zapisał tego ograniczenia. To główna decyzja dla planu (zob. Open Questions, punkt 1).

4. **Deploy zależy tylko od joba `ci`** (`ci.yml:74-75`). Krok Vitest dodany do `ci` zablokuje więc także wdrożenie po pushu na `main`. Kontrole z `smoke` wdrożenia nie blokują, bo przy pushu job jest pomijany (decyzja z PR #20, commit 14f2dfb; `README.md:107`).
5. **Do agenta nie dociera dziś żaden sygnał błędu po edycji.**
   - `format.mjs` (PostToolUse `Write|Edit`) uruchamia tylko Prettier na edytowanym pliku. Przy błędzie kończy się kodem 1 (`format.mjs:3`, `:49-58`), a kod 1 w Claude Code widzi tylko użytkownik jako „hook error”, agent nie dostaje nic (`.claude/skills/10x-configure-hook/references/anthropic.md:52-60`, zweryfikowane 2026-09-25).
   - ESLint działa tylko w hooku Stop, a testów nie uruchamia żaden hook.
6. **Testy mieszczą się w budżecie hooka Stop.** Budżet wynosi 100 s (`end-of-turn.mjs:17-20`), a limit w ustawieniach 120 s (`.claude/settings.json:22`). `astro check` zajął lokalnie 11 s (exit 0, 2026-10-20, cache rozgrzany), unit + component ok. 23 s. ESLint na zmienionych plikach nie był mierzony osobno. Skill `10x-configure-hook` zaleca cały zestaw unit na końcu tury, gdy trwa ok. 30 s lub krócej (`SKILL.md:68`, `:118`).
7. **`vitest related` przy edycji pliku w `src/lib` kosztowałby prawie tyle co cały zestaw.** To wniosek z grafu importów, nie pomiar:
   - `registry-search.ts` ciągnie za sobą test unit i dwa testy komponentów, `medicine-check-verdict.ts` swój test unit i jeden komponentowy;
   - testy komponentów działają w jsdom, które zajmuje 75% czasu przebiegu.

   Skill dopuszcza testy po edycji tylko wtedy, gdy kończą się w kilka sekund (`SKILL.md:78`). Dla hooka po edycji pewny jest więc ESLint `--quiet` edytowanego pliku z kodem wyjścia 2 i komunikatem na stderr. Testy pasują raczej do hooka Stop.

## Detailed Findings

### Bramka unit + component (`local + CI`)

- **Gdzie zestaw dziś działa:** tylko ręcznie (`npm test`, `package.json`: `"test": "vitest run"`). Ten skrypt uruchamia też projekt `hooks` (`vitest.config.ts:27-35`), który wymaga Git Bash na Windows i zajmuje ok. 17 z 18 s całego przebiegu (`test-plan.md:80`).
- **Polecenie dla CI ustalone wcześniej:** `npx vitest run --project unit --project component` (`test-plan.md:80`; decyzja F2 z przeglądu Fazy 2, `context/archive/2026-10-13-testing-result-state-and-search/reviews/impl-review.md:45-62`).
- **Projekty** (`vitest.config.ts:11-36`):
  - `unit`: `src/**/*.test.ts`, środowisko node;
  - `component`: `src/**/*.test.tsx`, jsdom, setup `tests/setup-component.ts`;
  - `hooks`: `tests/hooks/**/*.test.ts`, node, `testTimeout` 30 s.
- **Pliki testów objęte bramką (4):**
  - `src/lib/medicine-check-verdict.test.ts` (#1, #2);
  - `src/lib/registry-search.test.ts` (#5);
  - `src/components/registry/MedicineCheckResult.test.tsx` (#2);
  - `src/components/registry/RegistrySearch.test.tsx` (#3).
- **Reporter w CI:** Vitest 5 sam dodaje reporter `github-actions`, gdy `GITHUB_ACTIONS=true` (`node_modules/vitest/dist/chunks/defaults.B1FCaFfh.js:67`). Błędy pokażą się wtedy jako adnotacje w PR, bez dodatkowej konfiguracji.
- **Brakujące lokalne miejsca** (każde to osobny wybór dla planu):
  - **hook Stop:** komentarz `end-of-turn.mjs:6` zapowiada testy w Fazie 4;
  - **pre-commit:** `lint-staged` dziś bez testów; zasada kursu „pre-commit = lint + testy na plikach w stage” jest w `CLAUDE.md`, w tabeli momentów;
  - **`/ci-check`:** `CLAUDE.md` każe uruchamiać go przed uznaniem pracy za skończoną, a skill „mirrors the CI `ci` job”, więc po dodaniu kroku do CI rozjedzie się z nim, jeśli nie zostanie uzupełniony.
- **Dokumenty, które dziś mówią „nie w CI”** (do aktualizacji po wdrożeniu):
  - `AGENTS.md:37` („not run in CI yet (planned with test-plan §3 Phase 4)”) i `AGENTS.md:46`;
  - `README.md:81-84` (opis jobów CI bez Vitest);
  - `test-plan.md:130-132` (statusy bramek).

### Bramka kit access and input integration (`CI on PR`)

- **Kroki w jobie `smoke`:**
  - `npm run test:db` po imporcie fixture'ów (`ci.yml:47-55`);
  - `npm run test:api` po `npm run smoke` na `npm run preview` (`ci.yml:62-69`).

  Oba kroki działają bez `continue-on-error`, więc błąd daje czerwony check `smoke` w PR.

- **Dowody z Fazy 3, że zepsucie wywraca zestawy:** sprawdzenia mutacyjne, m.in. `select using (true)`, `grant … to anon` i usunięcie `.strict()` (`test-plan.md:222`). Na poziomie CI nie było osobnego dowodu „czerwony check w PR”. Lokalne wywrócenie testu pokazano, ale nie jako czerwony PR.
- **Co jeszcze zostaje do zrobienia:** wymuszenie przez GitHub jest niedostępne (Summary, punkt 3), więc sama zmiana statusu w §5 niczego nie wymusza. Plan Fazy 3 przypisał „branch protection, hooki agenta” Fazie 4 (`context/archive/2026-10-17-testing-kit-access-and-input-boundaries/plan.md:64`), nie wiedząc o tym ograniczeniu.

### Co znaczy „wymagana” w tym repo

- **Definicja z test-planu:** „bramka jest wymuszana od chwili wdrożenia tej fazy” (`test-plan.md:120-122`). Bramki `required (wired)` (lint, type check, `ui:scan`, build, kontrole bazy, smoke, `test-plan.md:126-129`) są dziś „wymagane” w tym samym ograniczonym sensie: czerwony check, którego nic nie egzekwuje.
- **Ścieżka do `main`:**
  - kod trafia na `main` przez PR (`README.md:107`); nic technicznie nie zabrania pushu wprost na `main`;
  - po pushu działa tylko `ci`, potem `deploy` (`ci.yml:74-75`), a `smoke` jest pomijany (`ci.yml:31`);
  - ostatni zmergowany PR miał checki `ci SUCCESS`, `smoke SUCCESS` (`gh pr list --state merged --limit 1`, 2026-10-20).
- **Egzekwowanie procesem:** skill `ship` w opcji „Poczekaj na CI i zmerguj” uruchamia `gh pr checks --watch --fail-fast` i nie merguje przy czerwonym checku (`ship/SKILL.md:153-158`). Opcja 1 „Zmerguj teraz” i merge ręczny omijają CI (`:143`, `:159`).
- **Możliwości, które da się sprawdzić** (wybór należy do autora):
  - **(a)** repo publiczne: wtedy branch protection i rulesets są dostępne na darmowym planie. Wiąże się z otwartym pytaniem o adres e-mail w commitach (pamięć `open-question-commit-email.md`) i z wykluczeniem w `test-plan.md:234` („Ocenić ponownie, jeśli repozytorium stanie się publiczne”).
  - **(b)** GitHub Pro (płatny).
  - **(c)** zostać przy czerwonym checku plus proces: np. `ship` bez opcji „Zmerguj teraz” albo z ostrzeżeniem, a do tego zapis w §5, że „required” znaczy „czerwony check blokuje merge przez `ship` i blokuje deploy”, nie „GitHub blokuje przycisk”.

### Hook po edycji (`local (agent loop)`, rekomendowany)

- **`format.mjs`** (`.claude/settings.json:3-14`, limit 30 s):
  - czyta `tool_input.file_path` z danych wejściowych hooka (`format.mjs:13-25`) i pomija pliki innych repozytoriów (`:35-39`);
  - uruchamia tylko `prettier --write` (`:53-57`); kod 1 przy błędzie nie dociera do agenta (`:3`);
  - rejestruje checkout w `$TMPDIR/claude-hooks/<sid>.roots`, z którego korzysta `end-of-turn.mjs` (`:41-46`).
- **`end-of-turn.mjs`** (Stop, limit 120 s):
  - przy `stop_hook_active` / `loop_count` przepuszcza turę (jedna ponowna próba, `:33`);
  - zmienione pliki bierze z `git diff --name-only -z HEAD` i `git ls-files -o` (`:79-80`);
  - uruchamia ESLint `--quiet`, `ui-scan` i `astro check` (`:87-103`);
  - przy błędzie wypisuje komunikat na stderr i kończy się kodem 2 (`:106-109`).
- **Dowód hooków** (`tests/hooks/agent-hooks.test.ts`):
  - tymczasowe repozytoria git z zaślepkami narzędzi; ok. 17 przypadków Stop (`:157-327`) i ok. 8 przypadków `format.mjs` (`:329-389`);
  - polecenia z `settings.json` uruchamiane przez `bash.exe` (`:391-420`), z kontrolą, że limit czasu jest ≤ 120 (sekundy);
  - brak przypadku „Prettier zwraca błąd”, sprawdzany jest tylko brak Prettiera.
- **Zalecenia skilla `10x-configure-hook`** (referencja z 2026-09-25):
  - po edycji sprawdzać tylko edytowany plik (`SKILL.md:30`, `:117`), `eslint --quiet "$FILE"` bez `--fix`, żeby kolejny Edit agenta nie trafił na „file modified since read” (`anthropic.md:90`);
  - sygnał przez stderr z kodem 2 (`anthropic.md:52-62`);
  - limit czasu w sekundach, sugerowane 30 dla lintu (`SKILL.md:121`);
  - każdy hook udowodniony celowym zepsuciem w zatwierdzonym `agent-hooks.test.*` (`SKILL.md:129-150`).
- **Brak zapisanej decyzji o odłożeniu lintu po edycji:** commit f4840b3 dodał hooki poza planem (`impl-review.md:80` Fazy 2) i nie ma artefaktu `/10x-configure-hook`. `CLAUDE.md` (blok M3L3): „Start with one per-edit lint hook and one end-of-turn typecheck”, a jest tylko ten drugi.
- **Edycje przez Bash omijają hook po edycji.** Siatką na nie jest Stop (`git diff`). Dziś łapie je tylko dla lintu, `ui:scan` i `astro check`, nie dla testów.

## Code References

- `.github/workflows/ci.yml:10-26` — job `ci` bez Vitest
- `.github/workflows/ci.yml:30-71` — job `smoke` (tylko PR), w nim `test:db` (`:55`) i `test:api` (`:69`)
- `.github/workflows/ci.yml:73-75` — `deploy` zależy tylko od `ci`
- `.claude/settings.json:3-27` — PostToolUse `format.mjs` (30 s) i Stop `end-of-turn.mjs` (120 s)
- `.claude/hooks/format.mjs:3`, `:49-58` — tylko Prettier, kod 1 przy błędzie
- `.claude/hooks/end-of-turn.mjs:6` — testy odłożone do Fazy 4
- `.claude/hooks/end-of-turn.mjs:17-20` — budżet 100 s
- `.claude/hooks/end-of-turn.mjs:33`, `:79-112` — jedna ponowna próba, zmienione pliki, kontrole, kod 2
- `tests/hooks/agent-hooks.test.ts:157-420` — dowód hooków
- `vitest.config.ts:11-36` — projekty `unit`, `component`, `hooks`
- `.husky/pre-commit`, `package.json` (blok `lint-staged`) — pre-commit bez testów
- `.claude/skills/ci-check/SKILL.md:6-11` — `/ci-check` bez Vitest
- `.claude/skills/ship/SKILL.md:143-159` — opcje merge, w tym bez czekania na CI
- `.claude/skills/10x-configure-hook/SKILL.md:30`, `:68`, `:78`, `:117-150`; `references/anthropic.md:52-68`, `:90` — zasady hooków
- `context/foundation/test-plan.md:80`, `:82`, `:120-133` — uwagi dla Fazy 4 i tabela bramek
- `AGENTS.md:37`, `:46`; `README.md:77`, `:81-84`, `:107` — opisy do aktualizacji

## Architecture Insights

- Warstwy bramek w tym repo: PostToolUse (format) → Stop (lint, `ui:scan`, typy) → pre-commit (`lint-staged`) → CI `ci` (blokuje deploy) → CI `smoke` (tylko PR, nie blokuje deploy). Faza 4 dokłada testy do warstw, które ich nie mają. Nie potrzeba nowej infrastruktury: Vitest, husky i hooki już są.
- Hooki to skrypty Node, a nie bash, bo na tym hoście nie ma `jq` (`end-of-turn.mjs:5`). Nowy hook po edycji powinien trzymać się tego wzorca i mieć przypadki w `tests/hooks/agent-hooks.test.ts`.
- „Wymagana” jest dziś pojęciem procesowym, nie technicznym (repo prywatne, plan darmowy). Każda zmiana statusu w §5 powinna to nazwać, żeby kolejna faza (Faza 5, `test-plan.md:133`) nie zakładała branch protection.

## Historical Context (from prior changes)

- `context/archive/2026-10-10-testing-check-verdict-correctness/plan.md:48`, `:497`, `:503` — `npm test` w `ci` należy do Fazy 4; do tego czasu regresja werdyktu nie blokuje wdrożenia (zgodne ze stanem obecnym)
- `context/archive/2026-10-10-testing-check-verdict-correctness/reviews/impl-review.md:50-51` — „Wire `npm test` into the `ci` job in rollout Phase 4”; po decyzji F2 z Fazy 2 obowiązuje zawężenie do `--project unit --project component`
- `context/archive/2026-10-13-testing-result-state-and-search/reviews/impl-review.md:45-62` — F2: `hooks` zostaje lokalny (wciąż obowiązuje, `test-plan.md:80`)
- `context/archive/2026-10-13-testing-result-state-and-search/reviews/impl-review.md:74-82`, `:115-122` — poprawki hooków F4/F8 (commit 49732ca)
- `context/archive/2026-10-17-testing-kit-access-and-input-boundaries/plan.md:64` — „branch protection, hooki agenta” to Faza 4. Wymuszenie przez branch protection jest dziś niemożliwe (Summary, punkt 3); część o hookach aktualna.
- Commit 14f2dfb (PR #20) — `smoke` tylko na PR, deploy bez drugiego przebiegu (wciąż obowiązuje)
- `context/foundation/infrastructure.md:73` — repo prywatne (limit 2000 minut Actions). Dodatkowy koszt CI: krok Vitest ok. 23 s lokalnie w `ci`, który działa przy każdym PR i pushu na `main`.

## Related Research

- `context/archive/2026-10-17-testing-kit-access-and-input-boundaries/research.md` — konfiguracja joba `smoke` dla `test:db`/`test:api`
- `context/archive/2026-10-13-testing-result-state-and-search/research.md:158` — zapowiedź podpięcia `npm test` do `ci`

## Open Questions

Decyzje dla `/10x-plan` (autor):

1. **Jak rozumieć „wymagana” bez branch protection?**
   - (a) upublicznić repo (powiązane z pytaniem o e-mail w commitach i z `test-plan.md:234`);
   - (b) GitHub Pro;
   - (c) czerwony check plus proces: `ship` bez opcji „Zmerguj teraz” albo z ostrzeżeniem przy czerwonym lub niedokończonym CI, plus zapis definicji w §5.

   Od wyboru zależy, czy plan zawiera konfigurację rulesetu.

2. **Gdzie lokalnie działa unit + component?**
   - Stop: cały zestaw ok. 23 s plus `astro check` 11 s, mieści się w 100 s; tylko gdy zmieniły się pliki, które mogą wpływać na testy.
   - Pre-commit: wydłuża każdy commit o ok. 23 s; zasady kursu (`CLAUDE.md`) mówią „recommend pre-commit/pre-push gates, let the user decide”.
   - `/ci-check`: żeby dalej odzwierciedlał job `ci`.
3. **Zakres hooka po edycji:** sam ESLint `--quiet` edytowanego pliku z kodem 2, czy też `vitest related`? Wniosek z grafu importów: koszt `related` dla `src/lib` jest zbliżony do całego zestawu, ok. 20 s (Summary, punkt 7). Pomiar `vitest related` nie był robiony — warto go zrobić w planie, zanim zapadnie decyzja.
4. **Czy `format.mjs` ma zgłaszać agentowi błąd parsowania Prettiera** (kod 2 zamiast 1)? Dziś agent go nie widzi.
5. **Dowód „czerwonego checka”:** czy plan zakłada celowo zepsuty test na gałęzi PR (czerwony `ci` i `smoke` w GitHub), a potem cofnięcie? Takiego dowodu wymaga `change.md:14`.
