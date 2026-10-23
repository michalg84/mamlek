# Testy importu rejestru i parsera (ryzyko #7) — Plan Brief

> Full plan: `context/changes/testing-registry-import-scripts/plan.md`
> Research: `context/changes/testing-registry-import-scripts/research.md`

## What & Why

Dowodzimy, że plik rejestru z błędnym, pustym, zduplikowanym lub nieoczekiwanym rekordem albo importuje każdy poprawny produkt nienaruszony, albo kończy się głośnym błędem i wycofaniem (ryzyko #7 w `test-plan.md`). Dziś import ma tylko kontrolę szczęśliwej ścieżki na fixture'ach, a parser kilka miejsc, w których dziwny rekord zmienia sens bez sygnału. Przy okazji zamykamy te miejsca i podpinamy testy do bramek.

## Starting Point

Parser (`scripts/lib/rpl-parser.mjs`) i importer (`scripts/registry-import.mjs`) nie mają testów. Lokalna baza trzyma stan CI (11 produktów po v1, v1, v2), więc import w teście by go zniszczył. Prawdziwy rejestr (migawka 2026-10-21) nie łamie dziś parsera i używa zamkniętych słowników `ludzki`/`weterynaryjny` oraz `TAK`/`NIE`.

## Desired End State

Każdy kształt z listy błędnych plików ma test, który go odrzuca (parser) albo kończy import kodem 1 z bazą bez zmian (importer na osobnej bazie). Poprawne pliki, w tym wycinek prawdziwych produktów i plik ponad 2 000 produktów, trafiają do tabel zgodnie z ręcznie przeczytanym źródłem. Testy działają w `ci`, `smoke`, hooku końca tury i `lint-staged`.

## Key Decisions Made

| Decision                                                                                 | Choice                                                                                                                       | Why                                                                                       | Source   |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------- |
| Ciche kształty parsera                                                                   | Wzmocnić parser: nazwa ze spacji, nierozpoznany lub brakujący `rodzajPreparatu`, nierozpoznane `skasowane` → `RplParseError` | Zamyka dokładnie dziury „po cichu zmienia sens”; słowniki w prawdziwym pliku są zamknięte | Plan     |
| Duplikat id w `--dry-run`, 18 produktów z samą `etykietoUlotka`, brak przycinania spacji | Przypięte testem jako znane zachowanie; ulotki jako pytanie otwarte w roadmapie                                              | To nie błędy integralności importu, tylko brak funkcji lub decyzja produktowa             | Plan     |
| Plik bez produktów                                                                       | Błąd w imporcie i `--dry-run`, także na pustej bazie                                                                         | Dziś na pustej bazie zapisałby pusty stan                                                 | Plan     |
| Uruchomienie importera w teście                                                          | Osobna baza `registry_import_test` + proces potomny (`node scripts/registry-import.mjs --file`)                              | Zero zmian w `importToDatabase`, realne kody wyjścia, nie rusza stanu CI                  | Plan     |
| Oracle i dane                                                                            | XML-e wpisane ręcznie + wycinek ~5 prawdziwych produktów, oczekiwania przepisane ze źródła                                   | Oracle to rekord źródłowy, nie wynik testowanego parsera                                  | Plan     |
| Miejsce w CI                                                                             | Parser: projekt `registry` w `ci`; import: `tests/db/registry-import.test.ts` w `test:db` w `smoke`                          | Szybki feedback dla parsera, import korzysta z gotowego kroku i strażnika hostów          | Plan     |
| Bramki lokalne                                                                           | `lint-staged` dla `*.mjs` i XML, projekt w hooku końca tury                                                                  | Zmiana parsera dostaje lint i testy przy commicie i na końcu tury                         | Plan     |
| Zakres zmiany kodu                                                                       | Tylko `rpl-parser.mjs` i `registry-import.mjs` (puste dane), bez wydzielania `importToDatabase`                              | Minimalny ślad w kodzie produkcyjnym                                                      | Research |

## Scope

**In scope:** zaostrzenie parsera i importu (cztery kształty), projekt Vitest `registry`, testy parsera, testy importera na osobnej bazie, bramki, sprawdzenia mutacyjne, AGENTS.md, `test-plan.md`, pytanie w roadmapie.

**Out of scope:** naprawa 18 ulotek, wykrywanie duplikatów w `--dry-run`, przycinanie spacji, refaktor importera, testy blokady równoległego importu, test na pełnym pliku w CI, Stryker, zmiany w `registry-import-check.mjs` i `registry-import.yml`.

## Architecture / Approach

Dwie warstwy z jednym oracle. Parser to czysta funkcja strumienia tekstu: testy bez bazy. Importer jest uruchamiany jako proces na bazie `registry_import_test` założonej w lokalnym Postgresie z trzema migracjami rejestru; po złym pliku odcisk całej bazy musi być równy odciskowi sprzed importu. Oczekiwane wartości wpisuję ręcznie ze źródła.

## Phases at a Glance

| Phase                             | What it delivers                                                                                                   | Key risk                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 1. Parser — zaostrzenie i testy   | Walidacja trzech atrybutów, projekt `registry`, testy błędów i poprawnych kształtów, wycinek prawdziwych produktów | Zaostrzenie zatrzymałoby dzienny import, gdyby prawdziwy plik miał nieznaną wartość (sprawdzane ręcznym `--dry-run`) |
| 2. Importer — zaostrzenie i testy | Błąd dla pliku bez produktów, testy ~25 przypadków na osobnej bazie, wsad > `BATCH_SIZE`                           | Zaobserwowane zachowanie bazy (SQLSTATE, pusty plik) może różnić się od wniosków z research                          |
| 3. Bramki, mutacje, dokumentacja  | CI, hook, `lint-staged`, 6 mutacji, AGENTS.md, `test-plan.md` §6.5/§6.6                                            | Obciążenie bramek Fazy 4; `*.mjs` w `lint-staged` wymaga czystego lintu istniejących plików                          |

**Prerequisites:** Docker Desktop z działającym lokalnym Supabase (jest), `DATABASE_URL` do lokalnej bazy, prawdziwy `overall.xml` do wycinka (leży w katalogu roboczym poprzedniej sesji lub do pobrania z RPL).
**Estimated effort:** ~3–4 sesje, jedna na fazę plus zamknięcie przez PR.

## Open Risks & Assumptions

- Jedna migawka rejestru (2026-10-21): inne dni mogą mieć inne kształty, więc wycinek nie dowodzi wszystkiego; stąd ręczny `--dry-run` i obserwacja pierwszego dziennego importu po scaleniu.
- Zachowanie bazy dla pustego pliku na pustej bazie, błędów 22003/22008 i komunikatu klucza głównego jest wnioskiem z kodu; test je potwierdzi albo poprawi oczekiwany komunikat (nigdy sukces zamiast błędu).
- Baza testowa zakładana przez `create database … with (force)` zakłada lokalnego superużytkownika; strażnik `connectLocal()` blokuje hosty nielokalne.
- Zaostrzenia wchodzą do produkcyjnego importu bez osobnego wdrożenia.

## Success Criteria (Summary)

- Każdy zły plik z listy kończy import kodem 1 z bazą bez zmian, a poprawne pliki trafiają do tabel zgodnie ze źródłem.
- Sześć mutacji (puste nazwy, `rodzajPreparatu`, `skasowane`, próg 90%, pusty plik, ostatnia partia) jest wykrywanych przez testy.
- PR ma zielone `ci` i `smoke`, a pierwszy dzienny import po scaleniu kończy się sukcesem.
