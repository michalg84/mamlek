# Plan Brief: S-04 Import apteczki z CSV

> Skrót planu `plan.md` — do szybkiego przeglądu przed `/10x-implement`.

## What & Why

Użytkownik z szufladą pełną leków nie wpisze ich po jednym. Robi zdjęcie, zewnętrzny czat AI zamienia je na CSV według naszego promptu, a aplikacja przypisuje każdy wiersz do rekordu rejestru. Zasada PRD „nigdy nie zgadujemy leku” oznacza, że niepewne wiersze czekają na decyzję użytkownika i nic nie trafia do apteczki bez zatwierdzenia (FR-007, FR-008, FR-009, US-02).

## Starting Point

- Dodawanie ręczne działa: `KitAddForm` (wybór wariantu, potem opakowania) i `POST /api/kit`, które dodaje jedną pozycję.
- Wyszukiwanie wariantów działa w Web Workerze (`searchVariants`), ale obsługuje jedno zapytanie naraz.
- Nie ma parsera CSV, endpointu zbiorczego ani ekranu importu. Baza zostaje bez zmian.

## Desired End State

- Link „Importuj z CSV” na `/apteczka` prowadzi do `/apteczka/import`.
- Krok 1: format, prompt do skopiowania, wklejenie tekstu albo plik.
- Krok 2: wiersze stronami po 30. Każdy jest przypisany automatycznie albo czeka na wybór, poprawę lub decyzję („już masz”, „powtórzony w imporcie”).
- Każda strona zapisuje się osobno i atomowo. Import można przerwać, a zapisane strony zostają.
- Na końcu `/apteczka?zaimportowano=N` pokazuje „Dodano N leków z importu”.

## Key Decisions

| Decyzja                  | Wybór                                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatyczne przypisanie | Tylko gdy zapytanie nazwa + moc + postać daje dokładnie 1 trafienie. Zapytania zastępcze (nazwa + moc, sama nazwa) dają tylko propozycje, do 5 |
| Opakowanie               | Przy jednym opakowaniu wybierane samo. Przy kilku wiersz czeka na wybór                                                                        |
| „Już masz”               | Ten sam wariant (nazwa, moc, postać, bez wielkości liter) niezależnie od opakowania. Wymaga decyzji: dodaj osobno albo usuń z importu          |
| Format CSV               | `nazwa;moc;postac;waznosc;ilosc`, średnik. Data `MM.RRRR` (przyjmowane też `DD.MM.RRRR`, `RRRR-MM`), zapis z dokładnością do miesiąca          |
| Zła wartość              | Wiersz blokuje stronę do poprawy albo świadomego wyczyszczenia. Pusta komórka to od razu „nieznane”                                            |
| Ekran                    | Osobna strona `/apteczka/import`, jedna wyspa React, stan tylko w pamięci strony                                                               |
| Zapis                    | Strony po 30. `POST /api/kit/import` przyjmuje 1–30 pozycji i zapisuje wszystkie albo żadnej                                                   |
| Limit                    | 200 wierszy w pliku                                                                                                                            |
| Powtórzenia w pliku      | Drugi i kolejny wiersz tego samego wariantu dostaje „powtórzony w imporcie” i wymaga decyzji                                                   |

## Scope

**W zakresie:** parser i reguły (czyste funkcje), endpoint zapisu strony, dopasowanie wielu wierszy w workerze, ekran importu, testy unit, komponentu i API, `ui:scan` GUARDED, wpis w AGENTS.md.

**Poza zakresem:** OCR i wywoływanie AI z aplikacji, wznawianie przerwanego importu, klucz idempotencji, dzienna dokładność daty, edycja zapisanych pozycji (S-05), migracje, odświeżenie `test-plan.md` (osobno przez `/10x-test-plan --refresh`).

## Architecture

```
tekst CSV ─► parseKitCsv ─► ParsedRow[] ─► rowQueries ─► worker "match" ─► RowMatch[]
                                                                │
   kitVariantKeys (z serwera) ──► rowIssues / pageOf ◄──────────┘
                                         │
                       KitImport (krok 2, strona 30) ─► POST /api/kit/import ─► kit_items
```

## Phases at a Glance

| Faza | Co                                                                                         | Równolegle |
| ---- | ------------------------------------------------------------------------------------------ | ---------- |
| 1    | Logika importu: parser CSV, reguły przypisania, „już masz”, powtórzenia, blokady, strony   | z fazą 2   |
| 2    | `POST /api/kit/import` (1–30, atomowo), `getPackages` / `addKitItems`, test:api, AGENTS.md | z fazą 1   |
| 3    | Wiadomość `match` w workerze, hook `useRegistryMatch`, `npm run perf`                      | po 1       |
| 4    | Ekran `/apteczka/import`, link i komunikat na `/apteczka`, testy komponentu, ui:scan       | po 1–3     |

**Prerequisites:** lokalny Supabase z zaimportowanymi fiksturami rejestru (v1, v1, v2) do `test:api` i `smoke`, Playwright Chromium do `npm run perf`.

**Estimated effort:** 4 fazy. Najwięcej pracy wymaga faza 4 (ekran z wieloma stanami wiersza).

## Open Risks

- **Podwójny zapis strony:** jeśli odpowiedź zginie po zapisie, ponowienie doda stronę drugi raz. Ekran prosi o sprawdzenie apteczki przed ponowieniem. Przyjęte ryzyko, bez klucza idempotencji.
- **Wydajność:** zapas na profilu slow to ok. 350 ms. Zmiana workera jest wspólna z `/szukaj`, więc w fazie 3 trzeba zmierzyć `npm run perf`.
- **Pamięć na słabym telefonie:** ręczna poprawa wiersza montuje drugi worker z indeksem, ale tylko jeden naraz.
- **Jakość CSV z czatu:** czat może dodać komentarz albo ogrodzenie kodu. Parser pomija ogrodzenie, a wiersz z inną liczbą pól pokazuje się jako błędny, nie znika.

## Success Criteria

- Każdy wiersz CSV jest widoczny na ekranie zatwierdzenia. Nic nie znika po cichu.
- Wiersz bez dopasowania, bez opakowania, ze złą wartością albo bez decyzji „już masz” / „powtórzony” blokuje zapis swojej strony z widocznym powodem.
- Nic nie trafia do apteczki przed zapisem strony. Strona zapisuje się w całości albo wcale.
- Brak daty lub ilości wyświetla się jako „nieznane”.
- Testy unit, komponentu i `test:api` są zielone, `npm run perf` nie pokazuje regresji, ręczny przebieg na telefonie z prawdziwym CSV przechodzi.
