# Testy importu rejestru i parsera (ryzyko #7) Implementation Plan

## Overview

Faza 5 planu testów (`context/foundation/test-plan.md` §3, ryzyko #7): dowieść, że plik rejestru z błędnym, pustym, zduplikowanym lub nieoczekiwanym rekordem albo importuje każdy poprawny produkt nienaruszony, albo kończy się głośnym błędem i wycofaniem całej transakcji. Oprócz testów zamykamy kilka cichych ścieżek parsera i importu, które dziś zmieniają sens rekordu bez żadnego sygnału (decyzje z wywiadu poniżej). Na końcu podpinamy nowe testy do bramek (CI, hook końca tury, lint-staged).

## Current State Analysis

- Parser (`scripts/lib/rpl-parser.mjs`) i importer (`scripts/registry-import.mjs`) nie mają żadnego testu. Jedyna kontrola importu to `scripts/registry-import-check.mjs`, uruchamiana tylko w jobie `smoke` na pull requestach, na dwóch fixture'ach (po 12 produktów), z asercjami tylko dla szczęśliwej ścieżki i zmian v1→v2.
- Parser przepuszcza po cichu (sprawdzone sondą w research): nazwę produktu lub substancji złożoną ze spacji (`value()` odrzuca tylko `""`, `rpl-parser.mjs:12-15`), `rodzajPreparatu` w innej wielkości liter (produkt ląduje w `skippedProducts`, `:78-82`), `skasowane="tak"` (traktowane jak aktywne, `:112`), duplikat id produktu (łapie dopiero klucz główny w imporcie, `registry-import.mjs:186-191`).
- Importer zapisuje pusty stan, gdy plik nie ma produktów, a baza jest pusta: kontrola 90% jest wtedy pomijana (`registry-import.mjs:221-222`).
- Prawdziwy rejestr (migawka 2026-10-21, 74 MB) używa zamkniętych słowników: `rodzajPreparatu` ∈ {`ludzki` 20 293, `weterynaryjny` 2 647}, `skasowane` ∈ {`NIE` 82 822, `TAK` 5 654}; oba atrybuty są zawsze obecne. Zaostrzenie parsera nie zatrzyma dzisiejszego importu.
- Kod wykonawczy importera jest na najwyższym poziomie pliku z `process.exit` (`registry-import.mjs:284-314`), a funkcja importu sama robi `begin`/`commit`/`rollback` (`:165-266`), więc nie da się jej wywołać z testu ani opakować w wycofywaną transakcję jak w `tests/db`.
- Lokalna baza zawiera stan CI (11 produktów po v1, v1, v2, `max(snapshot_date)` 2026-09-24). Import w teście na tej bazie zniszczyłby ten stan, na którym polegają `registry-import-check.mjs` i `test:api`. Trzy pierwsze migracje (`registry_tables`, `registry_search_list`, `registry_search_list_version`) nie dotykają `auth`; dwie pozostałe (`kit_items`, `medicine_check`) tak.
- Vitest: projekt `unit` łapie tylko `src/**/*.test.ts` (`vitest.config.ts:12-18`); `tests/db` ma osobną konfigurację z `fileParallelism: false` (`vitest.db.config.ts`). `lint-staged` ma glob `*.{ts,astro,tsx}` (`package.json:79-84`), więc `*.mjs` nie dostaje lintu ani testów przy commicie; hook końca tury lintuje `.mjs`, ale uruchamia tylko projekty `unit` i `component` (`.claude/hooks/end-of-turn.mjs:110`) i nie reaguje na zmianę `scripts/fixtures/*.xml`.

## Desired End State

- `npx vitest run --project registry` dowodzi: każdy kształt z listy błędnych plików kończy się `RplParseError` (lub innym głośnym błędem), a każdy poprawny kształt daje rekord zgodny z ręcznie przeczytanym źródłem.
- `npm run test:db` dowodzi na osobnej bazie `registry_import_test`: każdy zły plik kończy importer kodem 1, komunikatem na stderr i **bazą bez zmian**; poprawny plik (wycinek prawdziwych produktów oraz plik z ponad 2 000 produktów) trafia do tabel nienaruszony.
- Parser odrzuca nazwy ze samych spacji oraz nierozpoznane i brakujące `rodzajPreparatu` / nierozpoznane `skasowane`; importer i `--dry-run` odrzucają plik bez produktów.
- Nowe testy działają w bramkach: `ci` (projekt `registry`), `smoke` (`test:db`), hook końca tury, `lint-staged` dla `*.mjs` i fixture'ów XML.
- Weryfikacja: `npx vitest run --project unit --project component --project registry`, `DATABASE_URL=… npm run test:db`, `npm run lint`, `npx astro check`, a w PR zielone `ci` i `smoke`.

### Key Discoveries:

- `rpl-parser.mjs:78` zalicza do nie-ludzkich wszystko, co nie jest dokładnie `"ludzki"` — również `Ludzki` i brak atrybutu. Jeden taki rekord nie uruchomi bezpiecznika 90%.
- `registry-import.mjs:186-191`: klucze główne tabel tymczasowych odrzucają duplikaty id w pliku; po wsadzie pierwszych 1 000 produktów (`BATCH_SIZE`, `:20`) błąd dalej w strumieniu musi nadal zostawić bazę nietkniętą — to osobny przypadek do udowodnienia.
- `registry_refresh_search_list()` jest wywoływana w tej samej transakcji (`:259`) a migracje 2–3 ją definiują; baza z trzema migracjami wystarcza do pełnego przebiegu importera.
- Lokalne hosty są odrzucane przez `connectLocal()` (`tests/db/medicine-check-fixtures.ts:13-30`); ten sam strażnik obejmie tworzenie bazy testowej.
- Hook końca tury ma w teście dokładne asercje na komendę vitest (`tests/hooks/agent-hooks.test.ts:192,223,230`) — zmiana listy projektów wymaga ich aktualizacji.
- `lessons.md`: sprawdzenia mutacyjne pojedynczo i osobno, po zakończeniu bramek tylko do odczytu; werdykt bramki z kodu wyjścia polecenia, nie z potoku; kontrole ręczne wykonuje użytkownik, dopóki nie powie inaczej.

## What We're NOT Doing

- Nie zmieniamy strategii ryzyka ani definicji bramek (to Lekcja 1 / `/10x-test-plan`).
- Nie naprawiamy 18 produktów, które mają w prawdziwym pliku tylko `etykietoUlotka` (puste `leaflet_url`): to brak funkcji, nie błąd integralności. Przypinamy to zachowanie testem z komentarzem i zapisujemy jako pytanie otwarte w roadmapie.
- Nie wykrywamy duplikatów id w `--dry-run` (import je odrzuca kluczem głównym; `--dry-run` zostaje podglądem parsera) — przypinamy to testem jako znane zachowanie.
- Nie przycinamy białych znaków w wartościach (rejestr ma je w nazwach powszechnych, `moc` i drogach podania; zmiana sensu to decyzja produktowa) — przypinamy brak przycinania.
- Nie wydzielamy `importToDatabase` z `registry-import.mjs` i nie zmieniamy jego `begin`/`commit`/`rollback`.
- Nie dodajemy testu na pełnym, pobranym pliku rejestru ani żadnego skryptu pobierającego (jednorazowy `--dry-run` na prawdziwym pliku to krok ręczny, nie stały test).
- Nie używamy Stryker (nie działa z Vitest 5, `test-plan.md` §6.6); siłę testów dowodzą ręczne mutacje, pojedynczo.
- Nie zmieniamy `registry-import-check.mjs` ani workflow `registry-import.yml` i nie dodajemy testów blokady równoległego importu.
- Nie testujemy zachowania `removed_at` ani wymiany substancji (pokrywa to `registry-import-check.mjs`).

## Implementation Approach

Dwie warstwy z podwójnym oracle. Parser jest czystą funkcją strumienia tekstu, więc jego testy (nowy projekt Vitest `registry`) nie potrzebują bazy: małe XML-e wpisane w testach, po jednym na kształt, oraz wycinek kilku prawdziwych produktów, dla którego oczekiwane wartości przepisuję ręcznie z rekordów źródłowych (nigdy z wyniku testowanego parsera). Importer wymaga bazy i własnej transakcji, więc test zakłada osobną bazę `registry_import_test` w lokalnym Postgresie, nakłada trzy migracje rejestru, uruchamia `node scripts/registry-import.mjs --file …` jako proces potomny (realna ścieżka z kodami wyjścia) i po każdym złym pliku porównuje odcisk całej bazy z odciskiem sprzed importu. Kolejność faz jest sztywna: faza 2 testuje błędy, które wprowadza faza 1, a faza 3 spina obie i dokumentuje; żadnych faz równoległych (bramki, mutacje i commity zawsze po kolei).

Zaostrzenia kodu produkcyjnego są minimalne i każde ma test czerwony przed zmianą (red→green): nazwa ze spacji, `rodzajPreparatu` / `skasowane`, pusty plik.

## Phase 1: Parser — zaostrzenie i testy

### Overview

Parser zamyka ciche ścieżki z decyzji wywiadu i dostaje pierwszy zestaw testów w nowym projekcie Vitest `registry`: kształty błędne (głośny błąd) i kształty poprawne (rekord zgodny z ręcznie przeczytanym źródłem).

### Changes Required:

#### 1. Zaostrzenie parsera

**File**: `scripts/lib/rpl-parser.mjs`

**Intent**: Rekord, którego sens parser musiałby zgadywać, kończy się `RplParseError` zamiast cichej zmiany. Nazwa produktu lub substancji złożona wyłącznie z białych znaków liczy się jak pusta (dotychczasowy komunikat „has an empty …” zostaje; zapisana wartość nie jest przycinana). `rodzajPreparatu` musi być `ludzki` (zachowany) albo `weterynaryjny` (pominięty i policzony); każda inna wartość, w tym brak atrybutu i `Ludzki`, to błąd z podaną wartością. `skasowane` musi być `TAK` (pominięte i policzone), `NIE` lub brak atrybutu (aktywne); inna wartość, np. `tak`, to błąd. Aktualizacja komentarza nagłówkowego i JSDoc `parseRpl` (lista błędów).

**Contract**: `parseRpl(source)` wciąż zwraca `{ snapshotDate, products, stats }`; zmieniają się tylko przypadki rzucania `RplParseError`. Walidacja `skasowane` dotyczy tylko opakowań produktów ludzkich (pominięty produkt nie jest sprawdzany). Komunikaty zawierają nazwę atrybutu i odrzuconą wartość, w razie możliwości id produktu.

#### 2. Projekt Vitest `registry`

**File**: `vitest.config.ts`

**Intent**: Nowy projekt uruchamia testy parsera bez bazy i bez jsdom.

**Contract**: projekt `{ name: "registry", include: ["tests/registry/**/*.test.ts"], environment: "node" }` obok `unit`/`component`/`hooks`. `npm test` go obejmuje; CI i hook dostaną go w fazie 3.

#### 3. Pomocnik testów parsera

**File**: `tests/registry/parse-helpers.ts`

**Intent**: Jedno miejsce, które zamienia napis XML (opcjonalnie pocięty na chunki o zadanej długości) w wynik parsera, tak aby test mógł oczekiwać zarówno odrzucenia przy `parseRpl`, jak i przy iteracji po `products`.

**Contract**: `parseText(xml: string, chunkSize?: number): Promise<{ snapshotDate: string; products: Product[]; stats: { skippedProducts: number; skippedPackages: number } }>` — zbiera wszystkie produkty (typ `Product` zadeklarowany w pomocniku, bo JSDoc parsera zwraca `AsyncGenerator<object>`); `xmlDoc(body, { date?, namespace? })` składa nagłówek z poprawną przestrzenią nazw `RPL_NAMESPACE` i datą, żeby przypadki w testach zawierały tylko to, co je wyróżnia.

#### 4. Wycinek prawdziwych produktów

**File**: `tests/fixtures/rpl-real-shapes.xml`

**Intent**: Kilka (około pięciu) produktów skopiowanych dosłownie z migawki z 2026-10-21, wybranych tak, by pokryć kształty, których `scripts/fixtures/` nie mają: opakowanie z ponad jedną jednostką (w prawdziwym pliku 1 532 takie), `&#10;` (nowa linia) w `moc` lub `innyOpisIlosci`, `kodATC` równy `BRAK`, produkt z samą `etykietoUlotka`, puste `podmiotOdpowiedzialny` / `nazwaPowszechnieStosowana`, 13-cyfrowy GTIN, puste `kategoriaDostepnosci`, wartość z początkową lub końcową spacją, plus jeden produkt weterynaryjny i jedno skasowane opakowanie. Plik źródłowy leży w katalogu roboczym poprzedniej sesji (`…/scratchpad/rpl-data/overall.xml`); gdy go nie ma, pobrać na nowo z adresu `RPL_URL` w `registry-import.mjs:19`. Wycinek zachowuje wszystkie atrybuty i elementy wybranych rekordów (także te, które parser ignoruje) i dopasowaną przestrzeń nazw, zmieniony może być tylko `stanNaDzien`, jeśli kolidowałby z innym plikiem.

**Contract**: XML poprawny dla parsera; każdy produkt ma w komentarzu w teście (nie w XML) wypisane id źródłowe i powód wyboru.

#### 5. Testy parsera

**File**: `tests/registry/rpl-parser.test.ts`

**Intent**: Test jest dowodem ryzyka #7 po stronie parsera. Oczekiwane wartości wpisuję ręcznie z przeczytanego rekordu źródłowego; wolno użyć parsera do wytworzenia obserwowanego wyniku, ale nigdy do wytworzenia oczekiwanego. Grupy:

- **Głośne błędy** (`rejects`): zła przestrzeń nazw; brak i błędny format `stanNaDzien`; zły element główny i brak elementu głównego; id produktu i opakowania: nienumeryczne, puste, 20 cyfr; pusta i złożona ze spacji `nazwaProduktu` i `nazwaSubstancji`; `rodzajPreparatu` = `Ludzki`, `` (puste), brak atrybutu, `inny`; `skasowane` = `tak`, `Nie`, `1`; obcięty XML; niedomknięty znacznik; znak NUL jako encja (`&#0;`: wystarczy, że odrzucone jakimkolwiek błędem).
- **Poprawne kształty** (rekord zgodny ze źródłem): puste atrybuty → `null`; `nazwaPoprzedniaProduktu` = `brak` w wariantach wielkości liter i ze spacjami → `null`; dwa kody ATC (przycięte), `BRAK` zachowany jako dane; drogi podania; substancje w kolejności dokumentu z `position` 1…n, także z powtórzoną nazwą; opakowanie z 3 jednostkami w tej samej kolejności i ze wszystkimi polami; `skasowane="TAK"` pominięte i policzone, a opakowanie produktu weterynaryjnego nie liczone; produkt weterynaryjny pominięty i policzony; encje (`&#10;`, `&amp;`) zdekodowane; `ulotka` ma pierwszeństwo przed `ulotkaImportRownolegly`; produkt z samą `etykietoUlotka` → `leaflet_url` `null` (przypięte, komentarz z odesłaniem do pytania otwartego w roadmapie); białe znaki w wartościach nieprzycinane (poza kodem ATC); elementy ignorowane (`zgodyPrezesa`, `daneOWytworcy`) nie przeciekają do rekordu; BOM na początku; wynik identyczny dla całego tekstu i dla chunków po 1 znaku (granice chunków wewnątrz atrybutów i znaczników).
- **Przypięte zachowania znane** (opis w nazwie testu „pinned: …”): plik bez produktów → pusta lista bez błędu (importer go odrzuca, test w fazie 2); dwa produkty o tym samym id oba wychodzą z parsera (odrzuca je import).
- **Wycinek prawdziwych produktów**: każdy produkt z `rpl-real-shapes.xml` porównany z literałem wpisanym ręcznie z XML-a.

**Contract**: wszystkie testy w jednym pliku lub kilku plikach w `tests/registry/`; nazwy po polsku lub angielsku zgodnie z istniejącymi testami (`src/lib/*.test.ts`); asercje bez snapshotów generowanych z parsera.

### Success Criteria:

#### Automated Verification:

- Testy parsera przechodzą: `npx vitest run --project registry`
- Wszystkie testy bez bazy przechodzą: `npx vitest run --project unit --project component --project registry`
- Testy czerwone przed zaostrzeniem: dla nazwy ze spacji, `Ludzki` i `tak` test w `rpl-parser.test.ts` przed zmianą `rpl-parser.mjs` kończy się czerwono (kolejność commitów lub uruchomienie przed edycją)
- Fixture'y CI wciąż przechodzą parser: `npm run registry:import -- --file scripts/fixtures/rpl-sample-v1.xml --dry-run` oraz to samo dla `rpl-sample-v2.xml` (kod wyjścia 0, 11 produktów ludzkich i 1 pominięty w każdym)
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

#### Manual Verification:

- Zaostrzony parser przechodzi prawdziwy rejestr: `npm run registry:import -- --file <ścieżka do świeżo pobranego overall.xml> --dry-run` kończy się kodem 0 z liczbami zbliżonymi do migawki z 2026-10-21 (20 293 produkty ludzkie, 25 586 substancji, 71 558 aktywnych opakowań, 2 647 pominiętych, 4 104 pominięte opakowania); agent proponuje wykonać to sam, jeśli użytkownik nie zdecyduje inaczej
- Oczekiwane wartości testu wycinka zgadzają się z rekordami źródłowymi (przegląd pięciu produktów obok XML-a)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Importer — zaostrzenie i testy na osobnej bazie

### Overview

Importer odrzuca plik bez produktów, a testy w `tests/db` uruchamiają go jako proces potomny na osobnej bazie `registry_import_test` i dowodzą, że każdy zły plik kończy się kodem 1 oraz bazą identyczną jak przed importem, a poprawne pliki trafiają do tabel nienaruszone.

### Changes Required:

#### 1. Odrzucenie pliku bez produktów

**File**: `scripts/registry-import.mjs`

**Intent**: Plik rejestru bez żadnego produktu ludzkiego jest błędem w imporcie i w `--dry-run`, niezależnie od stanu bazy. Dziś na pustej bazie zapisałby pusty stan z wpisem w `registry_imports`, bo kontrola 90% jest wtedy pomijana (`:221-222`).

**Contract**: po pętli parsującej (przed kontrolami bezpieczeństwa w importerze, na końcu `dryRun`) `if (dump.products === 0) throw new ImportError("the dump contains no human products")`; kod wyjścia 1, komunikat `Registry import failed: …` na stderr, w imporcie rollback przez istniejący `catch`.

#### 2. Pomocnik osobnej bazy

**File**: `tests/db/registry-import-fixtures.ts`

**Intent**: Wszystko, czego potrzebuje test importera poza samymi asercjami, w jednym miejscu: zakładanie i usuwanie bazy testowej, reset do stanu bazowego, uruchomienie importera jako procesu, odcisk stanu bazy.

**Contract**:

- `REGISTRY_MIGRATIONS`: jawna lista trzech plików (`20261001120000_registry_tables.sql`, `20261002120000_registry_search_list.sql`, `20261002130000_registry_search_list_version.sql`).
- `createScratchDatabase()`: łączy się przez `connectLocal()` (strażnik hostów lokalnych), robi `drop database if exists registry_import_test with (force)` i `create database registry_import_test`, nakłada migracje z `supabase/migrations/` na nową bazę, zwraca `{ url, client, drop() }`; `url` to `DATABASE_URL` z podmienioną nazwą bazy.
- `runImport(url, file)`: `spawnSync(process.execPath, ["scripts/registry-import.mjs", "--file", file], { env: { DATABASE_URL: url, … } })`, zwraca `{ status, stdout, stderr }`.
- `fingerprint(client)`: odcisk całego stanu — liczby wierszy i `md5` uporządkowanych wierszy `registry_products`, `registry_product_substances`, `registry_packages`, `registry_imports`, `registry_search_list` — używany do „baza bez zmian”.
- `resetToBaseline(url, client)`: `truncate` tabel rejestru i import `scripts/fixtures/rpl-sample-v1.xml` (11 aktywnych produktów, `stanNaDzien` 2026-09-23), żeby kontrole „plik starszy” i „próg 90%” miały na czym działać.

#### 3. Testy importera

**File**: `tests/db/registry-import.test.ts`

**Intent**: Test dowodzi ryzyka #7 po stronie importu: „głośny błąd i wycofanie” albo „nienaruszony”. Przed każdym testem stan bazowy z v1; po złym pliku `fingerprint` równy temu sprzed importu, status 1 i fragment komunikatu na stderr. Przypadki:

- **Złe pliki** (tabela `it.each`, plik budowany z `xmlDoc` lub bajtów): obcięty XML; zła przestrzeń nazw; nieprawidłowe UTF-8 (bajt `0xFF`); nazwa produktu ze spacji; `rodzajPreparatu="Ludzki"`; dwa produkty o tym samym id; dwa opakowania o tym samym id (w jednym i w różnych produktach); id z 20 cyframi; id powyżej zakresu `bigint` (19 cyfr, błąd bazy 22003); `stanNaDzien="2026-13-45"` (błąd 22008); migawka starsza od ostatniej zaimportowanej; plik z 10 z 11 produktów (przechodzi próg 90%) obok pliku z 9 z 11 (odrzucony) — obie strony granicy; plik z samym elementem głównym na bazie niepustej (próg 90%) i na bazie pustej (nowy błąd „no human products”, baza nadal pusta); nieistniejący plik; tekst, który nie jest XML-em.
- **Wsad większy niż `BATCH_SIZE`**: wygenerowany plik z 2 001 produktami, 1 substancją i 1 opakowaniem każdy: import kończy się sukcesem i liczby w tabelach oraz skrajne id są dokładnie takie, jak w konstrukcji pliku (oracle = konstrukcja pliku); ten sam plik z pustą nazwą w ostatnim produkcie (po wsadzie pierwszych 1 000) kończy się kodem 1 i bazą bez zmian.
- **Wierność poprawnego pliku**: `tests/fixtures/rpl-real-shapes.xml` zaimportowany na pustej bazie; wybrane wiersze (produkt z opakowaniem o 3 jednostkach: kolumna `units` jsonb równa literałowi wpisanemu ręcznie ze źródła; nowa linia z `&#10;`; `atc_codes`, `routes`, `leaflet_url` `NULL` dla samej `etykietoUlotka`; brak produktu weterynaryjnego i skasowanego opakowania) porównane z literałami; ponowny import tego samego pliku nie zmienia żadnego wiersza danych (odcisk bez `registry_imports`).
- **Strażnik migracji**: każda migracja spoza `REGISTRY_MIGRATIONS` odwołuje się do `auth.` lub `kit_items` (nowa migracja rejestru nie zostanie po cichu pominięta w bazie testowej).

**Contract**: pliki testowe zapisywane w katalogu tymczasowym (`os.tmpdir()`), sprzątane w `afterAll`; baza usuwana w `afterAll`, także po błędzie; `vi.setConfig({ testTimeout: 60_000 })` w pliku (każdy przypadek to proces potomny). Jeśli zachowanie bazy różni się od oczekiwanego w tabeli (np. inny SQLSTATE, plik bez produktów na pustej bazie), poprawiamy oczekiwany **komunikat** na zaobserwowany, ale nigdy nie zmieniamy oczekiwania „kod 1 i baza bez zmian” na sukces; nieoczekiwany sukces złego pliku to wniosek o błędzie importera — zatrzymać się i zapytać.

### Success Criteria:

#### Automated Verification:

- Testy importera przechodzą na lokalnej bazie: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:db`
- Test pliku bez produktów jest czerwony przed zmianą w `registry-import.mjs`, zielony po niej
- `npm run test:db` nie zmienił stanu bazy `postgres` (11 aktywnych produktów, 3 wpisy w `registry_imports`): sprawdzenie zapytaniem przed i po
- Po przebiegu nie została baza testowa: `docker exec supabase_db_mamlek psql -U postgres -Atc "select count(*) from pg_database where datname = 'registry_import_test'"` zwraca 0
- Fixture'y CI przechodzą import: `npm run registry:import -- --file scripts/fixtures/rpl-sample-v1.xml --dry-run` (kod 0)
- Testy bez bazy przechodzą: `npx vitest run --project unit --project component --project registry`
- Lint i typy przechodzą: `npm run lint`, `npx astro check`

#### Manual Verification:

- Przegląd tabeli złych plików: każdy z kształtów z ryzyka #7 (błędny, pusty, zduplikowany, nieoczekiwany) ma przypadek, który autor uznaje za reprezentatywny
- Jeśli któreś zaobserwowane zachowanie bazy odbiega od `research.md` (komunikat klucza głównego, SQLSTATE), autor potwierdza zaktualizowane oczekiwanie

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Bramki, CI, mutacje i dokumentacja

### Overview

Nowe testy trafiają do bramek, dowodzimy ich siły sprawdzeniami mutacyjnymi i opisujemy je w dokumentacji oraz w `test-plan.md`.

### Changes Required:

#### 1. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Job `ci` uruchamia także projekt `registry`. Job `smoke` ma już krok `npm run test:db`, który obejmie test importera po sprawdzeniu `registry-import-check.mjs`; baza testowa jest osobna, więc nie rusza stanu v1, v1, v2 dla `test:api`.

**Contract**: komenda w kroku testów joba `ci` to `npx vitest run --project unit --project component --project registry`; w `smoke` bez zmian poza ewentualnym komentarzem. Nazwy jobów (`ci`, `smoke`) nie są zmieniane (ruleset w `.github/rulesets/main.json`).

#### 2. Hook końca tury i jego dowód

**Files**: `.claude/hooks/end-of-turn.mjs`, `tests/hooks/agent-hooks.test.ts`

**Intent**: Hook uruchamia też projekt `registry` i reaguje na zmianę fixture'ów XML parsera, które dziś nie uruchamiają niczego. Test hooków (wzorzec i stub vitest w `agent-hooks.test.ts:40-42`) pozostaje dowodem.

**Contract**: argumenty vitest w hooku: `run --project unit --project component --project registry`; `TEST_INPUTS` rozszerzone o `scripts/fixtures/.+\.xml` (istniejące `tests/(fixtures|helpers)/…` obejmuje `tests/fixtures/rpl-real-shapes.xml`); asercje w teście hooków (`:192,223,230`) zaktualizowane, dodany przypadek „zmieniony `scripts/fixtures/*.xml` uruchamia testy”; komentarz nagłówkowy hooka i opis w AGENTS.md zaktualizowane.

#### 3. lint-staged

**File**: `package.json`

**Intent**: Zmiana w `*.mjs` dostaje lint i testy parsera przy commicie; zmiana fixture'u XML uruchamia testy parsera, bo plik XML nie jest w grafie importów, więc `vitest related` go nie wskaże.

**Contract**: w `lint-staged` nowy glob `*.mjs`: `["eslint --fix", "vitest related --run --passWithNoTests --project registry"]` oraz `{scripts/fixtures,tests/fixtures}/*.xml`: `"vitest run --project registry"`. Przed dodaniem sprawdzić, że `npx eslint` na wszystkich dotychczasowych `*.mjs` nie zgłasza błędów (inaczej każdy commit dotykający takiego pliku byłby zablokowany).

#### 4. Sprawdzenia mutacyjne

**Intent**: Dowód, że testy łapią błędy, nie tylko przechodzą. Każda mutacja osobno, po zakończeniu bramek tylko do odczytu, z `git checkout --` zaraz po niej (`lessons.md`). Oczekiwany wynik: wskazany test czerwony.

**Contract**: (a) usunąć sprawdzenie pustej nazwy w `rpl-parser.mjs` → test nazwy ze spacji / pustej; (b) przywrócić ciche pominięcie nierozpoznanego `rodzajPreparatu` → test `Ludzki`; (c) usunąć walidację `skasowane` → test `tak`; (d) usunąć kontrolę 90% w `registry-import.mjs` → test progu 90% (9 z 11); (e) usunąć nowe odrzucenie pliku bez produktów → test pustej bazy; (f) usunąć końcowe `await loadBatch(client, batch, dump)` (ostatnia niepełna partia) → test 2 001 produktów. Wyniki zapisane w `test-plan.md` §6.6.

#### 5. Dokumentacja i test-plan

**Files**: `AGENTS.md`, `README.md` (tylko jeśli wymienia projekty testów), `context/foundation/test-plan.md`, `context/foundation/roadmap.md`

**Intent**: Następny agent wie, jak dodać test importu, i nie powtarza błędnych założeń. W `AGENTS.md` (sekcja „Command tripwires”): projekt `registry` w opisie `npm test` i `ci`, test importera w opisie `test:db` (osobna baza `registry_import_test`, nie rusza stanu v1, v1, v2), reguła „oczekiwane wartości z ręcznie przeczytanego rekordu źródłowego”. W `test-plan.md`: §3 wiersz 5 (status faz), §5 i wiersz 133 (bramka „required after Phase 5” staje się aktywna), §6.5 (wzorzec dodania testu: ręcznie wpisany XML, wycinek prawdziwych produktów, osobna baza, odcisk „baza bez zmian”), §6.6 (notatki fazy 5: decyzje, zaobserwowane zachowania bazy, wyniki mutacji, przypięte zachowania), §7/§8 tam, gdzie dotyczy. W `roadmap.md` nowe pytanie otwarte: 18 produktów ludzkich z samą `etykietoUlotka` ma pusty link do ulotki (rozważyć odczyt `etykietoUlotka` lub komunikat w UI); bez `roadmap:sync`, bo to nie zmiana statusu ani pozycji.

**Contract**: opis `test:db` w `AGENTS.md` ma zachować dotychczasowe zdania o izolacji kit i `medicine_check`; wiersz 133 w `test-plan.md` nie zmienia rodzaju bramki, tylko stan.

### Success Criteria:

#### Automated Verification:

- Pełny zestaw bez bazy przechodzi: `npx vitest run --project unit --project component --project registry`
- Dowód hooków przechodzi: `npx vitest run --project hooks`
- Testy bazy przechodzą: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:db`
- Lint całego repo oraz wszystkich `*.mjs` bez błędów: `npm run lint`
- Typy przechodzą: `npx astro check`
- Każda z mutacji (a)–(f) czerwona w oczekiwanym teście, po każdej `git checkout --` przywraca plik (`git status --short scripts/` bez zmian poza zamierzonymi)
- Przykładowy commit z dotkniętym `*.mjs` uruchamia `eslint` i `vitest related --project registry` (sprawdzenie na stagingu próbnej zmiany, potem cofnięcie)
- Odsyłacze w `test-plan.md` §3/§5/§6.5/§6.6 wskazują istniejące pliki i polecenia

#### Manual Verification:

- Pull request z zielonymi `ci` i `smoke` (ruleset `main`); `smoke` uruchamia `test:db` z nowym testem po `registry-import-check.mjs` i przed `test:api`, a `test:api` dalej przechodzi
- Po scaleniu najbliższy dzienny import (04:17 UTC, `registry-import.yml`) kończy się sukcesem — brak maila o nieudanym przebiegu następnego dnia (zaostrzony parser nie zatrzymał produkcji)
- Autor przegląda `test-plan.md` §6.5/§6.6 i pytanie otwarte w roadmapie

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Parser: głośne błędy (każdy kształt z listy), poprawne kształty z oracle wpisanym ręcznie, przypięte zachowania znane, granice chunków, wycinek prawdziwych produktów.

### Integration Tests:

- Importer jako proces potomny na bazie `registry_import_test`: każdy zły plik → kod 1 i baza bez zmian; wsad większy niż `BATCH_SIZE` w obie strony (sukces i błąd po pierwszej partii); wierność wycinka prawdziwych produktów; ponowny import bez zmian; strażnik listy migracji.

### Manual Testing Steps:

1. `npm run registry:import -- --file <świeży overall.xml> --dry-run` kończy się kodem 0 z liczbami zbliżonymi do migawki z 2026-10-21.
2. Pull request z zielonymi `ci` i `smoke`.
3. Dzień po scaleniu: brak maila o nieudanym dziennym imporcie.

## Performance Considerations

Każdy przypadek `test:db` dla importera to proces potomny (rzędu 0,3–1 s); około 25 przypadków plus baza i migracje daje kilkadziesiąt sekund. Dlatego `testTimeout` w pliku to 60 s. Testy parsera biegną w milisekundach i dołączają do kroku `vitest run` w `ci`.

## Migration Notes

Brak migracji bazy. Zmiany w parserze i imporcie wchodzą do dziennego importu produkcyjnego (04:17 UTC) bez własnego wdrożenia: stąd ręczny `--dry-run` na prawdziwym pliku w fazie 1 i obserwacja pierwszego dziennego importu po scaleniu w fazie 3. Cofnięcie zaostrzeń to rewert PR.

## References

- Related research: `context/changes/testing-registry-import-scripts/research.md`
- Plan testów: `context/foundation/test-plan.md` (§2 ryzyko #7, §3 faza 5, §6.5)
- Wzorzec testów bazy: `tests/db/medicine-check-fixtures.ts:13-30`, `vitest.db.config.ts`
- Parser: `scripts/lib/rpl-parser.mjs:12-21,78-82,94-96,108-112,155`
- Importer: `scripts/registry-import.mjs:165-271,284-314`
- Dotychczasowa kontrola: `scripts/registry-import-check.mjs`, `.github/workflows/ci.yml:33-58`
- Hook końca tury: `.claude/hooks/end-of-turn.mjs:18,110`; dowód: `tests/hooks/agent-hooks.test.ts:192,223,230`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Parser — zaostrzenie i testy

#### Automated

- [x] 1.1 Testy parsera przechodzą: `npx vitest run --project registry`
- [x] 1.2 Wszystkie testy bez bazy przechodzą: `npx vitest run --project unit --project component --project registry`
- [x] 1.3 Testy czerwone przed zaostrzeniem: dla nazwy ze spacji, `Ludzki` i `tak` test w `rpl-parser.test.ts` przed zmianą `rpl-parser.mjs` kończy się czerwono (kolejność commitów lub uruchomienie przed edycją)
- [x] 1.4 Fixture'y CI wciąż przechodzą parser: `npm run registry:import -- --file scripts/fixtures/rpl-sample-v1.xml --dry-run` oraz to samo dla `rpl-sample-v2.xml` (kod wyjścia 0, 11 produktów ludzkich i 1 pominięty w każdym)
- [x] 1.5 Lint przechodzi: `npm run lint`
- [x] 1.6 Typy przechodzą: `npx astro check`

#### Manual

- [x] 1.7 Zaostrzony parser przechodzi prawdziwy rejestr: `npm run registry:import -- --file <ścieżka do świeżo pobranego overall.xml> --dry-run` kończy się kodem 0 z liczbami zbliżonymi do migawki z 2026-10-21 (20 293 produkty ludzkie, 25 586 substancji, 71 558 aktywnych opakowań, 2 647 pominiętych, 4 104 pominięte opakowania); agent proponuje wykonać to sam, jeśli użytkownik nie zdecyduje inaczej
- [x] 1.8 Oczekiwane wartości testu wycinka zgadzają się z rekordami źródłowymi (przegląd pięciu produktów obok XML-a)

### Phase 2: Importer — zaostrzenie i testy na osobnej bazie

#### Automated

- [ ] 2.1 Testy importera przechodzą na lokalnej bazie: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:db`
- [ ] 2.2 Test pliku bez produktów jest czerwony przed zmianą w `registry-import.mjs`, zielony po niej
- [ ] 2.3 `npm run test:db` nie zmienił stanu bazy `postgres` (11 aktywnych produktów, 3 wpisy w `registry_imports`): sprawdzenie zapytaniem przed i po
- [ ] 2.4 Po przebiegu nie została baza testowa: `docker exec supabase_db_mamlek psql -U postgres -Atc "select count(*) from pg_database where datname = 'registry_import_test'"` zwraca 0
- [ ] 2.5 Fixture'y CI przechodzą import: `npm run registry:import -- --file scripts/fixtures/rpl-sample-v1.xml --dry-run` (kod 0)
- [ ] 2.6 Testy bez bazy przechodzą: `npx vitest run --project unit --project component --project registry`
- [ ] 2.7 Lint i typy przechodzą: `npm run lint`, `npx astro check`

#### Manual

- [ ] 2.8 Przegląd tabeli złych plików: każdy z kształtów z ryzyka #7 (błędny, pusty, zduplikowany, nieoczekiwany) ma przypadek, który autor uznaje za reprezentatywny
- [ ] 2.9 Jeśli któreś zaobserwowane zachowanie bazy odbiega od `research.md` (komunikat klucza głównego, SQLSTATE), autor potwierdza zaktualizowane oczekiwanie

### Phase 3: Bramki, CI, mutacje i dokumentacja

#### Automated

- [ ] 3.1 Pełny zestaw bez bazy przechodzi: `npx vitest run --project unit --project component --project registry`
- [ ] 3.2 Dowód hooków przechodzi: `npx vitest run --project hooks`
- [ ] 3.3 Testy bazy przechodzą: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:db`
- [ ] 3.4 Lint całego repo oraz wszystkich `*.mjs` bez błędów: `npm run lint`
- [ ] 3.5 Typy przechodzą: `npx astro check`
- [ ] 3.6 Każda z mutacji (a)–(f) czerwona w oczekiwanym teście, po każdej `git checkout --` przywraca plik (`git status --short scripts/` bez zmian poza zamierzonymi)
- [ ] 3.7 Przykładowy commit z dotkniętym `*.mjs` uruchamia `eslint` i `vitest related --project registry` (sprawdzenie na stagingu próbnej zmiany, potem cofnięcie)
- [ ] 3.8 Odsyłacze w `test-plan.md` §3/§5/§6.5/§6.6 wskazują istniejące pliki i polecenia

#### Manual

- [ ] 3.9 Pull request z zielonymi `ci` i `smoke` (ruleset `main`); `smoke` uruchamia `test:db` z nowym testem po `registry-import-check.mjs` i przed `test:api`, a `test:api` dalej przechodzi
- [ ] 3.10 Po scaleniu najbliższy dzienny import (04:17 UTC, `registry-import.yml`) kończy się sukcesem — brak maila o nieudanym przebiegu następnego dnia
- [ ] 3.11 Autor przegląda `test-plan.md` §6.5/§6.6 i pytanie otwarte w roadmapie
