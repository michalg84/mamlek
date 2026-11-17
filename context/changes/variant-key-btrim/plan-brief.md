# Variant key btrim — Plan Brief

> Full plan: `context/changes/variant-key-btrim/plan.md`

## What & Why

Klucz wariantu leku (nazwa | moc | postać, bez wielkości liter) zaczyna obcinać spacje na początku i końcu każdej części we wszystkich pięciu miejscach, gdzie się go porównuje. W rejestrze jest pięć leków, których dwa zapisy różnią się tylko spacją na końcu mocy. Dziś sprawdzenie traktuje je jak różne leki: Citrafleet i Cyclo 3 Fort dostają „Nie masz”, a Dermovate, Hepa-Merz 3000 i Tardyferon „ta sama substancja”, choć to ten sam lek. To wycinek S-14 z roadmapy, który ma być zrobiony przed S-06.

## Starting Point

Klucz bez `btrim` porównują: `medicine_check` (`20261010120000_medicine_check.sql`), `registry_refresh_search_list` i `registry_variant_packages` (`20261116120000_withdrawn_medicine_in_kit.sql`), `variantKey` / `kitItemVariantKey` w `src/lib/kit-import.ts` oraz kontrola CI `scripts/registry-import-check.mjs`. Pomiar z 2026-11-17: 23 wartości mocy mają spacje na końcach (nazwa i postać nie mają żadnej, innych białych znaków też nie ma), 5 par się łączy, lista spada z 16 278 do 16 273 wariantów.

## Desired End State

Pozycja apteczki w jednym zapisie i lek sprawdzany w drugim dają werdykt „Masz ten lek”. Lista podpowiedzi ma jeden wpis na taki lek, formularz dodawania pokazuje opakowania obu zapisów, a import CSV rozpoznaje „masz już”. Podwójne spacje w środku wartości zostają bez zmian.

## Key Decisions Made

| Decision            | Choice                                                                         | Why (1 sentence)                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Zakres normalizacji | Tylko `btrim` (spacje na początku i końcu)                                     | Decyzja autora z pytania 7 roadmapy: podwójne i nierozdzielające spacje zostają.                                   |
| Miejsce poprawki    | W kluczu wariantu, nie w danych ani parserze                                   | Dane zostają jak w XML rejestru, a poprawka obejmuje każde porównanie.                                             |
| Liczba migracji     | Dwie: rejestr (lista i opakowania) oraz `medicine_check`                       | `medicine_check` odwołuje się do `kit_items`, a scratchowa baza testu importu stosuje tylko `REGISTRY_MIGRATIONS`. |
| Struktura faz       | Dwie fazy: reguła w bazie i w kliencie razem, potem dokumentacja i weryfikacja | Użytkownik uznał trzy fazy za zbyt drobne.                                                                         |
| Wdrożenie           | Najpierw merge, potem ręczny `db push`                                         | Nowy klient działa też na starej bazie; odwrotna kolejność gubiłaby „masz już” w imporcie.                         |

## Scope

**In scope:**

- Dwie migracje z `lower(btrim(...))` w kluczu i odświeżeniem listy
- `variantKey` / `kitItemVariantKey` z `trim` (przed skróceniem mocy do 80 znaków)
- `btrim` w kontroli CI `registry-import-check.mjs`
- Nowy `tests/db/variant-key.test.ts` i testy jednostkowe klucza (najpierw czerwone)
- AGENTS.md (wdrożenie, rollback, `REGISTRY_MIGRATIONS`), roadmapa (pytanie 7, S-14), nowy golden `search:check`

**Out of scope:**

- Zwijanie podwójnych i nierozdzielających spacji
- Zmiana danych, parsera importu i fikstur XML
- Wyświetlana moc na liście i dopasowanie substancji (S-06)

## Architecture / Approach

Jedna reguła w pięciu miejscach, zmieniona w jednej fazie metodą „test najpierw”. Czerwone testy w bazie (`test:db`, transakcja z wycofaniem) i jednostkowe, potem migracja rejestru (`create or replace` listy i opakowań, dodana do `REGISTRY_MIGRATIONS`, na końcu przeliczenie listy), migracja `medicine_check`, poprawka klienta i kontroli CI. Lokalnie migracje stosuje `npx supabase migration up`, bez resetu, bo baza jest wspólna z sesjami S-06, S-11 i S-12.

## Phases at a Glance

| Phase                                     | What it delivers                                                      | Key risk                                                            |
| ----------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1. Klucz wariantu z btrim (baza i klient) | Pięć par scalonych w sprawdzeniu, liście, opakowaniach i imporcie CSV | `db reset` na wspólnej bazie skasowałby pełny rejestr innym sesjom  |
| 2. Dokumentacja i weryfikacja             | AGENTS.md, roadmapa, golden wyszukiwania, test ręczny                 | Produkcyjny `db push` przed merge rozjechałby klucze w imporcie CSV |

**Prerequisites:** lokalna baza z pełnym rejestrem (jest), branch `fix/variant-key-btrim` przed pierwszym commitem.
**Estimated effort:** jedna krótka sesja, dwie fazy.

## Open Risks & Assumptions

- `String.prototype.trim` obcina więcej rodzajów białych znaków niż `btrim`. W danych są tylko zwykłe spacje (pomiar), więc różnica jest opisana w JSDoc, a nie obsługiwana.
- Inne sesje worktree mogą w tym czasie zmieniać wspólną lokalną bazę. `test:api` i `smoke` uruchamiamy tylko wtedy, gdy tamte sesje ich nie używają.

## Success Criteria (Summary)

- Dermovate i Citrafleet w apteczce w zapisie ze spacją dają w sprawdzeniu „Masz ten lek”.
- Lista podpowiedzi ma 16 273 warianty, a każdy z pięciu leków występuje w niej raz.
- `test:db`, testy jednostkowe i kontrola CI importu przechodzą.
