# Ostrzeżenie o kończącej się dacie ważności — Plan Brief

> Full plan: `context/changes/expiry-warning/plan.md`
> Research: `context/changes/expiry-warning/research.md`

## What & Why

S-08 (FR-014): użytkownik ma zobaczyć, że lek niedługo straci ważność — razem z datą — na liście apteczki i przy wyniku sprawdzenia. Przy okazji zamykamy otwarte pytanie z roadmapy (F4, F10): dziś opakowanie przeterminowane daje zielone „Masz ten lek”, a czytnik ekranu nic o tym nie mówi.

## Starting Point

Data jest zapisywana z dokładnością do miesiąca (ostatni dzień miesiąca) i pokazywana przez jeden komponent `KitItemDetails` w obu widokach, który dopisuje tylko „· przeterminowany”. Werdykt `checkVerdict` nie patrzy na datę; od S-12 pomija tylko puste opakowania.

## Desired End State

Przy dacie w bieżącym lub następnym miesiącu wiersz mówi „· kończy się ważność”, a lista `/apteczka` ma nad sobą podsumowanie („Kończy się ważność: 2 opakowania · Przeterminowane: 1 opakowanie”). Gdy wszystkie opakowania sprawdzanego leku są przeterminowane, werdykt jest czerwony: „Masz ten lek, ale przeterminowany”; przy mieszanych zielony licznik liczy tylko ważne, a czytnik ogłasza liczbę przeterminowanych.

## Key Decisions Made

| Decision                                           | Choice                                                                                            | Why (1 sentence)                                                                                                  | Source                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Próg ostrzeżenia                                   | Bieżący i następny miesiąc kalendarzowy (18.11.2026: 11/2026 i 12/2026)                           | Daty są miesięczne, więc liczenie w miesiącach zgadza się z tym, co widzi użytkownik, i daje 1–2 miesiące zapasu. | Plan                      |
| Wszystkie pasujące opakowania leku przeterminowane | Nowy werdykt „Masz ten lek, ale przeterminowany”, czerwony (`bg-destructive/10 text-destructive`) | Zielony kolor sugerował, że nie trzeba kupować; czerwony odróżnia się od żółtego werdyktu substancji.             | Plan                      |
| Przypadek mieszany                                 | Zielone „Masz ten lek · N”, N liczy tylko ważne; przeterminowane na końcu sekcji „W apteczce”     | Licznik mówi o tym, czego można użyć, a nic nie znika z widoku.                                                   | Plan                      |
| Wszystkie ważne opakowania w progu                 | Werdykt bez zmian, szczegół „Ważność kończy się MM/RRRR” (ogłaszany)                              | FR-014 widoczne przy werdykcie bez kolejnego stanu.                                                               | Plan                      |
| Werdykt substancji z przeterminowanymi             | Tytuł i kolor bez zmian, dopisek „ · wszystkie przeterminowane” / „ · ważność kończy się MM/RRRR” | Informacja słyszalna bez piątego stanu werdyktu.                                                                  | Plan                      |
| Czytnik ekranu                                     | Zdanie „Przeterminowane opakowania w apteczce: N”                                                 | Wzorem zdania o pustych opakowaniach z S-12.                                                                      | Research (precedens S-12) |
| Lista apteczki                                     | Oznaczenie w wierszu + podsumowanie nad listą                                                     | Przegląd przed wizytą u lekarza na pierwszy rzut oka.                                                             | Plan                      |
| Nieznana data                                      | Bez ostrzeżenia, liczy się jako ważna                                                             | Tak jak dziś nigdy nie jest „przeterminowana”.                                                                    | Research                  |
| Zmiany w bazie / API                               | Brak                                                                                              | Wszystkie potrzebne dane i `today` są już w kliencie.                                                             | Research                  |

## Scope

**In scope:**

- `expiryStatus` i `packCount` w `src/lib/kit-format.ts`, reguła w `checkVerdict(result, today)`
- Oznaczenie w `KitItemDetails`, czerwony werdykt i zdanie czytnika w `MedicineCheckResult`, podsumowanie w `KitList`
- Testy unit, komponentów, stała data w `tests/db`, nowe stany `ui:shots`

**Out of scope:**

- Baza, RPC, API, precyzja dzienna daty, powiadomienia, sortowanie listy po dacie
- Pliki współdzielone z S-15 (`global.css`, `Layout.astro`, `ui-scan.mjs`, `AGENTS.md`)

## Architecture / Approach

Czysta funkcja stanu daty (`expired` / `expiring` / `valid` / `unknown`) w `kit-format.ts` zasila trzy miejsca: wiersz pozycji, podsumowanie listy (liczone z `items` i `today` w wyspie, więc aktualne po edycji) i `checkVerdict`, który po odrzuceniu pustych dzieli niepuste opakowania na ważne i przeterminowane. Testy bazy dostają stałą datę, żeby nie zależały od dnia.

## Phases at a Glance

| Phase                       | What it delivers                                                  | Key risk                                           |
| --------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| 1. Reguła (TDD)             | `expiryStatus`, nowy `checkVerdict` z testami unit                | Zmiana sygnatury `checkVerdict` dotyka testów bazy |
| 2. Widoki (TDD komponentów) | Oznaczenie, czerwony werdykt, zdanie czytnika, podsumowanie listy | Kontrast czerwonego werdyktu                       |
| 3. Weryfikacja              | `ui:shots`, `test:db`, testy ręczne na :4331                      | Baza lokalna tylko za zgodą koordynatora           |

**Prerequisites:** S-03 i S-05 zrobione; `.env` / `.dev.vars` w worktree i zgoda koordynatora na bazę przed fazą 3.
**Estimated effort:** ok. 1–2 sesje, 3 fazy.

## Open Risks & Assumptions

- Kontrast `text-destructive` na `bg-destructive/10` zakładamy wystarczający (AA); sprawdzić na zrzutach, przy problemie potrzebny token w `global.css` (uzgodnienie z S-15).
- Podsumowanie liczy także puste opakowania po dacie — można zmienić przy przeglądzie.

## Success Criteria (Summary)

- Na liście i przy wyniku sprawdzenia widać „kończy się ważność” z datą dla bieżącego i następnego miesiąca.
- Przeterminowany lek nie daje już zielonego „Masz ten lek”, a czytnik ekranu słyszy o przeterminowanych opakowaniach.
