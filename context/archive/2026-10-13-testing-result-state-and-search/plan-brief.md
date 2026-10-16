# Faza 2 wdrażania testów — stan wyniku i wyszukiwanie — Plan Brief

> Full plan: `context/changes/testing-result-state-and-search/plan.md`
> Research: `context/changes/testing-result-state-and-search/research.md`

## What & Why

Testy dla ryzyk #3 i #5 z planu testów: ekran nie może pokazać werdyktu innego leku niż bieżący wybór (już się zdarzało z wynikami wyszukiwania), a podpowiedzi muszą trzymać kolejność i nie gubić wariantów. Dziś żadnego z tych zachowań nie chroni test uruchamiany bez pełnego rejestru.

## Starting Point

Reguła wyszukiwania to czyste funkcje w `src/lib/registry-search.ts`, bez testów; jedyną kontrolą jest `search:check` (plik wzorcowy z kodu, tylko lokalnie). Stan werdyktu jest rozproszony po `RegistrySearch`, `MedicineSuggest` i dwóch hookach; test z Fazy 1 renderuje tylko `MedicineCheckResult` z jednym produktem.

## Desired End State

`npm test` zawiera test reguły (R1–R7 na ręcznej liście) i test całego `RegistrySearch` z ośmioma scenariuszami spóźnionych i przeplatanych odpowiedzi. Celowe zepsucie reguły lub zabezpieczeń wywraca testy. Książka kucharska opisuje oba wzorce.

## Key Decisions Made

| Decyzja                 | Wybór                                                        | Dlaczego                                                                 | Źródło   |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ | -------- |
| Wyrocznia #5            | Reguła S-01 (R1–R7), wartości pisane ręcznie                 | Plik wzorcowy utrwala obecne zachowanie razem z błędami                  | Research |
| Wyrocznia #3            | S1–S7, asercje na tym, co wyrenderowane                      | Test dowodzi zachowania, nie tego, które zabezpieczenie je daje          | Research |
| Formularz `/apteczka`   | Defekt do osobnej zmiany, bez testów tutaj; zapis w §6.6     | Ryzyko #3 dotyczy werdyktu; defekt nie może zginąć                       | Plan     |
| Kolejność mocy          | Bez asercji dla mocy o różnej liczbie cyfr; notatka w §6.6   | Nie betonować kolejności „1000 mg” przed „500 mg”, która może być błędem | Plan     |
| Zastępnik `Worker`      | Ręczny, liczy prawdziwym `searchVariants`, sterowana kolejka | Tylko tak scenariusze 7–8 kontrolują kolejność odpowiedzi                | Plan     |
| Pomocniki               | Wspólne `tests/helpers/`, fixture w `tests/fixtures/`        | Jedna lista zasila oba testy; test Fazy 1 bez zmian asercji              | Plan     |
| Polskie sortowanie w CI | Bez obejścia                                                 | CI na Node 22 z pełnym ICU, lokalnie sprawdzone                          | Plan     |
| `user-event`            | Nie dodajemy                                                 | `fireEvent` wystarcza, jak w Fazie 1                                     | Plan     |

## Scope

**In scope:** test unit reguły wyszukiwania; wspólne zastępniki `fetch`/`Worker` i łatki jsdom; test komponentu `RegistrySearch` (scenariusze 1–8 + „moc · postać”); §6 planu testów i AGENTS.md.

**Out of scope:** naprawa formularza `/apteczka`; decyzja o sortowaniu liczbowym mocy; zmiany kodu produkcyjnego i `search:check`; CI (Faza 4 wdrażania); testy hooków w izolacji.

## Architecture / Approach

Jedna lista-fixture → (a) bezpośrednio do `buildSearchIndex`/`searchVariants` w teście unit, (b) przez router `fetch` do prawdziwego `useRegistrySearch`, który przekazuje ją zastępnikowi `Worker`. Zastępnik liczy odpowiedzi prawdziwą regułą, ale wysyła je, kiedy każe test. Odpowiedzi sprawdzenia są odraczane per produkt i nie odrzucają się przy przerwaniu, więc test może dostarczyć spóźnioną odpowiedź po przerwaniu.

## Phases at a Glance

| Phase                               | What it delivers                                 | Key risk                                                        |
| ----------------------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| 1. Reguła dopasowania (unit)        | fixture + `registry-search.test.ts`              | Wartość oczekiwana skopiowana z wyniku zamiast z reguły         |
| 2. Zastępniki do testów komponentu  | helpery `fetch`, sterowany `Worker`, łatki jsdom | Zastępnik odpowiada synchronicznie i fałszuje kolejność         |
| 3. Nieaktualny werdykt (komponent)  | `RegistrySearch.test.tsx`, 8 scenariuszy         | Testy przechodzą także bez zabezpieczeń (sprawdzenie mutacyjne) |
| 4. Książka kucharska i dokumentacja | §6 planu testów, AGENTS.md                       | —                                                               |

**Prerequisites:** runner z Fazy 1 (`npm test`); bez bazy i rejestru.
**Estimated effort:** ~2 sesje w 4 fazach.

## Open Risks & Assumptions

- `performance.mark` z `detail` w jsdom Vitest — niesprawdzone; łatka tylko jeśli potrzebna.
- Usunięcie jednego zabezpieczenia może nie wywrócić testu (są dwa na każdą spóźnioną odpowiedź); sprawdzenie mutacyjne usuwa je parami.

## Success Criteria (Summary)

- Zmiana kolejności poziomów, normalizacji lub minimalnej długości wywraca test unit.
- Spóźniona odpowiedź na wcześniejszy wybór lub zapytanie nigdy nie pojawia się na ekranie w teście, a usunięcie zabezpieczeń to wykrywa.
