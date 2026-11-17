# Jednoznaczna ilość w apteczce — Plan Brief

> Full plan: `context/changes/kit-quantity-semantics/plan.md`
> Research: `context/changes/kit-quantity-semantics/research.md`

## What & Why

Ilość leku w apteczce ma znaczyć zawsze to, co użytkownik liczy — sztuki — także dla opakowań, które rejestr opisuje liczbą jednostek („1 butelka po 90 tabl.”). Dziś Oxbryta przyjmuje najwyżej 1 (butelkę), a „12 tabl.” nie ma limitu, więc ta sama kolumna znaczy co innego zależnie od leku. Przy okazji puste opakowanie przestaje dawać werdykt „Masz ten lek” (F10 z audytu 2026-11-16).

## Starting Point

`packQuantity` (`src/lib/kit-format.ts`) bierze limit z `count` jedynego wpisu `units` i ignoruje `capacity`; trzy endpointy odrzucają ilość ponad ten limit (400), import blokuje wiersz. Ilość 0 jest dozwolona wszędzie, a `checkVerdict` liczy puste opakowania jak pełne.

## Desired End State

Formularz, import, lista, panel edycji i wynik sprawdzenia pokazują ilość w sztukach („8 z 12 tabl.”, „90 z 90 tabl.”) dla opakowań liczonych w sztukach. Ilość ponad opakowanie zapisuje się z ostrzeżeniem. Pustego opakowania nie da się dodać; zużycie do 0 pyta o usunięcie, a zostawione puste opakowanie nie daje „Masz ten lek”, tylko stoi w sekcji „Puste opakowania”.

## Key Decisions Made

| Decision                     | Choice                                                                                            | Why (1 sentence)                                                               | Source          |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------- |
| Co znaczy ilość              | Sztuki, gdy `capacity_unit` liczy się w sztukach (tabl., kaps., szt., pastylki, plastry, Systemy) | Użytkownik liczy tabletki, nie butelki                                         | Plan            |
| Dawki i ml/g                 | Bez zmian (stara reguła)                                                                          | Liczenie dawek inhalatora jest niepewne; autor może zostawić notatkę (później) | Plan            |
| Mechanizm                    | Reguła w TS (`packQuantity`), bez kolumny                                                         | Jedno źródło limitu dla wszystkich warstw, bez migracji danych                 | Research / Plan |
| „12 tabl.” bez `count`       | Limit = `capacity`, jednostka z rejestru                                                          | Ten sam opis co przy opakowaniach z `count`                                    | Plan            |
| Ilość ponad opakowanie       | Ostrzeżenie, nie blokada (do 100000)                                                              | Blister 12 → 14 to realny przypadek                                            | Plan            |
| Puste opakowanie w werdykcie | Nie liczy się; osobna sekcja „Puste opakowania”                                                   | Zużyty lek to nie „masz ten lek”                                               | Plan            |
| Zapis 0 na liście / w panelu | Pytanie „Usunąć z apteczki?”; „Anuluj” zostawia 0                                                 | Zużyty lek powinien zniknąć, ale decyzja należy do użytkownika                 | Plan            |
| 0 przy dodawaniu             | Zablokowane (formularz, API, import)                                                              | Nie dodaje się pustego opakowania                                              | Plan            |
| Zmiana plików werdyktu       | Minimalna, osobna funkcja i komponent, bez zmian sygnatur                                         | S-06 zmienia te same pliki i merguje po S-12                                   | Koordynator     |

## Scope

**In scope:**

- Reguła sztuk w `packQuantity` i jej testy
- Usunięcie 400 „Quantity exceeds the pack size”, ostrzeżenie w polach ilości i imporcie
- Migracja z samym komentarzem `kit_items.quantity`
- Minimum 1 przy dodawaniu, pytanie o usunięcie po zapisie 0
- Werdykt bez pustych opakowań + sekcja „Puste opakowania”
- PRD v3, roadmapa, AGENTS.md

**Out of scope:**

- Nowa kolumna jednostki, zmiana danych `kit_items`
- Zmiana SQL `medicine_check` i kształtu RPC
- Sztuki dla dawek i jednostek miary
- Werdykt „wszystkie przeterminowane” (S-08)
- Pole notatki przy leku

## Architecture / Approach

`packQuantity` jest jedynym źródłem limitu i jednostki dla API, formularza, importu, listy, panelu edycji i `formatQuantity`, więc zmiana reguły w jednym miejscu przechodzi wszędzie. API zostaje przy zod (`MAX_QUANTITY`) i traci sprawdzenie limitu opakowania; UI liczy ostrzeżenie z tego samego `packQuantity`. Werdykt filtruje puste opakowania w TS, bez zmiany RPC.

## Phases at a Glance

| Phase                                          | What it delivers                                                                    | Key risk                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1. Ilość w sztukach                            | Nowa reguła limitu i jednostki, poprawione testy i granice testów API               | Wiersze na produkcji, którym zmienia się znaczenie ilości |
| 2. Ostrzeżenie zamiast blokady                 | Ilość ponad opakowanie zapisana z ostrzeżeniem; migracja komentarza                 | Testy API przypięte do 400                                |
| 3. Puste opakowanie i dokumentacja (2 commity) | Min 1 przy dodawaniu, pytanie o usunięcie, werdykt bez pustych, PRD/roadmapa/AGENTS | Konflikt z S-06 w plikach werdyktu                        |

**Prerequisites:** S-02, S-04 (gotowe); zgoda koordynatora na testy na wspólnej bazie i serwer na porcie 4331.
**Estimated effort:** ~3 sesje, po jednej na fazę.

## Open Risks & Assumptions

- Produkcja może mieć wiersze z ilością w butelkach na opakowaniach liczonych teraz w sztukach — autor sprawdza SELECT-em przed merge (faza 1).
- `Systemy` / `Systemów` (plastry transdermalne) liczone w sztukach — założenie, łatwe do cofnięcia w stałej.
- S-06 rebase'uje się na S-12 w `medicine-check-verdict.ts` i `MedicineCheckResult.tsx`.

## Success Criteria (Summary)

- Oxbryta przyjmuje 90 tabletek, a lista pokazuje „90 z 90 tabl.”.
- Ilość 14 w blistrze 12 zapisuje się z ostrzeżeniem.
- Zużyty lek prowadzi do pytania o usunięcie i nie daje „Masz ten lek”.
