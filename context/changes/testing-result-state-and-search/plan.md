# Faza 2 wdrażania testów — stan wyniku i wyszukiwanie: plan implementacji

## Overview

Dodajemy testy dla dwóch ryzyk z `context/foundation/test-plan.md`:

- **#5** — podpowiedzi zmieniają kolejność albo gubią warianty: test unit `searchVariants` na małej, ręcznie zbudowanej liście, z wartościami oczekiwanymi wyprowadzonymi z uzgodnionej reguły S-01 (R1–R7), nie z wyniku kodu.
- **#3** — ekran pokazuje werdykt innego leku niż bieżący wybór: test komponentu całego `RegistrySearch` z odpowiedziami sprawdzenia i workera wyszukiwania dostarczanymi w kolejności wybranej przez test (scenariusze 1–8 z researchu).

Kod produkcyjny się nie zmienia. Testy działają bez bazy i bez pełnego rejestru, więc Faza 4 wdrażania może je dodać do CI bez nowej infrastruktury.

## Current State Analysis

- Reguła dopasowania jest czysta i oddzielona od Reacta i workera: `normalizeText`, `isQueryLongEnough`, `buildSearchIndex`, `searchVariants` w `src/lib/registry-search.ts:39-176`. Żaden test jej nie pokrywa; jedyną kontrolą jest `search:check`, który porównuje kod z jego własnym wcześniejszym wynikiem, wymaga pełnego rejestru i nie działa w CI (research, „Co już istnieje”).
- Stan wyświetlanego werdyktu żyje w czterech miejscach: `selected`/`searched` w `RegistrySearch.tsx:43-46`, odpowiedź z kluczem w `useMedicineCheck.ts:19-72`, `query` w `MedicineSuggest.tsx:27`, `answer` z id zapytania w `useRegistrySearch.ts:31-150`. Dowód na tym, co wyrenderowane, wymaga więc renderu całego `RegistrySearch`.
- Test z Fazy 1 (`MedicineCheckResult.test.tsx`) renderuje zawsze `productId={1}` z natychmiastową odpowiedzią; pomocniki `reply`/`stubFetch` są lokalne dla pliku (`:57-73`).
- jsdom 29 nie ma `Worker` ani `Element.prototype.scrollIntoView`; `useRegistrySearch` wywołuje `performance.mark` z opcją `detail` (`:79`).
- Czytanie kodu nie ujawniło defektu na ścieżkach #3 na `/szukaj`; wartością testów jest ochrona przed regresją (jak w Fazie 1).

## Desired End State

- `npm test` uruchamia nowy `src/lib/registry-search.test.ts` (projekt `unit`) i `src/components/registry/RegistrySearch.test.tsx` (projekt `component`), oba zielone, bez bazy.
- Ręczne zepsucie reguły (np. odwrócenie poziomów A/C, usunięcie `ł→l`) wywraca test unit; usunięcie zabezpieczeń nieaktualnego stanu wywraca test komponentu.
- §6.1, §6.3 i §6.6 planu testów opisują wzorce dostarczone w tej fazie; oba odłożone defekty są zapisane w §6.6.

### Key Discoveries:

- Wyrocznia #5: `context/archive/2026-10-02-registry-search-suggestions/plan.md:46-57` (R1–R7 w researchu).
- Wyrocznia #3: S1–S7 w researchu (`medicine-check/plan.md:230-236`, `:473`; `registry-search-performance/plan.md:70-73`; `reviews/impl-review.md:75-83`).
- `searchVariants(index, query, limit)` przyjmuje jawny `limit` (`registry-search.ts:145`) — test R6 nie potrzebuje 21 wierszy.
- Protokół workera: `RegistrySearchWorkerRequest`/`Response` w `src/types.ts:118-125`; prawdziwy worker liczy odpowiedź `buildSearchIndex` + `searchVariants(…, MAX_RESULTS)` (`src/lib/registry-search.worker.ts:14-43`).
- `tests/setup-component.ts` już wywołuje `vi.unstubAllGlobals()` po każdym teście, więc `vi.stubGlobal("Worker", …)` sprząta się sam.
- Polskie sortowanie w CI: workflow używa Node 22 (`.github/workflows/ci.yml:16`), lokalnie v22.14.0; oficjalne buildy mają pełne ICU, `Intl.Collator("pl")` daje `a ą b l ł m`. Pytanie 4 z researchu zamknięte.

## What We're NOT Doing

- **Formularz dodawania na `/apteczka`** (`KitAddForm` nie przekazuje `onEdit`, więc po edycji tekstu bez nowego wyboru zostaje formularz opakowania wcześniejszego leku): decyzja autora 2026-10-16 — to defekt do naprawy w osobnej zmianie; w tej fazie bez testów. Zapisany w §6.6 planu testów (Faza 4 tego planu).
- **Kolejność mocy o różnej liczbie cyfr** („1000 mg” przed „500 mg”, bo moc jest porównywana jako tekst): decyzja autora 2026-10-16 — bez asercji; test porównuje tylko moce o tej samej liczbie cyfr, gdzie kolejność tekstowa i liczbowa są zgodne. Pytanie „czy chcemy kolejności liczbowej” zapisane w §6.6.
- Zmiany kodu produkcyjnego, `search:check` i jego pliku wzorcowego.
- Składanie duplikatów z importu równoległego (SQL, pokrywa `registry-import-check.mjs`).
- `@testing-library/user-event` — wystarcza `fireEvent`, jak w Fazie 1.
- Podpięcie `npm test` do CI (Faza 4 wdrażania).
- Testy osobnych hooków (`useMedicineCheck`, `useRegistrySearch`) w izolacji — dowód idzie przez to, co wyrenderowane.

## Implementation Approach

Najpierw najtańsza warstwa: reguła jako czysta funkcja (Faza 1). Potem wspólne zastępniki (Faza 2), dzięki którym test komponentu (Faza 3) steruje kolejnością odpowiedzi bez sleepów. Jedna lista-fixture zasila oba testy. Wartości oczekiwane są pisane ręcznie obok każdego przypadku z odwołaniem do reguły (R#/S#), nigdy kopiowane z wyniku uruchomienia.

## Critical Implementation Details

- **Odpowiedzi, które docierają mimo przerwania.** Odraczany `fetch` nie odrzuca obietnicy przy `abort` — rozwiązanie spóźnionej odpowiedzi po przerwaniu to mocniejszy przypadek (oba zabezpieczenia, flaga przerwania i klucz, muszą ją odrzucić). Po rozwiązaniu test opróżnia oczekującą pracę (`await act(...)`) i dopiero wtedy sprawdza brak; żadnych `setTimeout`/sleepów.
- **Zastępnik `Worker` odpowiada asynchronicznie.** Prawdziwy worker nigdy nie odpowiada synchronicznie w `postMessage`; zastępnik kolejkuje odpowiedzi i wysyła je dopiero na polecenie testu (albo w trybie automatycznym w mikrozadaniu), w przeciwnym razie `setState` w trakcie efektu zafałszuje scenariusze 7 i 8.

## Faza 1: Reguła dopasowania (unit)

### Overview

Lista-fixture i test `searchVariants` dowodzący R1–R7, jedno `it.each` na właściwość (§6.1).

### Changes Required:

#### 1. Lista-fixture

**File**: `tests/fixtures/registry-search-list.ts`

**Intent**: Ręcznie napisany `RegistrySearchListPayload` (~15–20 wierszy) pokrywający tabelę „co musi zawierać lista” z researchu: poziomy A/B/C/D dla jednego słowa, wiersz A dłuższy niż wiersz B, ta sama nazwa z mocą 200/400 mg, ta sama nazwa i moc z dwiema postaciami, przejście do następnego poziomu, `ż`/`ó`/`ł`, „No-Spa”, „Ibuprom”, kolejność w poziomie (długość, polski porządek z jednoznaczną parą `a`/`ą`/`b`, moc o tej samej liczbie cyfr, `id`), wiersze z `null` i pustymi substancjami. Nazwy realistyczne, id syntetyczne. Ten sam fixture zasili test komponentu w Fazie 3.

**Contract**: eksport stałej typu `RegistrySearchListPayload` (`src/types.ts:18-22`) oraz nazwanych id wierszy (żeby asercje mówiły „wiersz A”, a nie liczba). Plik poza `src/`, więc nie trafia do buildu.

#### 2. Test reguły

**File**: `src/lib/registry-search.test.ts`

**Intent**: Dla każdej właściwości z tabeli researchu jedno `it.each` (zapytanie → oczekiwane id w kolejności i `total`), z komentarzem wskazującym regułę R#. Pokrywa: nazwa przed nazwą powszechną i substancją (R3, FR-002), pierwsze słowo nazwy przed dalszym (R3), zawężanie po mocy i postaci (R4), warianty nie giną, przejście poziomu (R4), diakrytyki i `ł` (R1), wielkość liter i spacje (R1), minimalna długość (R2), tylko prefiks i brak literówek (R3, R7), kolejność w poziomie bez porównań mocy o różnej liczbie cyfr (R5), limit i suma przy jawnym `limit` (R6), brakujące pola nie rzucają błędu.

**Contract**: importuje tylko `buildSearchIndex`, `searchVariants`, `isQueryLongEnough` z `@/lib/registry-search`; brak zmian w `vitest.config.ts`.

### Success Criteria:

#### Automated Verification:

- `npx vitest run --project unit` przechodzi z nowym plikiem
- Ręczne sprawdzenie mutacyjne: odwrócenie kolejności poziomów, usunięcie `.replace(/ł/g, "l")` i zmiana `MIN_QUERY_LENGTH` na 2 — każde wywraca co najmniej jeden test; zmiany cofnięte
- `npm run lint` i `npx astro check` bez nowych błędów

#### Manual Verification:

- Autor przegląda tabelę przypadków i potwierdza, że każda wartość oczekiwana wynika z reguły S-01, a nie z obecnego wyniku

**Implementation Note**: po zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie autora przed Fazą 2.

---

## Faza 2: Zastępniki do testów komponentu

### Overview

Wspólne pomocniki: natychmiastowy i odraczany `fetch`, sterowany `Worker`, łatki jsdom. Test z Fazy 1 przechodzi na wspólne pomocniki bez zmiany asercji.

### Changes Required:

#### 1. Pomocniki `fetch`

**File**: `tests/helpers/fetch.ts`; `src/components/registry/MedicineCheckResult.test.tsx`

**Intent**: Przenieść `reply` i `stubFetch` z testu Fazy 1 do wspólnego pliku; dodać router `fetch` rozróżniający adres listy wyszukiwania (`/api/registry/search-list`) od sprawdzenia oraz odraczaną odpowiedź sprawdzenia per id produktu, rozwiązywaną przez test później, w dowolnej kolejności, bez odrzucania przy przerwaniu. Test Fazy 1 importuje pomocniki stąd; jego asercje się nie zmieniają.

**Contract**: `reply(body, status?)`, `stubFetch(...replies)` jak dotąd; nowy router zwraca uchwyt pozwalający rozwiązać oczekujące zapytanie sprawdzenia dla danego `productId` (adres zapytania sprawdzenia ustala implementujący z `useMedicineCheck`).

#### 2. Sterowany zastępnik `Worker`

**File**: `tests/helpers/fake-search-worker.ts`

**Intent**: Klasa podstawiana przez `vi.stubGlobal("Worker", …)`, która na `load` dekoduje bufor i buduje indeks prawdziwym `buildSearchIndex`, odpowiada `ready`, a na `search` liczy odpowiedź prawdziwym `searchVariants(…, MAX_RESULTS)` i kolejkuje ją. Test decyduje, czy odpowiedzi są dostarczane automatycznie, czy na polecenie i w jakiej kolejności. Zachowuje protokół z `src/types.ts:118-125`.

**Contract**: dostęp do ostatnio utworzonej instancji i jej kolejki; metody w rodzaju „dostarcz odpowiedź na zapytanie o tekście X” i „dostarcz wszystkie”; `terminate()` czyści kolejkę.

#### 3. Łatki jsdom

**File**: `tests/setup-component.ts`

**Intent**: Dodać no-op `Element.prototype.scrollIntoView` i — jeśli środowisko jsdom w Vitest nie wystawia `performance.mark` z opcją `detail` — bezpieczny zastępnik. Sprawdzić najpierw, czy jest potrzebny; nie dodawać na zapas.

**Contract**: łatki globalne dla projektu `component`, bez wpływu na projekt `unit`.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi; `MedicineCheckResult.test.tsx` ma te same asercje co przed przeniesieniem pomocników
- Krótki test dymny w `RegistrySearch.test.tsx` (zalążek Fazy 3): render, wpisanie zapytania, dostarczenie odpowiedzi workera → widać opcje z fixture'a
- `npm run lint` i `npx astro check` bez nowych błędów

**Implementation Note**: po zielonej weryfikacji przejdź do Fazy 3 (brak kroków ręcznych).

---

## Faza 3: Nieaktualny werdykt (komponent)

### Overview

`RegistrySearch.test.tsx` dowodzi, że ekran nigdy nie pokazuje werdyktu ani podpowiedzi dla czegoś innego niż bieżący wybór i zapytanie (S1–S7).

### Changes Required:

#### 1. Scenariusze nieaktualnego stanu

**File**: `src/components/registry/RegistrySearch.test.tsx`

**Intent**: Osiem scenariuszy z researchu, każdy z asercjami na tym, co wyrenderowane (karta „Wybrany lek”, tekst werdyktu poza `[role=status]`, opcje listy, komunikat „Brak leku o takiej nazwie w rejestrze”):

1. edycja po werdykcie → brak karty i werdyktu (S2);
2. wyczyszczenie po werdykcie → to samo (S2, S6);
3. edycja w trakcie sprawdzenia, potem spóźniona odpowiedź A → nadal brak karty i werdyktu (S2, S3);
4. wybór A, wybór B, odpowiedź B, potem spóźniona A → karta i werdykt B przed i po (S3);
5. spóźniona A przychodzi, gdy B jest w toku → ładowanie B, brak werdyktu A; potem werdykt B (S3);
6. ponowny wybór tego samego leku po edycji → karta i werdykt A (asercja tylko na tym, co wyrenderowane);
7. `ibu` z odpowiedzią → wyczyszczenie → `par` przed odpowiedzią → żadna opcja `ibu`; spóźniona odpowiedź `ibu` niczego nie zmienia (S4, S6);
8. zapytanie bez dopasowań po zapytaniu z dopasowaniami → „Brak leku…” dopiero po jego własnej odpowiedzi (S5).

A i B dostają werdykty różnego rodzaju (np. „Masz ten lek · 1 opakowanie” i „Nie masz tego leku”) i różne nazwy w karcie. Dodatkowo jedna asercja: każda opcja pokazuje drugą linię „moc · postać” i dwa warianty o tej samej nazwie są rozróżnialne (ryzyko #5, warstwa wyświetlania).

**Contract**: render `<RegistrySearch version={…} />` z routerem `fetch` i zastępnikiem `Worker` z Fazy 2; wybór kliknięciem opcji, edycja przez `fireEvent.change`; teksty werdyktów jako stałe jak w Fazie 1.

### Success Criteria:

#### Automated Verification:

- `npx vitest run --project component` przechodzi
- Ręczne sprawdzenie mutacyjne (każde osobno, potem cofnięte): usunięcie `onEdit` w `RegistrySearch` wywraca scenariusze 1–3; usunięcie `key={selected.id}` razem z porównaniem klucza w `useMedicineCheck` wywraca scenariusz 4 lub 5; usunięcie porównania `message.id === lastIdRef.current` razem z zerowaniem `answer` wywraca scenariusz 7
- `npm run lint` i `npx astro check` bez nowych błędów

#### Manual Verification:

- Autor czyta nazwy testów i potwierdza, że każda odpowiada scenariuszowi z researchu w języku użytkownika

**Implementation Note**: po zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie autora przed Fazą 4.

---

## Faza 4: Książka kucharska i dokumentacja

### Overview

Uzupełnić wzorce w planie testów i krótką wzmiankę w AGENTS.md.

### Changes Required:

#### 1. Plan testów

**File**: `context/foundation/test-plan.md`

**Intent**: §6.1 — zastąpić „TBD — zob. §3 Faza 2” wzorcem dopasowania wyszukiwania (lista-fixture, wartości z reguły S-01, test wzorcowy). §6.3 — zastąpić TBD wzorcem nieaktualnego werdyktu (render całego `RegistrySearch`, podmieniane `fetch` i `Worker`, odpowiedzi odraczane bez odrzucania przy przerwaniu, asercje na tym, co wyrenderowane, bez sleepów); zmienić „podmień tylko `fetch`” na „podmień tylko `fetch` i `Worker`”. §6.6 — notatka Fazy 2: co dostarczono, wyniki sprawdzeń mutacyjnych, oba odłożone defekty (formularz `/apteczka`, kolejność mocy), zamknięte pytanie o ICU w CI. §8 — data przeglądu. Tekst po polsku.

**Contract**: tylko §6 i §8; §1–§5 bez zmian (status w §3 aktualizuje orkiestrator).

#### 2. AGENTS.md

**File**: `AGENTS.md`

**Intent**: W opisie `npm test` dodać nowe testy wzorcowe (`registry-search.test.ts`, `RegistrySearch.test.tsx`) i wzmiankę, że wspólne pomocniki i fixture'y są w `tests/helpers/` i `tests/fixtures/`. Po angielsku.

**Contract**: jedna linia w sekcji „Command tripwires”.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi
- W `test-plan.md` nie zostało „TBD — zob. §3 Faza 2”

#### Manual Verification:

- Autor przegląda zmiany w §6 i AGENTS.md

---

## Testing Strategy

### Unit Tests:

- R1–R7 na liście-fixture, wartości oczekiwane z reguły S-01; kolejność mocy tylko dla mocy o tej samej liczbie cyfr.

### Integration Tests:

- Test komponentu `RegistrySearch` z prawdziwymi hookami, zastąpionymi tylko `fetch` i `Worker`; scenariusze 1–8.

### Manual Testing Steps:

1. Przejrzeć tabelę przypadków unit pod kątem zgodności z regułą S-01.
2. Przeczytać nazwy testów komponentu i porównać ze scenariuszami z researchu.

## Performance Considerations

Brak — testy nie dotykają kodu produkcyjnego; cały zestaw `npm test` powinien pozostać poniżej kilku sekund.

## References

- Research: `context/changes/testing-result-state-and-search/research.md`
- Plan testów: `context/foundation/test-plan.md` (§2 ryzyka #3, #5; §6.1, §6.3)
- Reguła wyszukiwania: `context/archive/2026-10-02-registry-search-suggestions/plan.md:46-57`
- Wzorzec Fazy 1: `src/components/registry/MedicineCheckResult.test.tsx`, `src/lib/medicine-check-verdict.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguła dopasowania (unit)

#### Automated

- [x] 1.1 `npx vitest run --project unit` przechodzi z nowym plikiem — e0bd88c
- [x] 1.2 Ręczne sprawdzenie mutacyjne reguły wywraca testy; zmiany cofnięte — e0bd88c
- [x] 1.3 `npm run lint` i `npx astro check` bez nowych błędów — e0bd88c

#### Manual

- [x] 1.4 Autor potwierdza, że wartości oczekiwane wynikają z reguły S-01 — e0bd88c

### Phase 2: Zastępniki do testów komponentu

#### Automated

- [x] 2.1 `npm test` przechodzi; test Fazy 1 ma te same asercje — 2d1a754
- [x] 2.2 Test dymny `RegistrySearch` pokazuje opcje z fixture'a — 2d1a754
- [x] 2.3 `npm run lint` i `npx astro check` bez nowych błędów — 2d1a754

### Phase 3: Nieaktualny werdykt (komponent)

#### Automated

- [x] 3.1 `npx vitest run --project component` przechodzi — 4880146
- [x] 3.2 Ręczne sprawdzenie mutacyjne zabezpieczeń wywraca scenariusze; zmiany cofnięte — 4880146
- [x] 3.3 `npm run lint` i `npx astro check` bez nowych błędów — 4880146

#### Manual

- [x] 3.4 Autor potwierdza, że nazwy testów odpowiadają scenariuszom — 4880146

### Phase 4: Książka kucharska i dokumentacja

#### Automated

- [x] 4.1 `npm test` przechodzi — da951d5
- [x] 4.2 W `test-plan.md` nie zostało „TBD — zob. §3 Faza 2”

#### Manual

- [x] 4.3 Autor przegląda zmiany w §6 i AGENTS.md — da951d5
