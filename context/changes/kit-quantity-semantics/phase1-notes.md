# Faza 1 — stan przerwania (2026-11-17)

Kod fazy 1 napisany (subagent), bez commita. Zmienione pliki: `src/lib/kit-format.ts`, `src/lib/kit-format.test.ts`, `src/components/kit/KitAddForm.test.tsx`, `src/components/kit/KitImport.test.tsx`, `src/components/kit/KitList.test.tsx`, `tests/api/helpers.ts`, `context/changes/kit-quantity-semantics/research.md` (sekcja „Production data check”).

## Adaptacje

- `packQuantity` zachowuje dzisiejszy typ `{ unit: string | null; max: number | null }` (plan pisał `| null`, ale też „sygnatura bez zmian”).
- `tests/api/helpers.ts`: wszystkie wybory zależne od wielkości opakowania (`sized`, `unsized`, `siblings`, `otherVariant`, `withdrawnSized`) liczą limit przez `packQuantity` w TS; SQL zwraca kandydatów po id.
- Fixtury tabletek w testach komponentów mają realny kształt rejestru (`capacity` + `capacity_unit "tabl."`); nowy test Oxbryty w `KitAddForm.test.tsx`.

## Niezgodność strukturalna (decyzja użytkownika przed commitem)

Bramka 1.4 (`test:api`) nie przejdzie na fiksturach CI: po nowej regule każde aktywne opakowanie w `scripts/fixtures/rpl-sample-v1.xml` i `v2.xml` ma limit, więc `loadBoundaryData` nie znajdzie `unsized` i rzuci w `beforeAll` (job `smoke` czerwony). Opakowania bez limitu potrzebują tylko testy „zapisuje 100000” (`tests/api/kit-input.test.ts:153` i `:333`); reszta użyć `unsized` działa na dowolnym aktywnym opakowaniu.

Opcje:

- (a) dodać do obu fixtur jedno aktywne opakowanie bez limitu (np. „100 ml” bez `count`) — dotyka danych CI rejestru, sprawdzić `registry-import-check.mjs`, testy rpl, `ui-shots`;
- (b) przenieść bramkę `test:api` na koniec fazy 2 (po zdjęciu limitu z API test 100000 przechodzi na każdym opakowaniu, `unsized` = dowolne aktywne opakowanie).

Dodatkowo: wspólna lokalna baza ma pełny rejestr bez wycofanych opakowań, więc `test:api` lokalnie wymaga `db reset` + import v1, v1, v2 (zgoda koordynatora).

## Decyzja (2026-11-17)

Wybrano (b): bramka 1.4 (`test:api`) przechodzi na koniec fazy 2 i jest sprawdzana razem z 2.6. W fazie 2 `unsized` w `tests/api/helpers.ts` bierze dowolne aktywne opakowanie (test 100000 przechodzi, bo API nie ma już limitu opakowania). Fixtury CI bez zmian.

## Testy ręczne 1.5 i 1.6 (2026-11-17, lokalnie, port 4331)

Playwright na koncie testowym, pełny rejestr w lokalnej bazie:

- Oxbryta (1 butelka 90 tabl.): pole ilości „z 90 tabl.”, zapis 90, lista „90 z 90 tabl.”.
- Apap 500 mg, opakowanie „12 tabl.”: „z 12 tabl.”, zapis 8, lista „8 z 12 tabl.”.
- Acodin 150 Junior (syrop, 1 butelka 100 ml): „z 1 butelka”, jak przed zmianą.

Po teście usunięto 3 testowe pozycje `kit_items` i 3 konta; `kit_items` = 194 wiersze.

## Dane produkcyjne 1.7 (2026-11-17, autor)

- Zapytanie 1 (pozycje na opakowaniach liczonych teraz w sztukach): brak wierszy. Poprawka danych niepotrzebna.
- Zapytanie 2 (ilość 0): 0 wierszy, 0 użytkowników. Minimum 1 przy dodawaniu i nowy werdykt (faza 3) nie zmieniają istniejących danych.
