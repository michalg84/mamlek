# S-10: Formularz dodawania zapomina wybór po zmianie nazwy — Plan Brief

> Full plan: `context/changes/kit-add-form-reset-on-edit/plan.md`
> Frame brief: `context/changes/kit-add-form-reset-on-edit/frame.md`

## What & Why

Początkowe ujęcie było poprawne: `KitAddForm` trzyma wybór leku, który po edycji tekstu przestaje odpowiadać polu, a przycisk „Dodaj do apteczki” działa na tym nieaktualnym wyborze. Autor odtworzył błąd na żywo: do apteczki trafia lek A, choć w polu jest inny tekst. Naprawiamy to i uniemożliwiamy powtórkę.

## Starting Point

`KitAddForm` przekazuje do `MedicineSuggest` tylko `onSelect` (`KitAddForm.tsx:350`), a `onEdit` jest opcjonalny (`MedicineSuggest.tsx:15`). `RegistrySearch` ma ten sam kontrakt poprawnie obsłużony od 2026-10-09. Testu `KitAddForm` nie ma.

## Desired End State

Każda zmiana tekstu w polu „Lek” na `/apteczka` usuwa formularz opakowania razem z wpisaną ilością i datą. Ponowny wybór z podpowiedzi pokazuje formularz wybranego leku. Pominięcie `onEdit` przy `MedicineSuggest` nie przejdzie `astro check`.

## Key Decisions Made

| Decision          | Choice                        | Why                                                                   | Source |
| ----------------- | ----------------------------- | --------------------------------------------------------------------- | ------ |
| Przyczyna         | Brak `onEdit` w `KitAddForm`  | Kod i odtworzenie na żywo zgadzają się                                | Frame  |
| Kontrakt `onEdit` | Wymagany                      | Ten sam błąd zdarzył się już dwa razy; kompilator ma go łapać         | Plan   |
| Warstwa testu     | Tylko test komponentu         | Najtańsza warstwa wg `test-plan.md`; bez e2e                          | Plan   |
| Pola po edycji    | Przepadają zawsze             | Nazwa nie identyfikuje wariantu, jedna prosta reguła jak na `/szukaj` | Plan   |
| Kolejność         | Test czerwony, potem poprawka | Dowód, że test łapie błąd                                             | Plan   |

## Scope

**In scope:** test `KitAddForm.test.tsx`, obsługa ścieżki `/api/registry/packages` w pomocniku fetch, `onEdit` w `KitAddForm`, wymagany `onEdit` w `MedicineSuggest`.

**Out of scope:** test e2e, zachowywanie pól przy tym samym tekście, zmiany w `RegistrySearch`, API i bazie, kolejność mocy (S-11).

## Architecture / Approach

Poprawka po stronie rodzica: `onEdit` zeruje `variant`, a `PackForm` znika, bo renderuje się tylko przy ustawionym `variant`. Następnie typ wymusza przekazanie `onEdit` przy każdym użyciu `MedicineSuggest`.

## Phases at a Glance

| Phase                         | What it delivers                                          | Key risk                                                                   |
| ----------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1. Test regresyjny i poprawka | Test czerwony, potem zielony; formularz znika przy edycji | Pomocnik fetch nie zna ścieżki pakietów; test musi naprawdę edytować tekst |
| 2. Wymagany `onEdit`          | Błąd kompilacji przy pominięciu propa                     | Zmiana typu w komponencie wspólnym z `/szukaj`                             |

**Prerequisites:** brak (S-02 zrobione).
**Estimated effort:** ok. 1 sesja, 2 fazy, bez migracji.

## Open Risks & Assumptions

- Rozszerzenie `stubRoutedFetch` nie może zmienić zachowania istniejących testów `RegistrySearch`.
- Zakładamy, że `KitAddForm` i `RegistrySearch` są jedynymi użytkownikami `MedicineSuggest` (sprawdzone grepem 2026-10-29); S-04 (import CSV) ma użyć tego samego kontraktu.

## Success Criteria (Summary)

- Zmiana, wyczyszczenie i skasowanie litery w polu „Lek” usuwają formularz; nic nie trafia do apteczki bez nowego wyboru.
- Nowy test jest czerwony bez poprawki i zielony z nią; `/ci-check` zielony.
