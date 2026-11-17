# Poziom dopasowania substancji czynnych (S-06) — Plan Brief

> Full plan: `context/changes/substance-match-level/plan.md`
> Research: `context/changes/substance-match-level/research.md`

## What & Why

Użytkownik wybiera na `/szukaj`, jak szeroko szukać w apteczce leku o podobnym składzie: „Ten sam skład”, „Zawiera wszystkie składniki” albo „Zawiera którykolwiek składnik” (FR-016, US-01). Dziś działa tylko poziom precyzyjny, więc posiadany lek złożony z szukaną substancją pozostaje niewidoczny.

## Starting Point

Reguła siedzi w jednym RPC `medicine_check(bigint)`. „Ta sama substancja” to tam równy zbiór części nazwy powszechnej (NPS) albo równy zbiór substancji, a ogólniki nigdy nie pasują. Ekran nie ma miejsca na preferencje. Pomiar obalił zdanie z roadmapy: dla 36% leków jednoskładnikowych „zawiera wszystkie” daje więcej trafień.

## Desired End State

Na `/szukaj` jest przełącznik trzech poziomów (domyślnie „Ten sam skład”), zapamiętany w przeglądarce. Zmiana poziomu od razu odświeża werdykt, a lista jest posortowana od najmocniejszego dopasowania. Tytuł i zastrzeżenie mówią prawdę na każdym poziomie. Na poziomach luźnych zastrzeżenie brzmi „Te leki mogą mieć inny skład. Nie zamieniaj ich bez porady farmaceuty lub lekarza.”

## Key Decisions Made

| Decision        | Choice                                                                             | Why (1 sentence)                                                                                                    | Source          |
| --------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------- |
| NPS w poziomach | Obie drogi na każdym poziomie, operatory `=` / `@>` / `&&`                         | Monotoniczność i brak utraty ok. 17% dzisiejszych dopasowań po NPS                                                  | Research / Plan |
| Poziom domyślny | Precyzyjny („Ten sam skład”)                                                       | Bez niespodzianki dla użytkowników, najbezpieczniej medycznie, testy S-03 zostają ważne                             | Plan            |
| Zapamiętanie    | `localStorage`                                                                     | Bez migracji i bez konfliktu z S-12                                                                                 | Plan            |
| Nazwy poziomów  | „Ten sam skład” / „Zawiera wszystkie składniki” / „Zawiera którykolwiek składnik”  | Zrozumiałe dla laika bez objaśnień                                                                                  | Plan            |
| Werdykt         | Tytuł, dopisek „nie masz” i zastrzeżenie per poziom; luźne: „mogą mieć inny skład” | „Ta sama substancja” jest fałszywe na poziomach luźnych, a „mają inny skład” bywa fałszywe przy „zawiera wszystkie” | Plan            |
| Ogólnik `-`     | Dopisany do listy w tej migracji                                                   | Jedyny prawdziwy ogólnik spoza listy (2 produkty)                                                                   | Research / Plan |
| Kolejność       | Siła dopasowania (wariant, równy, nadzbiór, przecięcie), bez etykiet               | Najlepsze trafienia na górze, prosty ekran                                                                          | Plan            |
| Zgodność wstecz | `p_level default 'exact'`, serwis pomija `p_level` dla `exact`                     | Kolejność „merge, potem `db push`” zostaje                                                                          | Plan            |

## Scope

**In scope:**

- Migracja `medicine_check(p_product_id, p_level)` z echem `level`, sortowaniem po sile i `-` jako ogólnikiem
- Parametr `level` w `GET /api/kit/check`, typy, parser, teksty werdyktu (`src/lib/match-level.ts`)
- Przełącznik na `/szukaj`, hook `useMatchLevel`, poziom w `useMedicineCheck`
- Testy: `test:db`, `test:api`, unit, komponenty, `ui:shots`; AGENTS.md (rollback) i PRD

**Out of scope:**

- Poziom na koncie lub w URL, etykiety siły i `matchedBy` przy pozycjach
- Liczenie pustych / przeterminowanych opakowań (S-12), `KitItemDetails`, formularze apteczki
- Mieszaniny o innym składzie pod jedną NPS i nowe kształty ogólników

## Architecture / Approach

Poziom płynie przez całą ścieżkę: `RadioGroup` w `RegistrySearch` (stan + `localStorage`) → `useMedicineCheck(productId, level)` → `GET /api/kit/check?product=&level=` (zod enum) → `rpc("medicine_check", { p_product_id, p_level })`. Odpowiedź ma echo `level`, które ekran sprawdza. Każda warstwa bez poziomu działa jak dziś. Teksty zależne od poziomu żyją w osobnym module, żeby zmiany w plikach współdzielonych z S-12 były jak najmniejsze.

## Phases at a Glance

| Phase             | What it delivers                                                                  | Key risk                                                                         |
| ----------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1. Reguła w bazie | RPC z poziomem, sortowanie po sile, `-` jako ogólnik, `test:db`                   | Pułapka `@> '{}'` (ogólnik dopasowałby całą apteczkę), konflikt ciała RPC z S-12 |
| 2. API i werdykt  | `level` w API, parser, teksty per poziom, `test:api`                              | Kolejność wdrożenia względem `db push`                                           |
| 3. Ekran          | Przełącznik, `localStorage`, brak nieaktualnego werdyktu, zastrzeżenie per poziom | Wyścig zapytań przy szybkim przełączaniu, czytnik ekranu                         |

**Prerequisites:** zgoda koordynatora na `migration up`, `test:db`, `test:api`, serwer na 4333 i `ui:shots`; uzgodniona z S-12 kolejność merge `medicine_check`.
**Estimated effort:** ~3 sesje, po jednej na fazę.

## Open Risks & Assumptions

- **S-12 zmienia te same pliki** (`medicine-check-verdict.ts`, ciało `medicine_check`, `MedicineCheckResult`). S-06 zmienia tylko warunek dopasowania, kolejność i teksty substance/none. Kto merguje drugi, bierze ciało `medicine_check` z migracji pierwszego.
- Przy „zawiera którykolwiek” lek złożony może dać dziesiątki pozycji (ograniczone apteczką użytkownika).
- Treść zastrzeżenia nie przeszła oceny prawnej (Open Roadmap Question 6).

## Success Criteria (Summary)

- Użytkownik z lekiem złożonym w apteczce widzi go po wybraniu luźniejszego poziomu, z ostrzeżeniem o innym składzie.
- Domyślne zachowanie i istniejące testy reguły zostają bez zmian.
- Werdykt nigdy nie pochodzi z innego poziomu niż zaznaczony.
