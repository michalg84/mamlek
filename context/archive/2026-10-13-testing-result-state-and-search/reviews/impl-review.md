<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Faza 2 wdrażania testów — stan wyniku i wyszukiwanie

- **Plan**: context/changes/testing-result-state-and-search/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-16
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 6 observations

Zakres diffu: `e0bd88c^..f779a9f`. Kod produkcyjny bez zmian (`git diff --stat -- src/ ':!*.test.ts' ':!*.test.tsx'` pusty). Commit `f4840b3` (hooki Claude Code) jest poza planem, uzgodniony z autorem jako osobny commit na tej gałęzi; przejrzany razem ze zmianą.

Bramki uruchomione w przeglądzie (osobno, po kolei): `npm test` 144/144 (17,6 s), `npm run lint` 0 błędów (23,7 s), `npx astro check` 0 błędów (15,5 s), brak „TBD — zob. §3 Faza 2” w `test-plan.md`. Czasy projektów: `unit` 1,5 s, `component` 4,8 s, `hooks` 17,1 s. Hooki: `format.mjs` 0,53 s na plik; `end-of-turn.mjs` 0,33 s (zmienione tylko `.md`) i 20,0 s (jeden zmieniony `.ts`).

Wszystkie wartości oczekiwane testu reguły zostały ponownie wyprowadzone ręcznie z `registry-search.ts` przez przegląd i się zgadzają. Kontrole ręczne 1.4, 3.4 i 4.3 potwierdził autor w sesji.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Ostrzeżenia act() Reacta są wyłączone w testach komponentu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/setup-component.ts:1-13
- **Detail**: Testing Library ustawia `IS_REACT_ACT_ENVIRONMENT = true` tylko w globalnym `beforeAll` (`node_modules/@testing-library/react/dist/index.js:41-46`), a Vitest działa bez `globals`. Flaga jest prawdziwa tylko wewnątrz `act()` Testing Library, więc React nigdy nie ostrzega o aktualizacjach stanu poza `act`. Czysty stderr testów niczego więc nie dowodzi. Znany przypadek: test dymny dostarcza odpowiedź workera poza `act` (`RegistrySearch.test.tsx:169-170`) i działa tylko dzięki odpytywaniu `findAllByRole`. Dotyczy też testu Fazy 1.
- **Fix**: Dodać `globalThis.IS_REACT_ACT_ENVIRONMENT = true;` w `tests/setup-component.ts`, uruchomić projekt `component` i poprawić to, co wyjdzie (co najmniej `:169-170` → `await act(async () => worker.deliverAll())` albo `openSearch()` + `search("ibuprom")`).
  - Strength: przywraca sygnał, który Testing Library daje domyślnie; ostrzeżenia o `act` zaczynają wykrywać aktualizacje poza kontrolą testu.
  - Tradeoff: mogą wyjść ostrzeżenia także w teście Fazy 1; poprawki to kilka linii w testach, bez kodu produkcyjnego.
  - Confidence: HIGH — zachowanie biblioteki potwierdzone w jej kodzie, brak `globals` w `vitest.config.ts`.
  - Blind spot: nie uruchomiono z flagą, więc nie wiadomo, ile ostrzeżeń się pojawi.
- **Decision**: FIXED — flaga w `tests/setup-component.ts`; `vitest run --project component --silent=false` pokazało jedno ostrzeżenie (test dymny, `MedicineSuggest`), poprawione przez `act` wokół `deliverAll()`; po poprawce 22/22 bez ostrzeżeń. Sonda (tymczasowy test, usunięty) potwierdziła, że flaga działa. Przy okazji: Vitest 5 domyślnie nie pokazuje konsoli zaliczonych testów, więc ostrzeżenia widać tylko z `--silent=false` — decyzja autora: setup zamienia ostrzeżenie „not wrapped in act” w błąd testu (`console.error` → `throw`, sonda potwierdziła czerwony test). Wzorzec opisany w `test-plan.md` §6.3.

### F2 — `npm test` to w ~95% testy hooków; Faza 4 CI wciągnie je razem z resztą

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: vitest.config.ts:27-35
- **Detail**: Plan zakłada, że `npm test` zostaje „poniżej kilku sekund”. Zmierzone: `unit` 1,5 s, `component` 4,8 s, `hooks` 17,1 s (prawdziwy git i skrypty w katalogach tymczasowych, limit 30 s na test). Projekt `hooks` z commita `f4840b3` jest w domyślnym `vitest run`. Gdy Faza 4 wdrażania podepnie `npm test` do CI, uruchomi też dowód hooków Claude Code (wymaga Git Bash na Windows, `agent-hooks.test.ts:351-354`), co nie jest bramką produktu.
- **Fix A ⭐ Recommended**: Zapisać w `test-plan.md` §3 przy Fazie 4, że CI uruchamia `vitest run --project unit --project component`, a `hooks` zostaje lokalny.
  - Strength: zero zmian w konfiguracji; decyzja trafia tam, gdzie Faza 4 będzie jej szukać.
  - Tradeoff: lokalny `npm test` dalej trwa ~18 s.
  - Confidence: HIGH — projekty już są rozdzielone, `--project` działa.
  - Blind spot: nikt nie pilnuje tej notatki do czasu Fazy 4.
- **Fix B**: Wyjąć `hooks` z domyślnego uruchomienia (osobny skrypt `test:hooks`) i poprawić AGENTS.md.
  - Strength: `npm test` wraca do ~6 s, CI dostaje go bez wyjątków.
  - Tradeoff: zmiana konfiguracji i dokumentacji hooków; łatwiej zapomnieć uruchomić dowód po zmianie hooka.
  - Confidence: MED — wymaga zmiany opisu w AGENTS.md i CLAUDE.md-owego kontraktu „Prove every hook”.
  - Blind spot: nie sprawdzono, czy coś (lint-staged, CI) już polega na `npm test` z hookami.
- **Decision**: FIXED (Fix A) — uwaga dla Fazy 4 pod tabelą §3 `test-plan.md`; wiersz stacku w §4 mówi teraz o trzech projektach.

### F3 — Błędna liczba testów i zmieniony status w `test-plan.md`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md:75, :143, :190
- **Detail**: `:143` i `:190` mówią, że `registry-search.test.ts` ma „94 testy”; plik ma 53, 94 to cały projekt `unit` (41 + 53). Wiersz Fazy 2 w tabeli §3 (`:75`) zmieniono w `da951d5` z `change opened` na `planned`, choć plan mówi „§1–§5 bez zmian”; wartość jest też już nieaktualna (faza zaimplementowana, autor chce `complete` po przeglądzie).
- **Fix**: `94 testy` → `53 testy` w `:143` i `:190`; status w `:75` → `complete` po zakończeniu triage.
- **Decision**: FIXED — 53 testy w §6.1 i §6.6; status Fazy 2 w §3 → `complete`.

### F4 — Hook Stop pomija `astro check`, gdy tura tylko usuwa moduł

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .claude/hooks/end-of-turn.mjs:74-89
- **Detail**: `linted` powstaje z plików, które jeszcze istnieją, a `astro check` uruchamia się tylko przy niepustym `linted` albo zmianie pliku konfiguracji typów. Tura, która tylko usuwa importowany `.ts`/`.tsx` (np. `rm` / `git rm` przez Bash — dokładnie to, co ta siatka ma łapać), kończy się kodem 0 i zepsute importy łapie dopiero CI. Test dowodowy `tests/hooks/agent-hooks.test.ts:210-216` sprawdza tylko, że ESLint jest pomijany. Poza planem (commit `f4840b3`).
- **Fix**: Decydować o `astro check` po `changed.some((f) => LINTED.has(path.extname(f)))` (także usunięte) i dodać przypadek dowodowy „usunięty importowany moduł → astro check działa”.
- **Decision**: FIXED — warunek po `changed` (także usunięte pliki kodu); test usuniętego pliku rozszerzony o asercję `astro check`, nowy przypadek „usunięcie zostawia błąd typu → exit 2”. Sprawdzenie zepsucia: ze starym warunkiem oba testy czerwone, poprawka przywrócona.

### F5 — Drobne słabości asercji w teście ekranu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/registry/RegistrySearch.test.tsx:116, :125-132, :223, :312
- **Detail**: (a) `:223` `expect(checks.pendingChecks(A_ID)).toBe(0)` po `answerCheck` jest zawsze prawdziwe — sprawdza pomocnik, nie aplikację; `checkRequests()` jest nieużywane. (b) `:116` czyta atrybut `value` zamiast właściwości. (c) `answerCheck` czeka 50 mikrozadań — liczba bez uzasadnienia (każda negatywna asercja ma pozytywną kalibrację w tym samym teście, więc nie przechodzi pusto). (d) Scenariusz 8 (`:312`) nie sprawdza, że poprzednie wyniki zostają widoczne do odpowiedzi nowego zapytania (S5 „bez migotania”). (e) `autoDeliver` w zastępniku workera nieużywane.
- **Fix**: `:223` → asercja na `checkRequests()`; `:116` → `(input as HTMLInputElement).value`; komentarz przy `50` albo jedno makrozadanie w `act`; w scenariuszu 8 asercja, że opcje poprzedniego zapytania są widoczne przed odpowiedzią.
- **Decision**: FIXED — (a) `checkRequests()` zamiast `pendingChecks`; (b) `.value`; (c) komentarz przy 50; (d) asercja 3 opcji przed odpowiedzią na „zzz”. 22/22.

### F6 — Zastępnik workera pozwala na niemożliwą kolejność odpowiedzi

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/helpers/fake-search-worker.ts:67-74
- **Detail**: `deliver(query)` zdejmuje dowolną odpowiedź z kolejki, a prawdziwy worker jest jednowątkowy i odpowiada po kolei. Obecne testy dostarczają po kolei, ale przyszły test mógłby „dowieść” scenariusza, który w aplikacji nie zachodzi.
- **Fix**: `deliver` rzuca błąd, gdy wskazana odpowiedź nie jest najstarsza w kolejce.
- **Decision**: FIXED (inaczej) — rzucanie błędu wywróciłoby poprawne testy (np. niedostarczone „Ibuprom 4” przed „ibuprom”), więc `deliver` dostarcza po kolei wszystkie starsze odpowiedzi do wskazanej włącznie, jak prawdziwy worker; opisane w `test-plan.md` §6.3.

### F7 — Kryterium mutacyjne 3.2 nie spełnione w brzmieniu planu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-result-state-and-search/plan.md:170
- **Detail**: Plan: usunięcie `key={selected.id}` razem z porównaniem klucza wywraca scenariusz 4 lub 5. Wynik: zostaje zielony, bo trzecie zabezpieczenie (flaga przerwania w `finish`) samo odrzuca spóźnioną odpowiedź; dopiero usunięcie wszystkich trzech wywraca 4/5. Zapisane w `test-plan.md` §6.6 i zaakceptowane przez autora w sesji. Usunięcie `onEdit` wywraca 4 scenariusze (plan: 1–3).
- **Fix**: Brak — udokumentowane; ewentualnie dopisać w planie notę przy 3.2 z odwołaniem do §6.6.
- **Decision**: FIXED — nota z przeglądu pod kryterium mutacyjnym Fazy 3 w `plan.md`.

### F8 — Przypadki brzegowe hooków

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .claude/hooks/end-of-turn.mjs:60, :70, :79, :84; .claude/hooks/format.mjs:10
- **Detail**: (a) `spawnSync` bez `timeout`; limit hooka Stop to 120 s, a przekroczenie to błąd nieblokujący, więc cichy przepust — zmierzone 20 s na jeden plik, zapas duży. (b) `git diff --name-only` cytuje ścieżki spoza ASCII (`core.quotePath`), więc plik z polską nazwą jest po cichu pomijany. (c) Brak `--` przed listą plików dla ESLint i ui-scan. (d) `format.mjs` nie formatuje `.js`/`.mjs`/`.cjs`/`.jsx`, które ESLint lintuje z regułą Prettiera, więc agent może wrócić na Stop za formatowanie, które naprawiłby hook po edycji. (e) „Zmienione w tej turze” to w praktyce wszystkie niezacommitowane zmiany.
- **Fix**: `git -c core.quotePath=off`; `--` przed plikami; `timeout` w `spawnSync` z komunikatem i exit 2; dodać `.js/.mjs/.cjs/.jsx` do `FORMATTED`.
- **Decision**: FIXED — (a) wspólny budżet 100 s dla `spawnSync` (`END_OF_TURN_BUDGET_MS` tylko dla testów), przekroczenie = komunikat i exit 2; (b) `git … -z` zamiast `core.quotePath=off` (odporne też na inne znaki); (c) `--` przed plikami dla ESLint (sprawdzone na prawdziwym ESLint; `ui-scan.mjs` nie ma opcji i filtruje po `GUARDED`, więc bez zmian); (d) JS w `FORMATTED` (wszystkie pliki JS już zgodne z Prettierem). Nowe testy dowodowe: nazwa spoza ASCII, przekroczony budżet, formatowanie `.mjs`; na hookach sprzed przeglądu 5 testów czerwonych, 32/32 na poprawionych.

### F9 — Drobiazgi w dokumentacji

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: AGENTS.md:37; context/changes/testing-result-state-and-search/plan.md:285; tests/fixtures/registry-search-list.ts:23-24
- **Detail**: AGENTS.md: brak „and” przed „the search matching rule in …”. Progress 4.2 bez SHA. Komentarz fixture'a mówi, że id Gripex są „w odwrotnej kolejności”, ale Gripex Aktiv (24) nie jest — bez wpływu, decyduje długość.
- **Fix**: dopisać „and” w AGENTS.md; `— da951d5` przy 4.2; doprecyzować komentarz fixture'a.
- **Decision**: FIXED — wszystkie trzy.

### F10 — Luki pokrycia poza zakresem planu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/helpers/fetch.ts:45-65; src/lib/registry-search.test.ts:89; tests/helpers/fake-search-worker.ts
- **Detail**: Prawdziwa ścieżka przerwania (`fetch` odrzuca `AbortError` → `catch` → `finish` zablokowany flagą) nie jest wykonywana — odroczony `fetch` celowo ignoruje sygnał. Przejście poziomu dowodzi tylko „C po A” (brak wiersza B dla `magne`). Odpowiedź workera `{type:"error"}` i `onerror` nie są modelowane ani testowane.
- **Fix**: Zapisać jako kandydatów do Fazy 3/5 wdrażania w `test-plan.md` §6.6; bez zmian teraz.
- **Decision**: ACCEPTED — kandydaci zapisani w `test-plan.md` §6.6 (Faza 2).
