# S-04: Import apteczki z CSV z ekranem zatwierdzenia — Implementation Plan

## Overview

Użytkownik wprowadza całą apteczkę naraz: na `/apteczka/import` widzi oczekiwany format CSV i gotowy prompt do zewnętrznego czatu AI, wkleja tekst albo wgrywa plik, a na ekranie zatwierdzenia każdy wiersz dostaje rekord rejestru i opakowanie. Zatwierdzanie i zapis idą stronami po 30 wierszy — każda strona to jeden zapis „wszystko albo nic”, można przerwać na dowolnej stronie, a zapisane wcześniej strony zostają w apteczce. Realizuje FR-007, FR-008, FR-009 i US-02.

## Current State Analysis

- Ręczne dodawanie: `KitAddForm` (`src/components/kit/KitAddForm.tsx:345`) → `MedicineSuggest` wybiera `RegistryVariant`, `PackForm` (`:44`) ładuje opakowania przez `useVariantPackages` (`src/components/hooks/useVariantPackages.ts:20`, `GET /api/registry/packages?product=<id>`) i wybiera je sam, gdy jest jedno. Data ważności to miesiąc + rok, ilość to liczba całkowita 0…max.
- `POST /api/kit` (`src/pages/api/kit/index.ts`) dodaje jedną pozycję: 503 → 401 → 415 → 400 (zod `addRequest`, `.strict()`, l.8-18) → `getPackage` (400, gdy brak lub wycofane) → `packQuantity(units).max` (400 przy przekroczeniu) → `addKitItem` z `expiryPrecision: "month"` → 201 `{id}`. Brak endpointu zbiorczego.
- Serwis `src/lib/services/kit.ts`: `getPackage` (`:64`, jedno opakowanie), `addKitItem` (`:91`, jeden insert), `listKitItems` (`:117`, cała apteczka z `name`, `strength`, `form`, także wycofane).
- `kit_items` (`supabase/migrations/20261007120000_kit_items.sql:15-25`): `package_id` wymagane, `quantity >= 0` (górna granica tylko w API), para `expires_on`/`expiry_precision`, `user_id` z `auth.uid()`; RLS właściciela na każdą operację. Insert wielu wierszy przez klienta użytkownika przechodzi przez te same polityki.
- Wyszukiwanie: `searchVariants(index, query, limit)` (`src/lib/registry-search.ts:145`) jest czyste i synchroniczne, zwraca `{results, total}`; worker (`src/lib/registry-search.worker.ts`) obsługuje `load` i pojedyncze `search`; hook `useRegistrySearch` trzyma jedno zapytanie naraz i odrzuca starsze odpowiedzi. Każdy egzemplarz `MedicineSuggest` ma własny worker i własny indeks.
- Wariant = `(lower(name), lower(strength), lower(pharmaceutical_form))` (`kit_items.sql:110-114`, ta sama definicja w `medicine_check` i liście podpowiedzi). Moc na liście podpowiedzi jest ucięta do 80 znaków (`supabase/migrations/20261002120000_registry_search_list.sql:98`: `left(strength, 79) || '…'`).
- Brak parsera CSV i biblioteki CSV w `package.json`.
- `/apteczka/...` jest już chronione (`src/middleware.ts:4`, gałąź `startsWith("/apteczka/")`). `Topbar.astro` ustawia `aria-current` porównaniem `Astro.url.pathname`.
- Testy: wzorzec komponentu z podmienionym tylko `fetch` i `Worker` (`tests/helpers/fetch.ts` → `stubRoutedFetch`, `tests/helpers/fake-search-worker.ts`); wzorzec API czarnej skrzynki w `tests/api/kit-input.test.ts` i `kit-access.test.ts` (4xx nigdy 500, licznik wierszy konta bez zmian, `expectNoInternals`, obie strony granicy, źródło granicy w komentarzu). `test-plan.md` §7 zapowiada odświeżenie po S-04.

## Desired End State

- `/apteczka` ma link „Importuj z CSV” do `/apteczka/import`.
- Krok 1 na `/apteczka/import`: opis formatu, prompt z przyciskiem „Kopiuj”, pole do wklejenia i wybór pliku `.csv`. Błąd formatu całego tekstu (brak nagłówka, nieznane kolumny, ponad 200 wierszy) pokazuje się w kroku 1 z przyczyną i niczego nie zaczyna.
- Krok 2: wiersze w kolejności z pliku, stronami po 30. Każdy wiersz pokazuje tekst z CSV i jeden ze stanów: przypisany automatycznie, propozycje do wyboru, brak dopasowania, wymaga opakowania, zła wartość daty/ilości, „już masz”, „powtórzony w imporcie”, gotowy, usunięty. Przycisk zapisu strony jest nieaktywny (z widocznym powodem: „N wierszy wymaga decyzji”), dopóki każdy nieusunięty wiersz strony nie jest gotowy.
- Zapis strony wysyła jedno `POST /api/kit/import`; po sukcesie ekran przechodzi do kolejnej strony i pokazuje licznik „zapisano X z Y stron, N leków”. „Zakończ import” w każdej chwili wraca na `/apteczka?zaimportowano=N` (komunikat „Dodano N leków z importu”); niezapisane strony są przed kliknięciem nazwane wprost.
- Weryfikacja: testy unit parsera i reguł, testy komponentu ekranu, `test:api` nowego endpointu, `npm run perf` bez regresji, ręczny przebieg na telefonie z prawdziwym CSV z czatu.

### Key Discoveries:

- Apteczka zapisuje opakowanie (`package_id`), nie wariant — wybór opakowania jest częścią przypisania wiersza (`KitAddForm.tsx:44`, `PackForm`).
- Jeden `insert([...])` przez PostgREST to jedno polecenie SQL, więc zapis strony jest atomowy bez nowej funkcji w bazie i bez migracji.
- „Już masz” da się policzyć po stronie przeglądarki z `listKitItems` (nazwa, moc, postać są w `KitItem`), bez zapytania na wiersz — pod warunkiem, że klucz ucina moc tak jak lista podpowiedzi.
- `MedicineSuggest` jest kosztowny w wielu egzemplarzach (worker + indeks na egzemplarz), więc ręczna poprawa przypisania montuje go tylko w jednym, edytowanym wierszu.

## What We're NOT Doing

- Kamera, OCR, wywołanie modelu AI z aplikacji (PRD Non-Goals).
- Historia importów i wznawianie przerwanego importu — stan zatwierdzania żyje w pamięci strony; odświeżenie gubi niezapisane strony (decyzja: brak szkicu w `localStorage`).
- Automatyczne przypisanie przy więcej niż jednym trafieniu albo z zapytania zastępczego (nazwa z mocą, sama nazwa) — tylko propozycje.
- Dopasowanie wielkości opakowania z CSV — opakowanie wybiera użytkownik, chyba że wariant ma jedno.
- Separator inny niż średnik, wykrywanie separatora.
- Zapis daty z dokładnością do dnia — dzień z CSV jest odrzucany, zapis `expiry_precision: "month"` jak w formularzu ręcznym.
- Zabezpieczenie przed podwójnym zapisem strony, gdy odpowiedź serwera zginie po zapisie (klucz idempotencji) — przyjęte ryzyko, patrz Open Risks w briefie.
- Edycja i usuwanie pozycji już zapisanych (S-05).
- Odświeżenie `context/foundation/test-plan.md` (§7 „Import CSV”) — osobno przez `/10x-test-plan --refresh` po wdrożeniu.
- Zmiany w bazie (migracje, RPC).

## Implementation Approach

Najpierw czysta logika (faza 1) i endpoint zapisu (faza 2), równolegle — mają rozłączne pliki i wspólny jest tylko limit 30 pozycji, ustalony w tym planie. Potem dopasowanie w workerze (faza 3), bo dotyka modułu używanego przez `/szukaj` i wymaga pomiaru wydajności. Na końcu ekran (faza 4), który składa trzy poprzednie. Reguły, które decydują o „nie zgadujemy” (kiedy przypisać samemu, co blokuje stronę), są w czystych funkcjach z testami unit, a ekran tylko je wyświetla.

## Critical Implementation Details

- **Zasada automatycznego przypisania** — dla wiersza budujemy do trzech zapytań: `nazwa moc postać`, `nazwa moc`, `nazwa` (puste części pomijane, duplikaty zapytań usuwane). Pierwsze zapytanie z `total > 0` daje propozycje (do 5). Przypisanie bez kliknięcia tylko wtedy, gdy trafiło **pierwsze** zapytanie i `total === 1`; każde inne trafienie to propozycje, a brak trafień to blokada z polem wyszukiwania.
- **Klucz wariantu** — `lower(name) | lower(strength ?? "") | lower(form ?? "")`, przy czym moc pozycji z apteczki trzeba najpierw uciąć tak jak `registry_search_list.sql:98` (ponad 80 znaków → pierwsze 79 + `…`), inaczej lek z długą mocą nigdy nie będzie „już masz”.
- **Kolejność stanów strony** — oznaczenie „powtórzony w imporcie” liczone jest po całym pliku, a nie tylko po stronie: drugi i kolejny nieusunięty wiersz z tym samym kluczem wariantu (w kolejności z pliku) czeka na decyzję. Zmiana przypisania albo usunięcie wiersza przelicza oznaczenia pozostałych wierszy, a decyzja „dodaj jako osobne opakowanie” podjęta dla innego wariantu się kasuje.

## Faza 1: Logika importu (czyste funkcje)

> Może iść równolegle z fazą 2 (rozłączne pliki).

### Overview

Parser CSV i model wiersza importu: od tekstu do listy wierszy ze stanem, z regułami „już masz”, „powtórzony w imporcie”, blokad i stron. Bez Reacta i bez sieci.

### Changes Required:

#### 1. Parser CSV

**File**: `src/lib/kit-import-csv.ts` (+ `src/lib/kit-import-csv.test.ts`)

**Intent**: Zamienia wklejony tekst albo zawartość pliku na wiersze z polami albo z błędem — żaden wiersz danych nie znika; błąd całego tekstu jest osobnym wynikiem.

**Contract**: `parseKitCsv(text: string): { ok: true; rows: ParsedRow[] } | { ok: false; error: CsvError }`.

- Wejście: usuwa BOM, ignoruje linie z ogrodzeniem kodu Markdown (zaczynające się od <code>```</code>, bo czat tak opakowuje wynik) i linie puste. Separator `;`, pola w cudzysłowie `"…"` z `""` jako cudzysłowem w środku.
- Nagłówek wymagany: kolumny `nazwa;moc;postac;waznosc;ilosc` rozpoznawane bez wielkości liter i polskich znaków (`postać`, `ważność`, `ilość` też), kolejność dowolna; brak kolumny `nazwa`, nieznana albo powtórzona kolumna → `CsvError` z nazwą kolumny. Pozostałe kolumny mogą nie wystąpić.
- Ponad 200 wierszy danych → `CsvError` z liczbą wierszy. Zero wierszy danych → `CsvError`.
- `ParsedRow`: `line` (numer linii w tekście), `raw` (tekst linii), `name`, `strength`, `form` (przycięte, pusty → `null`), `expiry`, `quantity`, oraz `malformed: true`, gdy liczba pól nie zgadza się z nagłówkiem (wtedy pola nie są odczytywane).
- `expiry`: `{ kind: "empty" } | { kind: "ok"; month; year } | { kind: "invalid"; text }`. Przyjmuje `MM.RRRR`, `M.RRRR`, `MM/RRRR`, `DD.MM.RRRR`, `RRRR-MM`, `RRRR-MM-DD`; dzień jest sprawdzany i odrzucany; rok 2000–2100, miesiąc 1–12 (te same granice co `POST /api/kit`).
- `quantity`: `{ kind: "empty" } | { kind: "ok"; value } | { kind: "invalid"; text }`; tylko cyfry, 0…`MAX_QUANTITY`. Górna granica opakowania sprawdzana dopiero po wyborze opakowania (faza 4, `packQuantity`).

#### 2. Model wiersza i reguły ekranu

**File**: `src/lib/kit-import.ts` (+ `src/lib/kit-import.test.ts`)

**Intent**: Jedno miejsce na reguły FR-009: kiedy rekord jest przypisany sam, co jest „już masz”, co jest powtórzeniem, co blokuje stronę i jak dzielimy na strony.

**Contract**:

- Stałe: `IMPORT_MAX_ROWS = 200`, `IMPORT_PAGE_SIZE = 30` (używany też przez API w fazie 2 jako limit pozycji w żądaniu), `IMPORT_SUGGESTIONS = 5`.
- `rowQueries(row: ParsedRow): string[]` — do trzech zapytań wg „Zasady automatycznego przypisania”; wiersz bez nazwy albo `malformed` → `[]`.
- `matchRow(index: RegistrySearchIndex, queries: string[]): RowMatch` — `RowMatch = { kind: "auto"; variant } | { kind: "choices"; variants; total } | { kind: "none" }`; używa `searchVariants`, zapytania krótsze niż `MIN_QUERY_LENGTH` pomija.
- `variantKey(name, strength, form): string` i `kitItemVariantKey(item: KitItem)` z ucięciem mocy wg „Klucza wariantu”.
- `ImportRow` (stan wiersza w ekranie): parsowany wiersz + `match`, wybrany `variant` i `packageId`, poprawione `expiry`/`quantity`, `duplicateDecision: "add" | null`, `removed: boolean`.
- `rowIssues(row, context): RowIssue[]` — lista powodów blokady: `no-variant`, `no-package`, `invalid-expiry`, `invalid-quantity`, `quantity-over-pack`, `already-have` (bez decyzji), `repeated-in-import` (bez decyzji). `context` zawiera klucze wariantów apteczki, klucze nieusuniętych wierszy wcześniej w pliku i maks. ilość wybranego opakowania. Wiersz usunięty nie ma powodów. Automatyczne przypisanie nie jest powodem blokady (pokazane tylko jako informacja).
- `pageOf(rows, page)` / `pageCount(rows)` — strony po `IMPORT_PAGE_SIZE` w kolejności z pliku (usunięcie wiersza nie przesuwa stron).
- `toImportItem(row)` → `{ packageId, quantity, expiry }` w kształcie żądania z fazy 2 (`quantity`/`expiry` `null`, gdy „nieznane”).

### Success Criteria:

#### Automated Verification:

- Testy parsera pokrywają: nagłówek z polskimi znakami i w innej kolejności, brak nagłówka, nieznana kolumna, ogrodzenie kodu, BOM, pole w cudzysłowie ze średnikiem, wiersz z inną liczbą pól (zostaje jako `malformed`, nie znika), każdy format daty i obie strony granic roku, miesiąca i ilości, 200 i 201 wierszy: `npx vitest run src/lib/kit-import-csv.test.ts`
- Testy reguł pokrywają: przypisanie tylko przy jednym trafieniu pierwszego zapytania, brak przypisania przy jednym trafieniu zapytania zastępczego, „już masz” dla innej wielkości opakowania tego samego wariantu i dla leku z mocą ponad 80 znaków, „powtórzony w imporcie” tylko dla drugiego i kolejnych wierszy oraz jego zniknięcie po usunięciu pierwszego, strony 30/30/… przy 61 wierszach: `npx vitest run src/lib/kit-import.test.ts`
- Lint i typy: `npm run lint`, `npx astro check`

**Implementation Note**: Faza bez kroku ręcznego; wartości oczekiwane w testach wzięte z reguł PRD i tego planu, nie z wyniku testowanego kodu.

---

## Faza 2: API zapisu strony

> Może iść równolegle z fazą 1 (rozłączne pliki). Limit pozycji: 30 (`IMPORT_PAGE_SIZE`); jeśli faza 1 nie jest jeszcze w gałęzi, stała trafia do `src/lib/kit-import.ts` w tej fazie i faza 1 ją przejmuje.

### Overview

`POST /api/kit/import` zapisuje od 1 do 30 pozycji jednym poleceniem — wszystkie albo żadna.

### Changes Required:

#### 1. Wspólny schemat pozycji

**File**: `src/pages/api/kit/index.ts`, nowy moduł schematu w `src/lib/` (np. `src/lib/kit-request.ts`)

**Intent**: Pojedyncze dodanie i import sprawdzają pozycję tym samym schematem, żeby granice nie rozjechały się między trasami.

**Contract**: wyciągnięty schemat pozycji `{ packageId, quantity?, expiry? }` (dziś `addRequest`, `index.ts:8-18`), zachowanie `POST /api/kit` bez zmian.

#### 2. Serwis

**File**: `src/lib/services/kit.ts`

**Intent**: Odczyt wielu opakowań jednym zapytaniem i zapis wielu pozycji jednym insertem.

**Contract**: `getPackages(supabase, ids: number[]): Promise<Map<number, RegistryVariantPackage>>` (tylko aktywne, ta sama reguła co `getPackage`); `addKitItems(supabase, items[]): Promise<{ ids: number[] }>` — jeden `.insert([...]).select("id")`, błąd → `throw` z przyczyną.

#### 3. Trasa

**File**: `src/pages/api/kit/import.ts`

**Intent**: Zapis strony importu z tymi samymi kontrolami co `POST /api/kit` i z numerem błędnej pozycji w odpowiedzi.

**Contract**: `POST`, kolejność 503 → 401 → 415 → 400 → 201. Ciało `{ items: Item[] }` (`.strict()`, 1…30). Po walidacji: każda pozycja musi mieć aktywne opakowanie i ilość ≤ `packQuantity(units).max` — inaczej 400 `{ error, index }` i nic nie jest zapisane. Sukces: 201 `{ ids }` w kolejności pozycji. Błąd bazy: 500 z ogólnym komunikatem i `console.error` z przyczyną (bez szczegółów w odpowiedzi). Zapis z `expiryPrecision: "month"` i `expiryToDate`.

#### 4. Testy API i dokumentacja

**File**: `tests/api/kit-input.test.ts`, `tests/api/kit-access.test.ts`, `AGENTS.md`

**Intent**: Nowa trasa przechodzi ten sam zestaw co `POST /api/kit`, plus atomowość.

**Contract**:

- Wejście: 0 / 1 / 30 / 31 pozycji, zły typ, nieznane pole, opakowanie spoza rejestru i wycofane, ilość powyżej opakowania — każde 4xx, licznik wierszy konta bez zmian, `expectNoInternals`. Atomowość: 29 dobrych pozycji + 1 zła na końcu → 400 z `index: 29`, licznik bez zmian. Sukces 30 pozycji → 201, licznik +30.
- Dostęp: anonim → 401 przed walidacją; `user_id` z sesji (pole `userId` w pozycji odrzucone przez `.strict()`); zapisane wiersze widzi tylko właściciel.
- Bez nowych kont w teście, jeśli się da (limit rejestracji lokalnie, `AGENTS.md` → `test:api`).
- `AGENTS.md`: opis `npm run test:api` obejmuje `POST /api/kit/import`.

### Success Criteria:

#### Automated Verification:

- Lint i typy: `npm run lint`, `npx astro check`
- Testy unit i komponentu bez regresji (`POST /api/kit` po wyciągnięciu schematu): `npm test`
- Testy API przechodzą na lokalnym serwerze z zaimportowanymi fikstur rejestru: `npm run test:api`

#### Manual Verification:

- Żądanie z 30 pozycjami z przeglądarki zalogowanego konta (DevTools) zapisuje 30 wierszy, a ponowione z jedną złą pozycją nie zapisuje nic

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Faza 3: Dopasowanie wierszy w workerze

### Overview

Worker wyszukiwania dostaje wiadomość „dopasuj wiele wierszy”, a nowy hook ładuje listę i dopasowuje wiersze importu jednym przebiegiem, bez blokowania wątku strony.

### Changes Required:

#### 1. Wiadomość workera

**File**: `src/lib/registry-search.worker.ts`, `src/types.ts`

**Intent**: Dopasowanie do 200 wierszy w workerze tą samą funkcją `matchRow` co w testach unit.

**Contract**: nowe `RegistrySearchWorkerRequest` `{ type: "match"; id: number; rows: string[][] }` (zapytania wiersza z `rowQueries`) i odpowiedź `{ type: "matches"; id: number; matches: RowMatch[] }` w kolejności wierszy; wyjątek jednego wiersza → `{ kind: "none" }` dla tego wiersza, nie błąd całości. Ścieżki `load` i `search` bez zmian.

#### 2. Hook

**File**: `src/components/hooks/useRegistryMatch.ts`

**Intent**: Ten sam sposób ładowania listy co `useRegistrySearch` (adres z wersją, cache HTTP, przekazanie bufora do workera), ale z jednym żądaniem dopasowania na zestaw wierszy.

**Contract**: `useRegistryMatch(version: number, rows: string[][] | null)` → `{ status: "loading" | "ready" | "error"; matches: RowMatch[] | null; retry }`; nowy zestaw wierszy unieważnia odpowiedź na poprzedni (po `id`). Wspólny kod ładowania listy wyciągnięty z `useRegistrySearch` zamiast kopiowania, bez zmiany jego zachowania.

### Success Criteria:

#### Automated Verification:

- Test hooka z `fake-search-worker` (rozszerzonym o `match`): odpowiedź na stary zestaw wierszy jest ignorowana, błąd listy daje `error` z `retry`: `npm test`
- Testy `/szukaj` (`RegistrySearch.test.tsx`) bez zmian i zielone: `npm test`
- Lint i typy: `npm run lint`, `npx astro check`

#### Manual Verification:

- `npm run perf` na `wrangler dev` (profil `both`) — czas „list ready” na profilu slow nie gorszy niż ok. 4651 ms ± rozrzut przebiegów (roadmap S-04 Unknown, zapas ok. 350 ms)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Faza 4: Ekran `/apteczka/import`

### Overview

Strona z dwoma krokami w jednej wyspie React: format i wejście, potem zatwierdzanie stronami po 30 i zapis każdej strony.

### Changes Required:

#### 1. Strona

**File**: `src/pages/apteczka/import.astro`, `src/pages/apteczka.astro`, `src/components/Topbar.astro`

**Intent**: Strona importu na tym samym układzie co `/apteczka` (Layout, Topbar, Card, `max-w-xl`), z wersją listy, preloadem listy i kluczami wariantów apteczki z serwera; link „Importuj z CSV” na `/apteczka`; komunikat po imporcie.

**Contract**:

- `import.astro`: `getSearchListVersion` + `listKitItems` jak w `apteczka.astro:20`; do wyspy idzie `version` i `kitVariantKeys: string[]` (z `kitItemVariantKey`), nie cała apteczka. Brak listy → „Rejestr leków nie jest jeszcze wczytany”; błąd → komunikat jak na `/apteczka`.
- `apteczka.astro`: `?zaimportowano=<1…200>` (tylko liczba w zakresie, inaczej ignorowane) → `role="status"` „Dodano N leków z importu”.
- `Topbar.astro`: „Apteczka” ma `aria-current` także na `/apteczka/import`.

#### 2. Wyspa importu

**File**: `src/components/kit/KitImport.tsx` (+ podkomponenty w `src/components/kit/`, np. `KitImportRow.tsx`)

**Intent**: Krok 1 i krok 2 z „Desired End State”, wyświetlające reguły z fazy 1 i zapisujące stronę przez fazę 2.

**Contract**:

- Krok 1: opis kolumn z przykładem (`nazwa;moc;postac;waznosc;ilosc` / `Ibuprom;400 mg;tabletki powlekane;03.2027;20`), prompt z przyciskiem „Kopiuj” (komunikat o skopiowaniu w `role="status"`), `textarea` i `input type="file" accept=".csv,text/csv"` (plik > 256 kB → komunikat, nie czytamy), przycisk „Dalej”. Treść promptu:

  > Na zdjęciu są opakowania leków. Wypisz każde opakowanie w osobnym wierszu jako CSV ze średnikiem jako separatorem i z nagłówkiem: nazwa;moc;postac;waznosc;ilosc. nazwa — nazwa handlowa z opakowania, bez mocy; moc — np. 400 mg albo 100 mg/5 ml; postac — np. tabletki powlekane, syrop; waznosc — data ważności jako MM.RRRR; ilosc — ile sztuk zostało, same cyfry. Jeśli czegoś nie da się odczytać, zostaw pole puste — nie zgaduj. Zwróć tylko CSV, bez komentarzy.

- Krok 2: `useRegistryMatch` dla wszystkich wierszy; podczas ładowania stan „Dopasowuję leki…”, błąd listy z „Spróbuj ponownie”. Wiersz pokazuje tekst z CSV (`raw`) i stan wg `rowIssues`; propozycje jako lista do wyboru (nazwa + moc + postać, jak w podpowiedziach); „Zmień”/„Szukaj” montuje `MedicineSuggest` tylko w jednym wierszu naraz; po przypisaniu wariantu `useVariantPackages` dla wierszy bieżącej strony, wybór opakowania jak w `PackForm` (samo przy jednym); pola miesiąc/rok i ilość przy złej wartości z oryginalnym tekstem i „Wyczyść (nieznane)”; przy „już masz” / „powtórzony w imporcie” przyciski „Dodaj jako osobne opakowanie” i „Usuń z importu”; każdy wiersz ma „Usuń z importu”, usunięty — „Przywróć”.
- Zapis strony: przycisk „Zapisz stronę X z Y” nieaktywny z widocznym powodem, dopóki strona ma powody blokady; po 201 następna strona. Strona bez nieusuniętych wierszy ma „Pomiń stronę” zamiast zapisu. Błąd 400 z `index` → komunikat przy tym wierszu; błąd sieci/500 → „Nie udało się zapisać strony. Jeśli połączenie zerwało się w trakcie, sprawdź apteczkę, zanim spróbujesz ponownie.” z „Spróbuj ponownie”; 401 → komunikat o wygasłej sesji z linkiem do logowania.
- „Zakończ import”: tekst obok nazywa niezapisane strony („Strony 3–7 nie zostaną zapisane”), kliknięcie → `/apteczka?zaimportowano=N` (N > 0) albo `/apteczka`. Podsumowanie nad przyciskiem: zapisane, usunięte, niezapisane wiersze.
- Tylko klasy ról i komponenty z `src/components/ui/` (brakujące przez `npx shadcn@latest add`), `cn()`.

#### 3. Testy komponentu i strażnicy UI

**File**: `src/components/kit/KitImport.test.tsx`, `tests/helpers/fetch.ts`, `tests/helpers/fake-search-worker.ts`, `scripts/ui-scan.mjs`

**Intent**: Ekran sprawdzony na prawdziwym komponencie z podmienionym tylko `fetch` i `Worker`.

**Contract**: `stubRoutedFetch` zna `/api/registry/packages` i `/api/kit/import`; fałszywy worker odpowiada na `match`. Scenariusze: zły nagłówek zatrzymuje w kroku 1; wiersz bez dopasowania blokuje zapis strony z widocznym powodem; jedno trafienie przypisuje i pokazuje „przypisano automatycznie”; „już masz” blokuje do decyzji; dwa wiersze tego samego wariantu — drugi blokuje, usunięcie pierwszego zdejmuje oznaczenie; zła data blokuje do poprawy albo wyczyszczenia; zapis strony wysyła tylko nieusunięte wiersze tej strony i przechodzi dalej; 400 z `index` oznacza właściwy wiersz; błąd sieci zostawia stronę z komunikatem; „Zakończ import” prowadzi do `?zaimportowano=N`. `ui-scan.mjs`: `GUARDED` dostaje `src/pages/apteczka/import.astro` i nowe pliki `src/components/kit/KitImport*.tsx`.

### Success Criteria:

#### Automated Verification:

- Testy komponentu importu przechodzą: `npx vitest run src/components/kit/KitImport.test.tsx`
- Cały zestaw unit + component + registry: `npx vitest run --project unit --project component --project registry`
- Lint, typy, skan UI, build: `npm run lint`, `npx astro check`, `npm run ui:scan`, `npm run build`
- Testy API i smoke bez regresji na lokalnym serwerze: `npm run test:api`, `npm run smoke`

#### Manual Verification:

- Na telefonie (390 px): zdjęcie szuflady → prompt w darmowym czacie → wklejony CSV przechodzi przez oba kroki bez poziomego przewijania, a leki trafiają do apteczki z datą i ilością albo „nieznane”
- Import ponad 30 wierszy: zapis pierwszej strony, „Zakończ import” na drugiej — w apteczce są tylko wiersze pierwszej strony, komunikat „Dodano N leków z importu” się zgadza
- Ponowny import tego samego CSV oznacza zapisane leki jako „już masz”
- Czytnik ekranu ogłasza „Skopiowano”, powód nieaktywnego zapisu strony i błąd zapisu

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Parser: formaty dat, granice, nagłówek, cudzysłowy, wiersze `malformed`, limit 200 (faza 1).
- Reguły: automatyczne przypisanie, klucz wariantu z ucięciem mocy, powtórzenia w pliku, powody blokady, strony (faza 1).
- Hook dopasowania: nieaktualne odpowiedzi, błąd listy (faza 3).

### Integration Tests:

- `test:api` dla `POST /api/kit/import`: granice 0/1/30/31, wycofane opakowania, ilość ponad opakowanie, atomowość, 401 przed walidacją, właściciel z sesji (faza 2).
- Komponent `KitImport` na prawdziwym komponencie z podmienionym `fetch` i `Worker` (faza 4).

### Manual Testing Steps:

1. `http://localhost:4321/apteczka` → „Importuj z CSV” → skopiuj prompt, wygeneruj CSV w czacie ze zdjęcia, wklej.
2. Przejdź wszystkie stany wierszy: brak dopasowania, propozycje, wybór opakowania, zła data, „już masz”, powtórzenie.
3. Przerwij po pierwszej stronie i sprawdź apteczkę; zaimportuj ten sam plik ponownie.

## Performance Considerations

- Dopasowanie 200 wierszy to do 600 przebiegów `searchVariants` w workerze — poza wątkiem strony; na słabym telefonie może trwać kilka sekund, stąd stan „Dopasowuję leki…”.
- Ręczna poprawa w wierszu montuje drugi worker z indeksem (`MedicineSuggest`) — jeden naraz, żeby nie mnożyć pamięci na starym telefonie.
- Opakowania pobierane tylko dla wierszy bieżącej strony (≤ 30 żądań).
- Zmiana workera jest współdzielona z `/szukaj`: `npm run perf` w fazie 3.

## Migration Notes

Brak zmian w bazie i brak migracji — `npx supabase db push` nie jest potrzebny.

## References

- PRD: `context/foundation/prd.md` (US-02, FR-007, FR-008, FR-009, Guardrails)
- Roadmap: `context/foundation/roadmap.md` (S-04)
- Wzorzec dodawania: `src/components/kit/KitAddForm.tsx:44`, `src/pages/api/kit/index.ts:8-18`
- Definicja wariantu: `supabase/migrations/20261007120000_kit_items.sql:110-114`; ucięcie mocy: `supabase/migrations/20261002120000_registry_search_list.sql:98`
- Wzorce testów: `tests/api/kit-input.test.ts`, `tests/api/kit-access.test.ts`, `src/components/registry/RegistrySearch.test.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Logika importu (czyste funkcje)

#### Automated

- [x] 1.1 Testy parsera pokrywają nagłówek, ogrodzenie kodu, BOM, cudzysłowy, wiersze malformed, formaty i granice dat i ilości, 200/201 wierszy — f8439b3
- [x] 1.2 Testy reguł pokrywają automatyczne przypisanie, „już masz” (inne opakowanie, moc ponad 80 znaków), „powtórzony w imporcie” i strony — f8439b3
- [x] 1.3 Lint i typy — f8439b3

### Phase 2: API zapisu strony

#### Automated

- [x] 2.1 Lint i typy — 5e67a3e
- [x] 2.2 Testy unit i komponentu bez regresji po wyciągnięciu schematu — 5e67a3e
- [x] 2.3 Testy API przechodzą na lokalnym serwerze — 5e67a3e

#### Manual

- [x] 2.4 Żądanie z 30 pozycjami zapisuje 30 wierszy, z jedną złą nie zapisuje nic — 5e67a3e

### Phase 3: Dopasowanie wierszy w workerze

#### Automated

- [x] 3.1 Test hooka: stara odpowiedź ignorowana, błąd listy z retry
- [x] 3.2 Testy /szukaj bez zmian i zielone
- [x] 3.3 Lint i typy

#### Manual

- [x] 3.4 npm run perf bez regresji na profilu slow

### Phase 4: Ekran /apteczka/import

#### Automated

- [ ] 4.1 Testy komponentu importu przechodzą
- [ ] 4.2 Cały zestaw unit + component + registry
- [ ] 4.3 Lint, typy, skan UI, build
- [ ] 4.4 Testy API i smoke bez regresji

#### Manual

- [ ] 4.5 Na telefonie CSV z czatu przechodzi przez oba kroki i trafia do apteczki
- [ ] 4.6 Import ponad 30 wierszy przerwany na drugiej stronie zostawia tylko pierwszą stronę
- [ ] 4.7 Ponowny import tego samego CSV oznacza leki jako „już masz”
- [ ] 4.8 Czytnik ekranu ogłasza skopiowanie, powód blokady i błąd zapisu
