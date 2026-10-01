# Kopia Rejestru Produktów Leczniczych w bazie — Plan Brief

> Full plan: `context/changes/registry-copy-load/plan.md`
> Research: `context/changes/registry-copy-load/research.md`

## What & Why

Wczytujemy kopię Rejestru Produktów Leczniczych do Supabase importem, który można powtarzać i który podmienia dane atomowo (F-01, FR-001). Bez własnej kopii nie ma substancji czynnych, a bez nich nie ma podpowiedzi (S-01) ani sprawdzenia leku (S-03).

## Starting Point

Repo nie ma migracji, parsera XML ani kodu importu. Działają logowanie i CI z lokalnym Supabase w jobie `smoke`. Research potwierdził, że RPL publikuje codzienny zrzut XML (ok. 74 MB) pod stałym adresem, a zrzut 2026-09-23 ma 22 909 produktów z unikalnym `id`.

## Desired End State

`npm run registry:import` wczytuje zrzut (z pliku albo prosto z RPL) do czterech tabel z RLS. Każde ponowne uruchomienie kończy się tym samym stanem. Na zrzucie 2026-09-23 daje to 20 258 aktywnych produktów, 25 515 substancji i 71 432 aktywne opakowania. CI pilnuje parsera na mini-zrzutach, a produkcja ma dane wczytane ręcznie uruchamianym workflow.

## Key Decisions Made

| Decision                        | Choice                                                         | Why (1 sentence)                                                                                                      | Source   |
| ------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| Format źródła                   | XML z URL RPL                                                  | Substancje i opakowania są w nim osobnymi elementami, w CSV to sklejony tekst.                                        | Research |
| Zakres produktów                | Ludzkie, także bez substancji                                  | Apteczka domowa nie zawiera leków weterynaryjnych, a lek z importu równoległego (np. Smecta) musi być do znalezienia. | Plan     |
| Wygasłe i zawieszone pozwolenia | Wszystkie, surowe `waznoscPozwolenia` w kolumnie               | Zrzut nie ma flagi wycofania; decyzję o pokazywaniu podejmie S-01.                                                    | Plan     |
| Ponowny import                  | Upsert po `id` i `removed_at` zamiast DELETE                   | Atomowo, a pozycje apteczki (S-02) nigdy nie stracą swojego produktu.                                                 | Plan     |
| Opakowania                      | Wczytywane już w F-01, bez skasowanych                         | FR-003 wymaga wielkości opakowania z rejestru; parser czyta plik raz.                                                 | Plan     |
| Produkcja                       | Ręczny workflow (`workflow_dispatch`)                          | S-07 dopisze tylko `schedule`.                                                                                        | Plan     |
| Weryfikacja                     | Mini-zrzuty v1/v2 importowane w CI                             | Parser, migracja i powtarzalność są sprawdzane przy każdym PR.                                                        | Plan     |
| Połączenie z bazą               | `pg` z `DATABASE_URL`, pooler w trybie session na produkcji    | Tylko bezpośrednie połączenie daje transakcję; runnery Actions nie mają IPv6.                                         | Plan     |
| Bezpiecznik                     | Przerwanie przy < 90% aktywnych produktów lub starszym zrzucie | Obcięty zrzut nie może oznaczyć rejestru jako usuniętego.                                                             | Plan     |

## Scope

**In scope:**

- Migracja z tabelami `registry_products`, `registry_product_substances`, `registry_packages`, `registry_imports` i RLS tylko do odczytu dla `authenticated`.
- Strumieniowy parser i skrypt `registry:import` (`--file`, `--dry-run`, pobieranie z URL).
- Mini-zrzuty, skrypt sprawdzający i kroki w jobie `smoke`.
- Workflow `registry-import.yml` (ręczny) oraz dokumentacja w README, AGENTS i ci-check.

**Out of scope:**

- Harmonogram, alert o nieudanym imporcie, data w UI (S-07).
- Indeksy wyszukiwania (S-01), normalizacja pisowni substancji (S-03/S-06).
- Leki weterynaryjne, producenci, materiały edukacyjne, automatyczne migracje na produkcji.

## Architecture / Approach

Źródło (plik albo `fetch` z RPL) trafia do parsera `saxes`, który produkuje strumień rekordów produktów. Rekordy są wsadowo wstawiane do tabel tymczasowych w jednej transakcji Postgresa. Potem działają bezpieczniki, upsert, oznaczenie `removed_at` dla brakujących, podmiana substancji i wpis do `registry_imports`. Wtedy następuje COMMIT. Błąd w dowolnym miejscu oznacza rollback, a odczyty w trakcie importu nie są blokowane.

## Phases at a Glance

| Phase                         | What it delivers                                             | Key risk                                                          |
| ----------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| 1. Schemat bazy               | 4 tabele z RLS w migracji                                    | Model danych, który S-01–S-03 będą musiały zmieniać               |
| 2. Parser i skrypt importu    | `npm run registry:import`, pełny zrzut lokalnie, mini-zrzuty | Czas i pamięć przy 74 MB; poprawność dekodowania                  |
| 3. CI, workflow, dokumentacja | Kontrola w CI, ręczny import na produkcji                    | Connection string poolera i `db push` na produkcję (kroki ręczne) |

**Prerequisites:** Docker z lokalnym Supabase. Lokalny zrzut z 2026-09-23 w `C:\Users\MiG\Desktop\10xDevs docs\RPL\`. Dostęp do panelu Supabase (connection string) i ustawień sekretów repo.
**Estimated effort:** ~2–3 sesje po godzinach, 3 fazy.

## Open Risks & Assumptions

- RPL może zmienić format. Wersja jest w URL i namespace, a import przerywa się przy niezgodności zamiast wgrywać śmieci.
- Próg 90% zakłada, że rejestr nie kurczy się o ponad 10% z dnia na dzień. Przy uzasadnionym spadku trzeba będzie świadomie poluzować bezpiecznik.
- Produkty z `removed_at` zostają w bazie na stałe. Przy kilkuset rocznie nie jest to problem.

## Success Criteria (Summary)

- Pełny zrzut daje w bazie 20 258 aktywnych produktów z substancjami i opakowaniami, a powtórzenie importu niczego nie psuje.
- Uszkodzony lub obcięty zrzut nie zmienia danych.
- Produkcyjna baza ma rejestr wczytany jednym kliknięciem w GitHub Actions.
