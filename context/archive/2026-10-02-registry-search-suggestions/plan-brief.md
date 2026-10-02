# S-01: Wyszukiwanie leku w rejestrze z podpowiedziami — Plan Brief

> Full plan: `context/changes/registry-search-suggestions/plan.md`
> Research: `context/changes/registry-search-suggestions/research.md`

## What & Why

Zalogowany użytkownik wpisuje pierwsze litery i dostaje podpowiedzi z Rejestru Produktów Leczniczych: nazwa z mocą i postacią, najpierw po nazwie produktu, potem po nazwie powszechnej i substancji (FR-002). Ten mechanizm obsłuży później trzy ekrany (S-02, S-03, S-04), więc błąd w nim rozlałby się na cały kamień milowy.

## Starting Point

F-01 wczytało rejestr do bazy (ok. 20 tys. produktów ludzkich, odczyt tylko dla zalogowanych), ale bez żadnego indeksu wyszukiwania. Aplikacja ma tylko logowanie; nie ma endpointów domenowych, serwisów ani wspólnych typów.

## Desired End State

Import rejestru zostawia w bazie gotową listę wariantów leków. Strona `/szukaj` pobiera ją raz (potem z cache przeglądarki do następnego importu) i podpowiada lokalnie, bez sieci przy każdym znaku. Wybór pokazuje kartę wariantu z mocą, postacią, nazwą powszechną i substancjami.

## Key Decisions Made

| Decision                                    | Choice                                                                                                                                                                                                                     | Why (1 sentence)                                                                    | Source                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------- |
| Architektura podpowiedzi                    | Lista w przeglądarce, budowana przez import, serwowana przez endpoint z sesją                                                                                                                                              | Wpisywanie nie zależy od zasięgu w aptece, a lista zawsze odpowiada importowi       | Plan (opcja z Research)   |
| Miejsce budowy listy                        | Funkcja SQL wywoływana w transakcji importu i raz w migracji                                                                                                                                                               | Jeden pisarz, brak okna niespójności, produkcja dostaje listę bez ponownego importu | Plan                      |
| Duplikaty (25% rejestru, import równoległy) | Zwinięte do wariantu nazwa+moc+postać; reprezentant nie-IR, potem najniższe id                                                                                                                                             | Użytkownik nie rozróżnia importerów; czysta lista                                   | Plan (problem z Research) |
| Dopasowanie                                 | Początek słowa, bez wielkości liter i ogonków; poziomy A nazwa od początku, B słowo nazwy, C nazwa powszechna, D substancja; min. 3 znaki, max 20 z komunikatem „Pokazano 20 z N”; kolejność liczona raz po pobraniu listy | Przewidywalne, `max` → Ibum Max, `paracetamol` → Apap                               | Plan                      |
| Kolejne słowa zapytania                     | Mogą trafić w pole poziomu albo w moc/postać                                                                                                                                                                               | `ibuprom 400` i skrót `ibu 400` muszą zawęzić do 400 mg                             | Plan                      |
| Wycofane produkty                           | Ukryte `removed_at`; wygasłe pozwolenie zostaje                                                                                                                                                                            | W domu leżą opakowania leków z wygasłym pozwoleniem                                 | Plan                      |
| Ekran S-01                                  | Nowa chroniona strona `/szukaj` z linkiem z dashboardu                                                                                                                                                                     | Sprawdzalny efekt na telefonie; S-03 ją rozbuduje                                   | Plan                      |
| Wydajność                                   | Sprawdzenia w CI + ręczny pomiar (DevTools Slow 4G/CPU 6x, telefon)                                                                                                                                                        | Realne liczby bez infrastruktury testów wydajności                                  | Plan                      |

## Scope

**In scope:**

- Migracja: tabela `registry_search_list`, funkcja `registry_refresh_search_list()`, RLS i odebrane prawa
- Krok budowy listy w imporcie; sprawdzenia w `registry-import-check.mjs` (też syntetyczne duplikaty)
- `src/types.ts`, serwis listy, `GET /api/registry/search-list` z cache zależnym od wersji
- Czysta funkcja dopasowania, hook, komponent `MedicineSuggest` (ARIA combobox), strona `/szukaj`
- Kroki smoke dla endpointu i strony

**Out of scope:**

- Zapytania do bazy przy każdym znaku, `pg_trgm`/`unaccent`, literówki
- Rozwijanie wariantu do importerów; produkty usunięte z rejestru
- Apteczka, sprawdzenie leku, import CSV, poziomy dopasowania substancji, data rejestru na ekranie (S-02…S-07)
- Runner testów jednostkowych, limit rozmiaru w CI, service worker

## Architecture / Approach

Import (transakcja) → `registry_refresh_search_list()` → `registry_search_list.payload` (tekst JSON, wersja podbijana przy każdym przebudowaniu) → `GET /api/registry/search-list?v=<wersja>` (sesja, `immutable` przy zgodnej wersji) → hook `useRegistrySearchList` buduje indeks raz → `searchVariants()` przy każdym znaku → `MedicineSuggest` → karta wariantu na `/szukaj`.

## Phases at a Glance

| Phase                        | What it delivers                                           | Key risk                                                          |
| ---------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| 1. Lista podpowiedzi w bazie | Lista budowana przez import i migrację, sprawdzona w CI    | Uprawnienia do funkcji; migracja produkcyjna wymaga zatwierdzenia |
| 2. Endpoint i serwis         | Lista dostępna po zalogowaniu, cache do następnego importu | Rozmiar odpowiedzi większy niż szacowany                          |
| 3. Wyszukiwanie i `/szukaj`  | Podpowiedzi lokalne, karta wariantu, pomiar na telefonie   | Płynność wpisywania na słabym CPU; dostępność komponentu          |

**Prerequisites:** F-01 (done); Docker z lokalnym Supabase do weryfikacji; dostęp do `supabase db push` na produkcję.
**Estimated effort:** ~3 sesje po godzinach, po jednej na fazę.

## Open Risks & Assumptions

- Rozmiar listy z nazwami powszechnymi i substancjami szacowany na 150–300 KB po kompresji — niezmierzony w tym kształcie.
- Czas gotowości listy na ośmioletnim telefonie niezmierzony; NFR wymaga tam używalności, nie 3 s.
- Reprezentant wariantu może się zmienić po imporcie; S-03 musi porównywać po kluczu wariantu w bazie, nie po `id`.

## Success Criteria (Summary)

- Zalogowany użytkownik na telefonie znajduje lek po początku nazwy, nazwie powszechnej lub substancji, a `ibuprom 400` odróżnia Ibuprom Max od Ibuprom.
- Duplikaty z importu równoległego nie zaśmiecają listy.
- Po pobraniu listy podpowiedzi działają bez sieci; każdy import odświeża listę bez ręcznych kroków.
