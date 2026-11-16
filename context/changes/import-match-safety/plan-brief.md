# Import match safety — Plan Brief

> Full plan: `context/changes/import-match-safety/plan.md`
> Audit: `context/audits/prd-conformance/2026-11-16.md` (F1, F2, F3)

## What & Why

Import CSV przypisuje dziś lek bez kliknięcia w przypadkach, które PRD nazywa zgadywaniem: wiersz z samą nazwą, której wyszukanie daje jedno trafienie, albo wiersz, którego jedyne trafienie ma inną nazwę handlową (`Ibuprom; 400 mg; tabletki drażowane` → „Ibuprom Max”). Do tego wiersz z otwartym „Zmień” ukrywa stary lek, a zapis strony i tak go zapisuje. Zaostrzamy regułę i blokujemy zapis w trybie edycji, bo PRD mówi: „przy braku pewnego wskazania aplikacja pyta zamiast strzelać”.

## Starting Point

`matchRow` (`src/lib/kit-import.ts`) daje `auto`, gdy pierwsze zapytanie zwraca jedno trafienie, a dla wiersza bez mocy i postaci pierwszym zapytaniem jest sama nazwa. Worker dostaje same zapytania, więc nie zna nazwy wiersza ani tego, czy wiersz był pełny. `ImportReview` blokuje zapis tylko na podstawie `rowIssues`, które nie znają trybu edycji.

## Desired End State

Lek przypisuje się sam tylko pełnemu wierszowi (nazwa, moc, postać), gdy pierwsze zapytanie daje jeden wariant o tej samej nazwie. Pod lekiem stoi wtedy „Przypisano automatycznie — jedyny lek w rejestrze o tej nazwie, mocy i postaci”. Każdy inny wiersz pokazuje propozycje. Wiersz po „Zmień” pokazuje „Obecnie: <lek>” i blokuje zapis strony z powodem „dokończ wybór leku albo anuluj”, dopóki użytkownik nie wybierze leku albo nie kliknie „Anuluj”.

## Key Decisions Made

| Decision                   | Choice                                                              | Why (1 sentence)                                                                                        | Source |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------ |
| Kiedy `auto` (F1 + F2)     | Pełny wiersz + 1 trafienie pierwszego zapytania + równa nazwa       | Import jest zwykle jednorazowy, dodatkowe kliknięcia nie przeszkadzają, a lek nigdy nie jest zgadywany. | Audyt  |
| Równość nazwy              | Słowa po normalizacji wyszukiwarki („NO-SPA” = „No Spa” = „No-Spa”) | Ta sama reguła co w wyszukiwarce; odporna na zapis z czatu AI, a „Nospa” ≠ „No-Spa” zostaje propozycją. | Plan   |
| Napis przy `auto`          | „jedyny lek w rejestrze o tej nazwie, mocy i postaci”               | Mówi wprost, na jakiej podstawie przypisano.                                                            | Plan   |
| Tryb edycji (F3)           | Blokada zapisu + „Obecnie: <lek>”                                   | Nie da się zapisać leku, którego nie widać; kontrakt S-10.                                              | Plan   |
| Skąd `matchRow` zna wiersz | Żądanie `{ queries, exactName }` w protokole workera                | Jawny kontrakt zamiast wnioskowania z liczby zapytań.                                                   | Plan   |
| Gdzie powód trybu edycji   | Dokłada go `ImportReview`, `rowIssues` bez stanu UI                 | `ImportReview` już trzyma `editing`; logika w `src/lib` zostaje czysta.                                 | Plan   |

## Scope

**In scope:**

- Reguła `matchRow`, porównanie nazw `sameName`, nowy kształt żądania `match` (typy, worker, hook, fake worker, testy).
- Napis przy `auto`, blokada i „Obecnie: …” w trybie edycji.
- Doprecyzowanie FR-009 w PRD.

**Out of scope:**

- Dokładna zgodność mocy i postaci (dalej prefiksowa; test przypina granicę).
- Zmiany `searchVariants`, `normalizeText`, `wordsOf`, zapytań zastępczych, API i bazy.
- Krok ręczny 4.5 z S-04 (import prawdziwego CSV).

## Architecture / Approach

`KitImport` buduje dla każdego wiersza żądanie `{ queries, exactName }` (`exactName` tylko dla pełnego wiersza) i wysyła je do workera. Worker woła `matchRow`, który przy jednym trafieniu pierwszego zapytania porównuje nazwy przez `sameName` z `registry-search.ts`. `ImportReview` dokłada wierszowi w edycji powód `choosing-variant`, więc istniejący licznik i blokada zapisu działają bez zmian.

## Phases at a Glance

| Phase                                        | What it delivers                                             | Key risk                                                                   |
| -------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 1. Reguła automatycznego przypisania (F1+F2) | Ścisłe `auto`, nowy protokół workera, nowy napis, PRD FR-009 | Zmiana kształtu żądania przechodzi przez 6 plików, w tym helper testowy    |
| 2. Blokada zapisu w trybie edycji (F3)       | Powód blokady, „Obecnie: <lek>”, test odtwarzający błąd      | Powód dodany tylko wierszowi z lekiem; wiersz bez leku ma już `no-variant` |

**Prerequisites:** brak; Docker i lokalny Supabase tylko do testu ręcznego.
**Estimated effort:** 1 sesja, 2 fazy po kolei (wspólne pliki `KitImport*`).

## Open Risks & Assumptions

- Moc i postać nadal dopasowują się prefiksowo, więc `tabletki` w wierszu może dać automatycznie wariant `tabletki powlekane` o tej samej nazwie. Przyjęte, przypięte testem.
- Więcej wierszy do kliknięcia przy imporcie list z czatu bez mocy lub postaci. Zaakceptowane przez autora.

## Success Criteria (Summary)

- Żaden wiersz bez mocy lub postaci ani wiersz o innej nazwie niż trafienie nie dostaje leku bez kliknięcia.
- Nie da się zapisać strony z wierszem, w którym otwarto „Zmień” i nie dokończono wyboru.
- Testy jednostkowe i komponentu przypinają obie reguły i czerwienieją po celowym zepsuciu.
