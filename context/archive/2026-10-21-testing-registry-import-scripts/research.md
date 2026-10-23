---
date: 2026-10-21T14:10:16+02:00
researcher: Claude
git_commit: 4199a1a
branch: main
repository: mamlek
topic: "Faza 5 planu testów (ryzyko #7): jak dowieść, że import rejestru i jego parser zachowują każdy poprawny produkt albo głośno zawodzą"
tags: [research, testing, registry-import, rpl-parser, risk-7]
status: partial
last_updated: 2026-10-21
last_updated_by: Claude
---

# Research: Faza 5 — testy importu rejestru i parsera (ryzyko #7)

**Date**: 2026-10-21T14:10:16+02:00
**Researcher**: Claude
**Git Commit**: 4199a1a (drzewo robocze z niezatwierdzonymi zmianami w `context/`)
**Branch**: main
**Repository**: mamlek

## Research Question

Dla ryzyka #7 z `context/foundation/test-plan.md:64`: plik rejestru z błędnym, pustym, zduplikowanym lub nieoczekiwanym rekordem albo importuje nienaruszony każdy poprawny produkt, albo kończy się głośnym błędem i wycofaniem. Co robi dziś parser (`scripts/lib/rpl-parser.mjs`) i importer (`scripts/registry-import.mjs`), jakie kształty danych ma prawdziwy rejestr, czego nie pokrywają fixture'y, jak istniejąca infrastruktura mogłaby przyjąć testy i które założenia planu trzeba zakwestionować.

## Summary

- **Status `partial`.** Brakuje: odczytów z lokalnej bazy (Docker nie działał, `127.0.0.1:54322` odmówił połączenia), uruchomienia importera na prawdziwej bazie oraz pełnego tekstu błędów Postgresa (zob. Open Questions). Wniosków o zachowaniu bazy nie traktuj jako sprawdzonych, jeśli nie ma przy nich adnotacji „sprawdzone”.
- **Prawdziwy rejestr dziś nie łamie parsera.** Migawka z 2026-10-21 (74 072 625 bajtów, pobrana raz) przechodzi `--dry-run` z kodem 0: 20 293 produktów ludzkich, 25 586 substancji, 71 558 aktywnych opakowań, pominięto 2 647 produktów nieludzkich i 4 104 skasowane opakowania. W tej migawce: 0 pustych `nazwaProduktu`, 0 pustych `nazwaSubstancji`, 0 zduplikowanych lub niepoprawnych id produktów i opakowań (liczone skryptem pomocniczym, poza repozytorium).
- **Fixture'y pokrywają szczęśliwą ścieżkę i kilka zmian v1→v2, a żadnego kształtu ścieżki błędu.** Oba pliki mają po 12 produktów (11 ludzkich + 1 weterynaryjny) i po 1 jednostce opakowania na każde opakowanie; w prawdziwym pliku 1 532 aktywne opakowania ludzkie mają 2–8 jednostek.
- **Parser przechodzi sprawdzenie „głośno albo nienaruszone” w czterech miejscach inaczej, niż zakłada plan** (sprawdzone sondą na syntetycznym XML, zob. „Sonda parsera”):
  1. nazwa produktu lub substancji złożona z samych spacji przechodzi (`value()` odrzuca tylko `""`, `rpl-parser.mjs:12-15`);
  2. `rodzajPreparatu="Ludzki"` (inna wielkość liter) jest po cichu zaliczone do pominiętych, a `skasowane="tak"` do aktywnych;
  3. dwa produkty o tym samym id przechodzą przez parser (duplikat wykrywa dopiero klucz główny tabeli tymczasowej w importerze, `registry-import.mjs:186-191`);
  4. znak NUL w encji (`&#0;`) kończy się zwykłym `Error` z saxes, nie `RplParseError`.
- **Importer nie da się wywołać z testu bez zmiany lub bez procesu potomnego.** Cały kod wykonawczy jest na najwyższym poziomie pliku z `process.exit` (`registry-import.mjs:284-314`), nic nie jest eksportowane, a funkcja importu sama robi `begin`/`commit`/`rollback` na własnym kliencie (`:166-175`, `:263-266`). Wzorzec „transakcja wycofywana po teście” z `tests/db` nie pasuje do niego wprost.
- **Test importu na bazie współdzielonej jest destrukcyjny.** Import oznacza `removed_at` dla każdego aktywnego produktu spoza pliku i przebudowuje `registry_search_list` (`registry-import.mjs:232-233`, `:259`), więc zniszczyłby lokalny pełny rejestr oraz stan v1, v1, v2, na którym polegają kolejne kroki jobu `smoke`.

## Detailed Findings

### 1. Co parser i importer robią z błędnym wejściem (obserwowane)

Źródło: `scripts/lib/rpl-parser.mjs` i `scripts/registry-import.mjs`, przeczytane w całości.

Przerywa głośno (`RplParseError` lub błąd bazy), w tych warunkach:

- zła przestrzeń nazw głównego elementu (`rpl-parser.mjs:67-69`);
- brakujące lub niezgodne z `^\d{4}-\d{2}-\d{2}$` `stanNaDzien` (`:70-72`);
- nieoczekiwany główny element, brak elementu głównego (`:75`, `:181`);
- id produktu lub aktywnego opakowania niezgodne z `^\d{1,19}$` (`:17-21`);
- pusta (`""`) `nazwaSubstancji` (`:94-96`) lub `nazwaProduktu` (`:155`);
- obcięty lub źle sformowany XML (`parser.close()` w `:167`);
- nieprawidłowe UTF-8 (`TextDecoder` z `fatal: true`, `registry-import.mjs:49-55`);
- duplikat id produktu lub opakowania w jednym pliku (klucze główne tabel tymczasowych, `:186-191`);
- `stanNaDzien` starsze niż ostatni import (`:215-219`);
- liczba produktów, substancji lub opakowań poniżej 90% aktywnych w bazie, tylko gdy baza nie jest pusta (`:221-227`, `MIN_SHARE` w `:23`);
- równoległy import (`pg_try_advisory_xact_lock`, `:177-180`).

Przechodzi po cichu (sprawdzone sondą na syntetycznym XML w tej sesji, parser wywołany bezpośrednio):

- nazwa produktu `"   "` i nazwa substancji `"  "` — parser je zwraca;
- `rodzajPreparatu="Ludzki"` — produkt trafia do `skippedProducts` (1), bez błędu;
- `skasowane="tak"` — opakowanie jest traktowane jak aktywne (`rpl-parser.mjs:112` porównuje z `"TAK"`);
- dwa `produktLeczniczy` z tym samym `id="1"` — oba wychodzą z parsera;
- plik bez żadnego produktu — parser zwraca pustą listę bez błędu;
- `stanNaDzien="2026-13-45"` — parser akceptuje (sama wartość regex); według raportu pomocnika od infrastruktury błąd pojawia się dopiero przy zapisie do `registry_imports` (SQLSTATE 22008) — to wnioskowanie z typu kolumny, niesprawdzone na bazie.

Pusty plik na pustej bazie: sprawdzenie 90% jest pomijane, gdy `state[kind] > 0` jest fałszem (`registry-import.mjs:222`). Wniosek z kodu, że pierwszy import pliku bez produktów zakończyłby się sukcesem i zapisem pustego stanu — nie uruchomiony.

### 2. Co mówi prawdziwy rejestr (migawka 2026-10-21, jeden pobór)

Źródło: pomocnik z analizą saxes na `overall.xml` (skrypty w katalogu roboczym sesji; wartości nie zweryfikowane przeze mnie ponownie poza dry-runem).

Kształty z prawdziwego pliku, których nie ma w fixture'ach (liczby dla produktów ludzkich lub aktywnych opakowań ludzkich, jeśli nie zaznaczono inaczej):

- opakowania z 2–8 jednostkami: 1 532; w fixture'ach każde ma 1;
- 18 produktów ludzkich ma tylko atrybut `etykietoUlotka`, więc `leaflet_url` jest NULL (parser czyta `ulotka` i `ulotkaImportRownolegly`, `rpl-parser.mjs:39`);
- `nazwaPowszechnieStosowana=""` u 7 produktów, `podmiotOdpowiedzialny=""` u 5;
- 1 produkt bez żadnego opakowania, 929 bez substancji (puste `<substancjeCzynne/>`);
- `kodATC="BRAK"` u 2 produktów, duplikat kodu ATC w jednym produkcie u 2;
- 83 produkty z powtórzoną nazwą substancji — klucz `(product_id, position)` to dopuszcza;
- nieprzyciętą białą spację na początku lub końcu wartości mają: nazwa powszechna 72, nazwa poprzednia 15, `moc` 24, nazwa drogi podania 19; przycinany jest tylko kod ATC (`rpl-parser.mjs:146`);
- znaki nowej linii z encji `&#10;` w `innyOpisIlosci` (39) i `moc` (2), jedna niełamliwa spacja w `moc`;
- 43 opakowania ludzkie z 13-cyfrowym GTIN, 3 przypadki zduplikowanego GTIN w jednym produkcie (brak unikalnego indeksu na `gtin`);
- puste `kategoriaDostepnosci` u 9 aktywnych opakowań ludzkich.

Elementy ignorowane przez parser i niepokryte testem (ostrzeżenie, nie ustalenie błędu): `zgodyPrezesa` (1 204), `materialyEdukacyjne`, `daneOWytworcy`, `dystrybutorRownolegly` (242), `numerEu`.

Granica wiarygodności: jedna migawka; inne dni mogą mieć inne kształty. Liczby mierzone osobnym skryptem, nie przez kod produkcyjny.

### 3. Co chroni dziś import i czego to nie dowodzi

- Jedyna kontrola importu to `scripts/registry-import-check.mjs` (skrypt Node, nie Vitest): v1, v1, v2 i zestaw asercji stanu (np. 11 aktywnych produktów, Crestor usunięty, 20 aktywnych opakowań, 35 wierszy substancji; `:84-220`). Działa w jobie `smoke`, tylko na pull requestach (`.github/workflows/ci.yml:33-58`).
- Wszystkie asercje opisują wynik na kształtach, które ktoś wymyślił, czyli dokładnie to, co plan nazywa założeniem do zakwestionowania (`test-plan.md:64`).
- Wiersz 47 planu cytuje jako dowód ryzyka niejasny błąd przy pustych nazwach i ciche zastępowanie nieprawidłowego UTF-8. Oba zostały naprawione 2026-10-01 (F8, F9 w `context/archive/2026-10-01-registry-copy-load/reviews/impl-review.md`; w kodzie `rpl-parser.mjs:94-96`, `registry-import.mjs:49-66`), ale żaden test tego nie dowodzi.
- Nie ma żadnego testu parsera. Importer nie działa przy codziennym przebiegu produkcyjnym pod żadnym testem (`.github/workflows/registry-import.yml` nie uruchamia sprawdzeń).

### 4. Gdzie testy mogłyby żyć

Źródło: raport pomocnika od infrastruktury, sprawdzone w plikach konfiguracyjnych.

- `vitest.config.ts:12-35`: projekt `unit` łapie wyłącznie `src/**/*.test.ts`; test pod `scripts/` lub `tests/` (poza `tests/hooks/`) nie zostanie uruchomiony przez `npm test` ani CI, dopóki nie poszerzy się `include`.
- Import `.mjs` z `.ts` działa w Vite. Adnotacja JSDoc `AsyncGenerator<object>` (`rpl-parser.mjs:47-49`) sprawi, że `product.name` w teście `.ts` będzie błędem typu (wnioskowanie z konfiguracji; `astro check` nie uruchomiony).
- `tests/db` (`vitest.db.config.ts:10-14`): jedno połączenie i wycofywana transakcja na plik, `connectLocal()` odrzuca hosty nielokalne (`tests/db/medicine-check-fixtures.ts:13-30`). Ten wzorzec wymaga, by testowany kod nie robił własnego `commit`.
- CI: kolejność w jobie `smoke` to import v1, v1, v2 → `registry-import-check.mjs` → `test:db` (jeden krok, `ci.yml:50-58`) → build → `smoke` → `test:api`. Test importu w `tests/db` zostawiłby inny stan bazy dla `test:api`, który z rejestru wybiera dane graniczne.
- Lokalne bramki: `lint-staged` ma glob `*.{ts,astro,tsx}` (`package.json:79-88`), więc zmiany w `*.mjs` nie dostają lintu ani testów przy commicie; hook końca tury (`.claude/hooks/end-of-turn.mjs`) lintuje `.mjs`, ale nie uruchamia `test:db` ani sprawdzenia importu, a zmiana `scripts/fixtures/*.xml` nie uruchamia niczego.
- Zależności (z `package.json`): `saxes` 6.0.0, `pg` 8.23.1, `vitest` 5.0.4.

### 5. Co baza odrzuca, a co przyjmuje

Źródło: `supabase/migrations/20261001120000_registry_tables.sql` (przeczytane przez pomocnika; nie sprawdzone zapytaniem do działającej bazy).

- Brak ograniczeń `CHECK` w tabelach rejestru. `registry_products.name`, `registry_product_substances.name` i `position` to `NOT NULL`; klucze główne na `id` i `(product_id, position)`.
- Przyjmuje (wnioskowanie ze schematu): dowolny tekst i długość w pozostałych kolumnach, produkty bez substancji i opakowań, dowolny JSON w `units`, przeniesienie opakowania do innego produktu (upsert przepisuje `product_id`).
- Odrzuca (wnioskowanie): id spoza zakresu `bigint` mimo zgodności z regexem (SQLSTATE 22003), niemożliwą datę (22008).

## Code References

- `scripts/lib/rpl-parser.mjs:12-15` — `value()` zamienia `""` na NULL, spacje przechodzą
- `scripts/lib/rpl-parser.mjs:17-21` — walidacja id (`^\d{1,19}$`)
- `scripts/lib/rpl-parser.mjs:78-82` — tylko `rodzajPreparatu === "ludzki"` jest zachowane, reszta liczona w `skippedProducts`
- `scripts/lib/rpl-parser.mjs:94-96`, `:155` — błędy pustej nazwy substancji i produktu
- `scripts/lib/rpl-parser.mjs:111-112` — `skasowane === "TAK"` oznacza usunięte
- `scripts/registry-import.mjs:49-55` — dekodowanie UTF-8 z `fatal: true`
- `scripts/registry-import.mjs:166-175`, `:263-266` — własny klient i `begin`/`commit`/`rollback`
- `scripts/registry-import.mjs:186-191` — tabele tymczasowe z kluczami głównymi (duplikaty id)
- `scripts/registry-import.mjs:207-227` — kontrole bezpieczeństwa (data migawki, 90%)
- `scripts/registry-import.mjs:232-233`, `:259` — masowe oznaczanie `removed_at` i przebudowa listy podpowiedzi
- `scripts/registry-import.mjs:284-314` — kod wykonawczy na najwyższym poziomie, `process.exit`
- `scripts/registry-import-check.mjs:84-220` — obecne asercje (szczęśliwa ścieżka)
- `vitest.config.ts:12-35`, `vitest.db.config.ts:10-14`, `.github/workflows/ci.yml:50-58` — gdzie testy mogłyby się uruchomić
- `context/foundation/test-plan.md:64`, `:191-194` — odpowiedź na ryzyko #7 i pusty §6.5

## Architecture Insights

- Import to jedna transakcja: tabele tymczasowe → kontrole → upsert → oznaczenie usuniętych → log → odświeżenie listy podpowiedzi → `commit`. Każdy błąd wycofuje całość (`registry-import.mjs:175-266`). Z tego wynika, że „głośny błąd i wycofanie” da się dowieść jednym zapytaniem o stan bazy po nieudanym przebiegu.
- Produkty i opakowania nigdy nie są usuwane, tylko dostają `removed_at`, bo apteczka odwołuje się do rekordów rejestru (`context/archive/2026-10-01-registry-copy-load/plan.md:43-51`). Substancje są zastępowane tylko dla produktów obecnych w pliku, więc usunięty produkt zachowuje ostatnie substancje (`registry-import.mjs:234-238`).
- Granica dwuwarstwowa pasuje do planu: parser jako czysta funkcja strumienia daje się testować bez bazy; importer wymaga bazy i własnej transakcji.

## Historical Context (from prior changes)

- `context/archive/2026-10-01-registry-copy-load/reviews/impl-review.md` — F1–F9 naprawione lub przyjęte; F4 przyjęte ekstra (klucze tabel tymczasowych, walidacja id i pustych nazw, kod wyjścia 2 dla błędów użycia). Do ocenienia osobno: F8 i F9 są naprawione w obecnym kodzie, F5 (transakcja trzymana otwarta podczas pobierania) złagodzona przez timeout i `lock_timeout 30s`, nie usunięta.
- `context/archive/2026-10-07-daily-registry-refresh/plan.md:17,30-37` — dzienny przebieg 04:17 UTC, bez ostrzeżenia o nieaktualności i bez pomijania niezmienionej migawki; „bez zmian w skrypcie importu”.
- `context/archive/2026-10-17-testing-quality-gates-wiring/` — bramki Faz 1–3 podpięte; Faza 5 nie może zakładać ochrony gałęzi jako nowej (ruleset obowiązuje od 2026-10-20, `test-plan.md:135`).
- `test-plan.md:244` — zatrzymanie harmonogramu po 60 dniach bez aktywności jest przyjętym ryzykiem poza zakresem testów (S-07).
- Roadmapa, Open Question 5 (wycofane produkty) formalnie otwarta, w praktyce rozstrzygnięta: produkty znikające z pliku dostają `removed_at` (zob. wyżej).

## Related Research

- `context/archive/2026-10-01-registry-copy-load/research.md` — pierwotne badanie formatu RPL (m.in. brak flagi „wycofany”, `research.md:67-73`)
- `context/archive/2026-10-09-medicine-check/research.md:45,81` — wycofane opakowanie w apteczce nadal się liczy; usunięty produkt zachowuje substancje

## Weryfikacja założeń z test-plan.md §2 (ryzyko #7)

- **„Fixture'y zawierają tylko kształty, o których ktoś pomyślał”** — potwierdzone, z poprawką: nawet prawdziwy plik nie zawiera dziś żadnego kształtu, który łamie parser, więc ryzyko #7 w tej migawce nie ma jeszcze ofiary. Ryzyko leży w ścieżkach cichych (zob. Summary: puste nazwy ze spacji, wielkość liter, duplikaty id przy `--dry-run`), nie w danych, które dziś padają.
- **Dowód prawdopodobieństwa** — `scripts/` został wyłączony ze skanu zmian na prośbę autora (`test-plan.md:29`), więc wiersz 47 planu opiera się na przeglądzie z archiwum i wywiadzie, nie na historii zmian parsera i importera.
- **Antywzorzec „oczekiwane wiersze z uruchomienia testowanego parsera”** — realny, bo dla większości kształtów z §2 (ATC „BRAK”, białe znaki, wielojednostkowe opakowania) poprawna odpowiedź to decyzja produktowa, nie fakt techniczny. Wyrocznią powinien być ręcznie przeczytany rekord źródłowy, i dla kształtów „przyjmowane po cichu” autor musi rozstrzygnąć, czy to błąd.

## Open Questions

1. **Decyzja produktowa przed planowaniem.** Dla każdego ze „cichych” kształtów trzeba wybrać: testować obecne zachowanie jako zamierzone, czy poprawić parser i testować nowe. Najważniejsze: nazwy ze samych spacji, `rodzajPreparatu`/`skasowane` w innej wielkości liter, zduplikowane id przy `--dry-run`, 18 produktów z samą `etykietoUlotka` (jedyny ciche pominięcie, które traci dane widoczne dla użytkownika). Zmiana kodu produkcyjnego wykracza poza „tylko testy” Fazy 5 — to powinna rozstrzygnąć użytkownik.
2. **Jak uruchamiać importer w teście.** Opcje: (a) proces potomny `node scripts/registry-import.mjs --file …` przeciw osobnej bazie, (b) wydzielenie funkcji `importToDatabase` do modułu (zmiana kodu produkcyjnego), (c) testy tylko parsera + sprawdzenia SQL na bazie bez uruchamiania importera. Wybór zależy od tego, czy można mieć osobną, jednorazową bazę lokalną; nie sprawdzono, czy `supabase db reset` w trakcie testu jest akceptowalny dla lokalnego pełnego rejestru autora.
3. **Niesprawdzone zachowanie bazy.** Brak uruchomionego Dockera uniemożliwił: tekst błędu klucza głównego (czy zawiera id produktu — wnioskowanie pomocnika, że nie), pierwszy import pustego pliku, błąd 22003/22008. Do potwierdzenia w fazie planowania lub implementacji na lokalnej bazie.
4. **Czy `test:db` ma być bramką dla importu** — `test-plan.md:133` wskazuje „local + CI, required after Phase 5”; pozostaje ustalić, czy dołączyć do kroku `smoke` przed `test:api` (zmiana kolejności lub izolacja bazy), czy osobny job.
5. **Lint-staged nie obejmuje `.mjs`** — uzupełnienie globu lub zostawienie decyzji planowi; zakres bramek należy do Fazy 4, ale ostatnia pozycja Fazy 5 („dodać je do bramek”, `test-plan.md:78`) go dotyczy.
6. **Skutek uboczny sesji badawczej:** pobrano prawdziwy plik rejestru (74 MB) do katalogu roboczego sesji poza repozytorium; w repozytorium nie zapisano niczego poza tym dokumentem i zmianami w `test-plan.md` z kroku handoff.
