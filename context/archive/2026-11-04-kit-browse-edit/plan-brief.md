# Przegląd i edycja apteczki (S-05) — Plan Brief

> Full plan: `context/changes/kit-browse-edit/plan.md`
> Research: `context/changes/kit-browse-edit/research.md`

## What & Why

Na `/apteczka` użytkownik może przeglądać całą apteczkę, zmieniać i usuwać pozycje oraz poprawiać pozostałą ilość wprost na liście (FR-005). Bez tego pomyłek z importu i zużytych opakowań nie da się poprawić, a wynik sprawdzenia leku z czasem przestaje odpowiadać szufladzie.

## Starting Point

Lista jest dziś renderowana na serwerze i tylko pokazuje pozycje. Nie ma tras edycji ani usuwania, znacznika „przeterminowany” ani triggera `updated_at`. Polityki RLS update i delete już istnieją, a `registry_variant_packages` daje opakowania wariantu także dla leku wycofanego.

## Desired End State

Każdy wiersz pokazuje te same szczegóły co wynik sprawdzenia. Ilość zmienia się polem z „Zapisz” w wierszu. „Edytuj” pozwala zmienić opakowanie na inne tego samego leku, ilość i datę, a „Usuń” prosi o potwierdzenie. Puste opakowanie (0) jest oznaczone i ma propozycję usunięcia. Cudza pozycja daje 404, a wszystkie komunikaty są po polsku.

## Key Decisions Made

| Decision            | Choice                                                       | Why (1 sentence)                                                     | Source          |
| ------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- | --------------- |
| Kolejność z S-12    | S-05 teraz, semantyka ilości w S-12                          | S-12 zmieni pole ilości w obu miejscach naraz                        | Plan            |
| Ilość 0             | Dozwolona, wiersz „Opakowanie puste” + „Usuń”                | Zużyte opakowanie to częsty stan, a usunięcie to decyzja użytkownika | Plan            |
| Zakres edycji       | Ilość, data i opakowanie w obrębie wariantu                  | Pozwala poprawić pomyłkę wielkości opakowania bez usuwania           | Plan            |
| Usuwanie            | Okno potwierdzenia (shadcn `alert-dialog`)                   | Nie ma undo, a pomyłka kasuje dane                                   | Plan            |
| Ilość na liście     | Pole + „Zapisz” w wierszu, pesymistycznie                    | Jedna zmiana = jedno świadome żądanie; wiersz pokazuje zapisany stan | Plan            |
| Wiersz              | Wspólny `KitItemDetails` z wynikiem sprawdzenia              | To samo opakowanie wygląda tak samo w obu widokach (F10)             | Plan / Research |
| PATCH               | Brak klucza = bez zmian, `null` = wyczyść, puste body 400    | Zapis samej ilości nie może skasować daty                            | Plan            |
| Wycofane opakowanie | Limit z zapisanego opakowania bez filtra `removed_at`        | Inaczej wycofanej pozycji nie da się poprawić                        | Research        |
| `test:api` a baza   | Jeden wiersz SQL-em na koncie testowym (wyjątek w AGENTS.md) | Pozycji na wycofanym opakowaniu nie da się założyć przez HTTP        | Plan            |
| Lista               | Brak limitu i stronicowania (F4)                             | Apteczki domowe są małe                                              | Research        |
| `updated_at`        | Trigger `security invoker` w nowej migracji (F6)             | Edycja sprawia, że kolumna musi się zmieniać                         | Research        |

## Scope

**In scope:**

- `PATCH` i `DELETE /api/kit/[id]`, trigger `updated_at` i `productId` w `KitItem`
- Wyspa `KitList` z polem ilości, „Opakowanie puste”, usuwaniem i panelem „Edytuj”
- Wspólny `KitItemDetails` (także w wyniku sprawdzenia) ze znacznikiem „przeterminowany”
- Testy: `test:api`, `test:db`, komponenty, unit, smoke; AGENTS.md i `test-plan.md`

**Out of scope:** semantyka ilości S-12, zmiana leku w pozycji, precyzja dzienna w edycji, limit listy, reguła `medicine_check` dla 0, undo, ostrzeżenie S-08, nowy test Playwright, ekran importu.

## Architecture / Approach

Nowa trasa `src/pages/api/kit/[id].ts` powtarza kolejność i styl `POST /api/kit`. Waliduje częściową zmianę schematem wyprowadzonym z `kitItemRequest`, sprawdza nowe opakowanie przez `registry_variant_packages` i zwraca zapisany `KitItem`. Cudzy wiersz daje 404, bo RLS go ukrywa, a update czy delete z `.select()` zwraca pusty wynik.

Strona `apteczka.astro` przekazuje pozycje i datę „dziś” (strefa `Europe/Warsaw`) do wyspy `KitList` z `client:load`, renderowanej na serwerze. Wiersz podmienia się na odpowiedź serwera. Pola ilości i daty są wspólne z `KitAddForm`.

## Phases at a Glance

| Phase                                      | What it delivers                                        | Key risk                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1. Baza i API (równolegle z 2)             | Trigger, PATCH/DELETE, testy HTTP i bazy, smoke         | Kasowanie daty przy częściowym PATCH; limit sprawdzany przez `getPackage`                                   |
| 2. Wspólny wiersz i wyspa (równolegle z 1) | `KitItemDetails`, `KitList`, znacznik „przeterminowany” | Zmiana wyglądu wyniku sprawdzenia; rozjazd „dziś” przy hydratacji                                           |
| 3. Ilość i usuwanie                        | Pole + „Zapisz”, „Opakowanie puste”, okno usuwania      | Fokus po usunięciu; zmiana `KitAddForm` przy wydzielaniu pól                                                |
| 4. Panel „Edytuj”                          | Opakowanie wariantu, ilość, data z „Wyczyść”            | Obecne opakowanie wycofane (przypięte „obecne”) albo schowane przez `uniquePacks` (opcja przejmuje jego id) |

**Prerequisites:**

- PR #62 zmergowany (spełnione, `main@33b16d2`).
- Lokalny Supabase z fixture'ami v1, v1, v2.
- Przed merge: `npx supabase db push` na produkcję.

**Estimated effort:** ~3–4 sesje. Fazy 1 i 2 mogą iść równolegle po osobnym commicie z `KitItem.productId`.

## Open Risks & Assumptions

- `Intl.DateTimeFormat` ze strefą `Europe/Warsaw` działa w runtime workerd. Jeśli nie, `today` liczy tylko klient, a SSR renderuje się bez znacznika.
- Każdy przebieg `test:api` nadal zakłada tylko 4 konta (nowe przypadki używają istniejących), więc limit logowań się nie zmienia.
- Puste opakowanie nadal daje werdykt „masz już” w sprawdzeniu leku, zgodnie z decyzją, do ewentualnej zmiany w S-12.

## Success Criteria (Summary)

- Użytkownik poprawia ilość, opakowanie i datę oraz usuwa pozycje na `/apteczka` bez opuszczania listy, a zmiany zostają po odświeżeniu.
- To samo opakowanie wygląda tak samo na liście apteczki i w wyniku sprawdzenia, łącznie ze znacznikiem „przeterminowany”.
- Cudza pozycja jest nieosiągalna (404). Każdy błąd jest po polsku, a `test:api`, `test:db` i smoke pilnują tego w CI.
