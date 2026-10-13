# Faza 1 planu testów — poprawność werdyktu sprawdzenia: plan implementacji

## Overview

Dodajemy do projektu narzędzie do testów (Vitest) i testy, które pilnują dwóch ryzyk z `context/foundation/test-plan.md`:

- **Ryzyko 1:** aplikacja mówi „nie masz” o leku (albo o leku z tą samą substancją), który jest w apteczce.
- **Ryzyko 2:** aplikacja mówi „ta sama substancja” o leku, który jej nie ma.

Testy obejmują całą drogę od reguły w bazie do tego, co widzi użytkownik. Przy okazji zamykamy jedyną cichą drogę do fałszywego „nie masz”: nieznana albo niepełna odpowiedź z bazy pokaże błąd z ponowieniem.

## Current State Analysis

- **Werdykt powstaje w dwóch miejscach.** Funkcja `public.medicine_check` oznacza każdą pasującą pozycję jako `variant` albo `substance` (`supabase/migrations/20261010120000_medicine_check.sql:152-155`). Komponent zamienia listę pozycji na jeden z trzech tytułów w nieeksportowanej funkcji `verdictOf` (`src/components/registry/MedicineCheckResult.tsx:39-62`, podział pozycji `:140-141`).
- **Odpowiedź z bazy jest rzutowana bez sprawdzenia** w serwisie (`src/lib/services/medicine-check.ts:16`) i w hooku (`src/components/hooks/useMedicineCheck.ts:43`). Pozycja z innym `match` niż dwa znane wypada z obu list i ekran pokazuje „Nie masz tego leku”. Odpowiedź 200 bez tablicy `items` wywala komponent w trakcie renderowania (`MedicineCheckResult.tsx:140`).
- **Zastrzeżenie o farmaceucie zależy od pozycji `substance`**, nie od tytułu werdyktu (`MedicineCheckResult.tsx:147`, `:160`, `:175`). Żaden automat tego nie sprawdza.
- **Reguła ma skrypt z 17 przypadkami** (`scripts/medicine-check-check.mjs:214-324`): syntetyczne wiersze, jedna transakcja, zawsze wycofana, rola `authenticated` z ustawionymi danymi tokenu. Działa w zadaniu `smoke` w CI (`.github/workflows/ci.yml:55`). Badania wskazały 22 luki (G1–G22 w `research.md`).
- **Nic nie łączy reguły z ekranem.** `scripts/ui-shots.mjs` renderuje werdykty z ręcznie wpisanych odpowiedzi, a skrypt reguły nie zna logiki werdyktu.
- **Nie ma narzędzia do testów** (`package.json:5-21`). `tsconfig.json:3` obejmuje `**/*`, więc pliki testowe i konfiguracja przechodzą przez `npx astro check` i ESLint z regułami typów.
- **Lokalny Supabase nie jest uruchomiony** (stan na 2026-10-13). Etapy 5 i 6 go wymagają.

## Desired End State

- `npm test` uruchamia testy bez bazy: logikę werdyktu, bezpiecznik odpowiedzi i komponent wyniku.
- `npm run test:db` uruchamia testy reguły na lokalnej bazie. Każdy przypadek sprawdza wynik reguły, a potem przepuszcza go przez tę samą logikę werdyktu, której używa ekran.
- Zadanie `smoke` w CI uruchamia `npm run test:db` zamiast usuniętego skryptu.
- Nieznany typ dopasowania i niepełna odpowiedź kończą się na ekranie stanem błędu z przyciskiem „Spróbuj ponownie”.
- W folderze zmiany leży wynik jednorazowego pomiaru nazw powszechnych na pełnym rejestrze, z decyzją autora dla każdego potwierdzonego przypadku.
- `context/foundation/test-plan.md` (§4, §6) i `AGENTS.md` opisują nowe polecenia i wzorce.

Sprawdzenie: `npm test`, `npm run test:db` (z lokalną bazą), `npm run lint`, `npx astro check`, `npm run build` kończą się kodem 0, a zadania `ci` i `smoke` na pull requeście są zielone.

### Key Discoveries:

- Pliki pod testem nie importują modułów `astro:*`, więc wystarcza zwykły plik konfiguracji Vitest. `getViteConfig()` załadowałby wtyczkę Cloudflare, która ma historię awarii przy starcie Vitest (`research.md`, sekcja „The test runner”).
- Wersje sprawdzone w rejestrze npm 2026-10-13: Vitest 5.0.4 (Node `^22.12.0`; Vite `^6.4.0`, `^7.0.0` albo `^8.0.0`, w projekcie jest 8.3.0), jsdom 29.x (Node `^22.13.0`; lokalnie 22.14.0), `@testing-library/react` 16.3.3 (React 19), `@stryker-mutator/core` i `@stryker-mutator/vitest-runner` 10.0.0 (Vitest `>=2.0.0`). jsdom 30 wymaga Node `^22.22.2` i odpada.
- `pg` jest zainstalowane (8.23.1), ale bez typów. Testy bazy w TypeScripcie potrzebują `@types/pg`.
- Baza zwraca przy każdej pozycji `matchedBy` (`common_name`, `substances` albo `null`), a ekran tego nie pokazuje (`src/types.ts:89-90`).
- Migracje trafiają na produkcję ręcznie, więc baza i wdrożona aplikacja mogą się chwilowo różnić. Test w CI tego nie łapie; bezpiecznik w aplikacji tak.
- Wyrocznie (oczekiwane wyniki) pochodzą z PRD (`context/foundation/prd.md:73-80`, `:167`, `:169`, `:221-225`), z decyzji D1–D3 i ręcznie sprawdzonych par (`context/archive/2026-10-09-medicine-check/research.md:43-45`, `:55-58`) oraz z decyzji autora z 2026-10-13 zapisanych poniżej. Nie pochodzą z bieżącego wyniku kodu.

## What We're NOT Doing

- **Zmiana reguły w bazie.** Żadnej nowej migracji w tej zmianie. Gdy test ujawni błąd reguły albo ekranu, wdrożenie zatrzymuje się i pyta autora (decyzja z 2026-10-13).
- **Osobne komunikaty „ta sama substancja czynna” i „ta sama nazwa powszechna”.** Pomysł autora z 2026-10-13; osobna zmiana, najbliżej S-06. Tutaj tylko sprawdzamy `matchedBy` w testach.
- **Ocena prawna treści zastrzeżenia.** Testy sprawdzają, że zastrzeżenie o farmaceucie lub lekarzu jest widoczne przy każdej tej samej substancji. Nie rozstrzygają, czy jego treść wystarcza prawnie; to PRD Open Question 5 i nieznana przy S-06. Testy komponentu przypinają obecny tekst, więc zmiana treści po weryfikacji wymaga poprawienia jednej stałej w teście.
- **Łączenie soli tej samej substancji.** Brak dopasowania przy innej soli i innej nazwie powszechnej zostaje jako znane ograniczenie z testem.
- **Testy bez bazy w CI.** Krok `npm test` w zadaniu `ci` należy do Fazy 4 planu testów.
- **Stryker w CI.** Jednorazowe uruchomienie lokalne.
- **Ilość równa zero** (pusta paczka liczy się jako „masz”, G13). Decyzja dla S-05.
- **Uprawnienie `anon` do funkcji** (G21) i izolacja kont poza istniejącym przypadkiem. To Faza 3 planu testów.
- **Bezpośrednie testy funkcji pomocniczych SQL** (G20). Są sprawdzane przez przypadki reguły.
- **Etykieta „przeterminowany”** i zielony werdykt przy przeterminowanych paczkach (F4, S-08).
- **Walidacja odpowiedzi po stronie serwera.** Bezpiecznik działa w przeglądarce i obejmuje oba miejsca rzutowania.
- **Oczekiwane wyniki dla spacji nierozdzielającej, innych separatorów niż „+” i różnic w odstępach** (G3, G10, G12). Źródła ich nie rozstrzygają; trafiają do pomiaru w etapie 6.

## Implementation Approach

Kolejność: najpierw narzędzie, potem logika bez bazy (tanie testy), potem ekran, na końcu baza i pomiar.

- **Dwie warstwy.** Testy bez bazy sprawdzają mapowanie wyniku na werdykt i to, co ekran wyświetla. Testy na prawdziwej bazie sprawdzają regułę, bo atrapa skłamałaby o porównaniu zbiorów i o RLS.
- **Jeden most.** Testy bazy przepuszczają prawdziwy wynik `medicine_check` przez bezpiecznik i logikę werdyktu. To jedyne miejsce, które łapie rozjazd nazw pól między SQL a TypeScriptem.
- **Tryb wykonania.** Etapy 2 i 3 nadają się do `/10x-tdd` (pierwszy czerwony test da się nazwać jednym zdaniem). Pozostałe idą przez `/10x-implement`.
- **Zatrzymanie przy prawdziwym błędzie.** Test, który nie przechodzi z winy reguły albo ekranu, nie jest osłabiany ani oznaczany jako pominięty. Wdrożenie pokazuje autorowi przypadek i wyrocznię, a autor decyduje.

## Critical Implementation Details

- **Pliki testowe nigdy pod `src/pages/`.** Astro traktuje pliki `.ts` w tym katalogu jako trasy. Testy bez bazy leżą obok kodu w `src/lib/` i `src/components/`, testy bazy w `tests/db/`.
- **Testy bazy nie mogą się po cichu pominąć.** Brak `DATABASE_URL` albo adres inny niż lokalny ma zakończyć uruchomienie błędem, nie pominięciem. Pominięty zestaw w CI wyglądałby jak sukces.
- **Bezpiecznik nie może odrzucać prawdziwych odpowiedzi.** Zbyt surowy pokazałby błąd każdemu użytkownikowi. Dlatego każdy wynik z bazy w etapie 5 musi przez niego przejść.
- **Sprzątanie po renderowaniu.** Vitest działa bez globalnych funkcji, więc Testing Library nie posprząta sama. Sprzątanie po każdym teście trzeba podpiąć w pliku przygotowującym projekt komponentów.

## Phase 1: Narzędzie do testów

### Overview

Instalujemy Vitest i przygotowujemy dwa osobne uruchomienia: bez bazy i z bazą. Po tym etapie polecenia istnieją i przechodzą na pustym zestawie.

### Changes Required:

#### 1. Zależności i polecenia

**File**: `package.json`, `package-lock.json`

**Intent**: Dodać narzędzie do testów i polecenia, z których korzystają kolejne etapy i Faza 4 planu testów.

**Contract**: Nowe `devDependencies`: `vitest` (5.x), `jsdom` (29.x, nie 30), `@testing-library/react`, `@testing-library/dom`, `@types/pg`. Nowe skrypty: `test` (testy bez bazy, jednorazowo), `test:watch`, `test:db` (testy bazy z osobnym plikiem konfiguracji).

#### 2. Konfiguracja testów bez bazy

**File**: `vitest.config.ts`

**Intent**: Uruchamiać testy logiki w środowisku Node i testy komponentów w jsdom, bez Astro i bez wtyczki Cloudflare.

**Contract**: Zwykły `defineConfig` z `vitest/config`, bez `getViteConfig()`. Alias `@/` na `./src`. Dwa projekty: `unit` (`src/**/*.test.ts`, Node) i `component` (`src/**/*.test.tsx`, jsdom, plik przygotowujący ze sprzątaniem po każdym teście). Bez globalnych funkcji testowych. Wtyczkę `@vitejs/plugin-react` dodać tylko wtedy, gdy JSX nie przetworzy się bez niej.

#### 3. Konfiguracja testów bazy

**File**: `vitest.db.config.ts`

**Intent**: Oddzielić testy wymagające bazy, żeby `npm test` i Stryker nie potrzebowały Supabase.

**Contract**: Obejmuje `tests/db/**/*.test.ts`, środowisko Node, pliki uruchamiane po kolei (jedno połączenie, jedna transakcja na plik). Alias `@/` jak wyżej.

#### 4. Plik przygotowujący testy komponentów

**File**: `tests/setup-component.ts`

**Intent**: Sprzątać wyrenderowane drzewo po każdym teście i przywracać podmienione funkcje globalne.

**Contract**: Wywołuje sprzątanie Testing Library i przywrócenie atrap w `afterEach`.

### Success Criteria:

#### Automated Verification:

- Testy bez bazy uruchamiają się na pustym zestawie: `npm test -- --passWithNoTests`
- Lint przechodzi z nowymi plikami konfiguracji: `npm run lint`
- Typy przechodzą: `npx astro sync && npx astro check`
- Build przechodzi i nie zawiera plików testowych: `npm run build`

**Implementation Note**: Ten etap nie ma kroków ręcznych. Po przejściu automatów przejdź do commita i kolejnego etapu.

---

## Phase 2: Logika werdyktu w osobnym pliku

### Overview

Przenosimy podział pozycji i wybór werdyktu z komponentu do czystej funkcji i opisujemy ją testami. Zachowanie ekranu się nie zmienia. Tryb: `/10x-tdd`. Pierwszy czerwony test: „zwraca werdykt »ta sama substancja« z zastrzeżeniem, gdy w apteczce jest tylko pozycja dopasowana po substancji”.

### Changes Required:

#### 1. Czysta funkcja werdyktu

**File**: `src/lib/medicine-check-verdict.ts`

**Intent**: Jedno miejsce, które z odpowiedzi sprawdzenia wylicza to, co ekran ma pokazać, do użycia przez komponent i przez testy bazy.

**Contract**: Eksportuje `checkVerdict(result: MedicineCheckResponse)` zwracające: `kind` (`"variant" | "substance" | "none"`), `title`, `detail`, listy `variants` i `same`, flagę `caution` (prawda, gdy jest co najmniej jedna pozycja `substance`) i flagę `uncomparable` (prawda, gdy `comparable` jest fałszem). Tylko importy typów z `@/types`; bez Reacta, ikon i klas CSS.

#### 2. Komponent korzysta z funkcji

**File**: `src/components/registry/MedicineCheckResult.tsx`

**Intent**: Usunąć lokalne `verdictOf`, `packCount` i podział pozycji; komponent dobiera tylko ikonę i klasy do `kind` i wyświetla wynik funkcji.

**Contract**: Wygląd, teksty i komunikat dla czytnika ekranu bez zmian. Teksty zastrzeżeń (`CAUTION`, `UNCOMPARABLE`) zostają w komponencie, a o ich pokazaniu decydują flagi z funkcji.

#### 3. Testy logiki werdyktu

**File**: `src/lib/medicine-check-verdict.test.ts`

**Intent**: Udowodnić, że dopasowanie nigdy nie staje się „nie masz” i że zastrzeżenie towarzyszy każdej pozycji po substancji.

**Contract**: Przypadki z wyroczni PRD FR-011, FR-012 i planu S-03:

- Sama pozycja `variant` daje „Masz ten lek · 1 opakowanie”, bez zastrzeżenia.
- Liczba opakowań po polsku: 1, 2, 5, 12, 22 (jeden test parametryzowany).
- Sama pozycja `substance` daje „Masz lek z tą samą substancją czynną”, nazwy leków bez powtórzeń i `caution`.
- `variant` razem z `substance` daje tytuł „Masz ten lek”, a `caution` pozostaje prawdą.
- Pusta lista przy `comparable: true` daje „Nie masz tego leku” z dopiskiem o substancji.
- Pusta lista przy `comparable: false` daje „Nie masz tego leku” bez dopisku i z `uncomparable`.
- Właściwość: każda lista z co najmniej jedną pozycją `variant` albo `substance` daje `kind` różne od `"none"` (test parametryzowany po kombinacjach).

### Success Criteria:

#### Automated Verification:

- Testy logiki werdyktu przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Skan widoków przechodzi: `npm run ui:scan`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Na `http://localhost:4321/szukaj` trzy werdykty (lek z apteczki, lek z tą samą substancją, lek spoza apteczki) wyglądają i brzmią jak przed zmianą

**Implementation Note**: Po przejściu automatów zatrzymaj się i poproś autora o potwierdzenie kroku ręcznego. Powiedz wprost, że to test ręczny, i zaproponuj wykonanie go samodzielnie.

---

## Phase 3: Bezpiecznik odpowiedzi

### Overview

Nieznana albo niepełna odpowiedź sprawdzenia kończy się stanem błędu zamiast „Nie masz tego leku”. To zmiana zachowania produkcyjnego. Tryb: `/10x-tdd`. Pierwszy czerwony test: „odrzuca odpowiedź, w której pozycja ma nieznany typ dopasowania”.

### Changes Required:

#### 1. Sprawdzenie kształtu odpowiedzi

**File**: `src/lib/medicine-check-verdict.ts`

**Intent**: Odróżnić odpowiedź, którą ekran umie pokazać, od takiej, która dałaby fałszywy werdykt albo awarię renderowania.

**Contract**: Eksportuje `parseMedicineCheck(body: unknown): MedicineCheckResponse | null`. Zwraca `null`, gdy: ciało nie jest obiektem, `searched` nie jest obiektem z polami, które czyta karta wybranego leku (`id` jako liczba, `name` jako tekst, `substances` jako tablica; `src/components/registry/RegistrySearch.tsx:20-36`), `comparable` nie jest wartością logiczną, `items` nie jest tablicą, albo któraś pozycja ma `match` inne niż `"variant"` / `"substance"` lub nie ma pól, z których komponent korzysta bez sprawdzenia (`id` jako liczba, `name` jako tekst, `substances` jako tablica, `units` jako tablica obiektów, `expiresOn` jako tekst albo `null`). Pola, które mogą być `null` w prawdziwej odpowiedzi (`strength`, `form`, `commonName`, `quantity`, `expiryPrecision`), nie są powodem odrzucenia. Napisane ręcznie, bez biblioteki do walidacji.

#### 2. Hook używa sprawdzenia

**File**: `src/components/hooks/useMedicineCheck.ts`

**Intent**: Zastąpić rzutowanie odpowiedzi 200 sprawdzeniem; odrzucona odpowiedź daje status `error`.

**Contract**: Status `ready` tylko dla odpowiedzi, która przeszła `parseMedicineCheck`. Pozostałe ścieżki (401, inne kody, błąd sieci) bez zmian.

#### 3. Testy bezpiecznika

**File**: `src/lib/medicine-check-verdict.test.ts`

**Intent**: Opisać, co jest odrzucane, i potwierdzić, że poprawna odpowiedź przechodzi bez zmian.

**Contract**: Wyrocznia: „błąd jest osobnym stanem, nie »Nie masz«” (plan S-03, `context/archive/2026-10-09-medicine-check/plan.md:262-277`) i decyzja autora z 2026-10-13. Przypadki: nieznany `match`; brak `items`; `items` niebędące tablicą; pozycja bez `substances`; `searched` bez `substances`; pozycja z `expiresOn` jako liczbą; `null`; pusty obiekt; poprawna odpowiedź z pustą listą; poprawna odpowiedź z pozycjami obu typów (zwrócona bez zmian).

### Success Criteria:

#### Automated Verification:

- Testy bezpiecznika i werdyktu przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Na `http://localhost:4321/szukaj` sprawdzenie leku z apteczki i leku spoza apteczki nadal pokazuje werdykt, a nie błąd

**Implementation Note**: Po przejściu automatów zatrzymaj się i poproś autora o potwierdzenie kroku ręcznego. Powiedz wprost, że to test ręczny, i zaproponuj wykonanie go samodzielnie.

---

## Phase 4: Test komponentu wyniku

### Overview

Sprawdzamy to, co użytkownik widzi i co słyszy czytnik ekranu: zastrzeżenie przy każdej tej samej substancji oraz to, że żadna awaria nie pokazuje „Nie masz tego leku”.

### Changes Required:

#### 1. Test komponentu

**File**: `src/components/registry/MedicineCheckResult.test.tsx`

**Intent**: Renderować prawdziwy komponent z prawdziwym hookiem i podstawioną odpowiedzią sieci, a potem sprawdzać widoczny tekst.

**Contract**: Podmieniona jest tylko funkcja `fetch`; hook i logika werdyktu działają naprawdę. Asercje dotyczą wyrenderowanego tekstu i obszaru `role="status"`, nie stanu wewnętrznego. Bez czekania na czas; oczekiwanie przez mechanizmy Testing Library. Daty ważności w danych testowych puste albo odległe, żeby wynik nie zależał od dnia uruchomienia. Przypadki:

- Sama pozycja po substancji: widoczny tytuł „Masz lek z tą samą substancją czynną” i zastrzeżenie o farmaceucie; zastrzeżenie jest też w komunikacie dla czytnika ekranu.
- Pozycja `variant` razem z pozycją po substancji: zastrzeżenie widoczne w sekcji „Także z tą samą substancją czynną”.
- Sama pozycja `variant`: brak zastrzeżenia.
- Brak pozycji przy `comparable: false`: „Nie masz tego leku” razem z uwagą, że rejestr nie podaje substancji.
- Stany awarii (jeden test parametryzowany): odpowiedź 500, 404, błąd sieci, odpowiedź 200 z nieczytelnym ciałem, odpowiedź 200 z nieznanym `match`, odpowiedź 200 bez `items`. Każdy pokazuje „Nie udało się sprawdzić apteczki.” z przyciskiem „Spróbuj ponownie” i nigdzie nie pokazuje „Nie masz tego leku”.
- Odpowiedź 401: „Sesja wygasła — zaloguj się ponownie” z odnośnikiem do logowania, bez „Nie masz tego leku”.
- Ponowienie: po błędzie kliknięcie „Spróbuj ponownie” wysyła drugie zapytanie i pokazuje werdykt z drugiej odpowiedzi.

### Success Criteria:

#### Automated Verification:

- Testy komponentu i logiki przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

**Implementation Note**: Ten etap nie ma kroków ręcznych. Jeśli któryś przypadek nie przechodzi z winy komponentu, zatrzymaj się i zapytaj autora.

---

## Phase 5: Testy reguły w Vitest

### Overview

Przenosimy 17 przypadków ze skryptu do Vitest, dopisujemy przypadki z luk i łączymy regułę z logiką werdyktu. Skrypt znika, a zadanie `smoke` w CI uruchamia nowe polecenie. Wymaga lokalnego Supabase (`npx supabase start`, Docker).

### Changes Required:

#### 1. Pomocnik połączenia i danych

**File**: `tests/db/medicine-check-fixtures.ts`

**Intent**: Przenieść wzorzec ze skryptu: syntetyczne produkty, opakowania, konta i pozycje apteczki w jednej transakcji, która zawsze jest wycofywana, oraz wywołanie reguły jako rola `authenticated` z danymi wybranego konta.

**Contract**: Odmawia pracy bez `DATABASE_URL` i z adresem innym niż `localhost`, `127.0.0.1`, `[::1]` — błędem, nie pominięciem. Identyfikatory syntetyczne od 9 000 000 001, jak w skrypcie, więc działa na bazie z fiksturami i z pełnym rejestrem. Każdy przypadek ma własne konto. Błąd jednego zapytania nie może psuć kolejnych testów (punkt zapisu na test).

#### 2. Testy reguły

**File**: `tests/db/medicine-check.test.ts`

**Intent**: Sprawdzić regułę na przypadkach z wyroczni i przepuścić każdy wynik przez bezpiecznik i logikę werdyktu.

**Contract**: Każdy przypadek sprawdza trzy rzeczy: wynik reguły (`match`, `matchedBy`, `withdrawn`, kolejność tam, gdzie ma znaczenie), przejście przez `parseMedicineCheck` (wynik różny od `null`) oraz `kind` z `checkVerdict`. Przypadki:

- **Przeniesione (17):** wszystkie z `scripts/medicine-check-check.mjs:214-324`, bez zmiany oczekiwań. Nieznany produkt (`null` z reguły) nie przechodzi przez bezpiecznik ani werdykt.
- **Ryzyko 1, oczekiwany werdykt różny od „nie masz”:**
  - druga aktywna paczka tego samego produktu daje `variant` (G1);
  - ta sama marka w innej mocy daje `substance` (G2);
  - moc pusta po jednej stronie i podana po drugiej daje `substance`, nie `variant` (G4);
  - szukany produkt jest wycofany, a reguła nadal odpowiada i znajduje paczkę (G5, D3);
  - wycofana pozycja dopasowana po substancji ma `withdrawn: true` (G6);
  - nazwa powszechna jest ogólnikiem, a zbiory substancji są równe: `substance` z `matchedBy: "substances"` (G7);
  - zbiory substancji w innej kolejności dają dopasowanie (G9);
  - nazwa leku z polskimi znakami różniąca się tylko wielkością liter daje `variant` (G11).
- **Ryzyko 2, oczekiwany brak dopasowania po substancji:**
  - ścisły podzbiór substancji o identycznej pisowni, w obu kierunkach (G14);
  - nazwa powszechna złożona z prawdziwej części i ogólnika nie daje dopasowania po nazwie (G15);
  - ogólnik tylko po jednej stronie (G16);
  - ogólnik zapisany wielkimi literami z polskimi znakami („PREPARAT ZŁOŻONY”) jest nadal ogólnikiem (G11).
- **Decyzje autora z 2026-10-13:**
  - ta sama nazwa powszechna przy różnych zbiorach substancji daje `substance` z `matchedBy: "common_name"` (D1 potwierdzone, G18);
  - gdy zgadzają się oba zbiory, `matchedBy` to `"common_name"` (G19);
  - inna sól i inna nazwa powszechna dają brak dopasowania; nazwa testu mówi, że to przyjęte ograniczenie ostrożnej reguły (G8).
- **Kształt odpowiedzi (G22):** pola, z których korzysta komponent, mają wartości wstawione w danych testowych (`name`, `strength`, `form`, `substances`, `units`, `quantity`), sprawdzone na jednej pozycji.

#### 3. Usunięcie skryptu

**File**: `scripts/medicine-check-check.mjs`

**Intent**: Usunąć skrypt dopiero wtedy, gdy wszystkie 17 przeniesionych przypadków przechodzi w Vitest.

**Contract**: Plik usunięty; żadne polecenie ani dokument go już nie wywołuje.

#### 4. Krok w CI

**File**: `.github/workflows/ci.yml`

**Intent**: Zadanie `smoke` ma nadal sprawdzać regułę przy każdym pull requeście.

**Contract**: W kroku importu fikstur wiersz `node scripts/medicine-check-check.mjs` zastąpiony przez `npm run test:db`, w tym samym miejscu, z tym samym `DATABASE_URL`. Zadanie `ci` bez zmian.

#### 5. Opis poleceń

**File**: `AGENTS.md`, `context/foundation/test-plan.md`

**Intent**: Usunąć odwołania do skryptu, którego już nie ma.

**Contract**: W `AGENTS.md` punkt o `node scripts/medicine-check-check.mjs` w „Command tripwires” zastąpiony punktem o `npm run test:db` (co sprawdza, wymagania, kiedy uruchamiać, gdzie działa w CI). W `test-plan.md` §6.2 „Reference test” i „Run locally” wskazują nowy plik i polecenie.

### Success Criteria:

#### Automated Verification:

- Testy reguły przechodzą na lokalnej bazie po `npx supabase db reset`: `npm run test:db`
- Uruchomienie bez `DATABASE_URL` kończy się błędem, nie pominięciem: `npm run test:db`
- Testy bez bazy nadal przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Żadne odwołanie do usuniętego skryptu nie zostało poza `context/`: wyszukiwanie `medicine-check-check` w repozytorium

#### Manual Verification:

- Po wypchnięciu gałęzi i otwarciu roboczego pull requesta zadanie `smoke` z krokiem `npm run test:db` jest zielone

**Implementation Note**: Po przejściu automatów zatrzymaj się i poproś autora o zgodę na wypchnięcie gałęzi i otwarcie roboczego pull requesta; nie wypychaj bez niej. Chodzi o to, żeby awaria nowego kroku w GitHub Actions wyszła przed etapami 6 i 7. Jeśli nowy przypadek nie przechodzi z winy reguły, nie zmieniaj oczekiwania: zatrzymaj się, pokaż autorowi przypadek i wyrocznię, i zapytaj.

---

## Phase 6: Pomiar na pełnym rejestrze

### Overview

Jednorazowo sprawdzamy na pełnym lokalnym rejestrze, które nazwy powszechne spoza listy ogólników łączą leki o różnym składzie, oraz czy trzy nierozstrzygnięte kształty danych w ogóle występują. Wymaga lokalnego Supabase i pełnego importu (`npm run registry:import`, pobiera plik z RPL).

### Changes Required:

#### 1. Zapytania pomiarowe

**File**: `context/changes/testing-check-verdict-correctness/placeholder-measurement.sql`

**Intent**: Zapisać zapytania tylko do odczytu, żeby pomiar dało się powtórzyć po zmianie reguły.

**Contract**: Korzysta z funkcji `medicine_check_common_name_set` i `medicine_check_substance_set`, żeby mierzyć to, co widzi reguła. Uruchomienie: jednorazowo przez `pg` (polecenie `node` wpisane w nagłówku pliku SQL), z lokalnym `DATABASE_URL`, w transakcji `BEGIN READ ONLY` zakończonej `ROLLBACK`, więc baza sama odrzuca każdy zapis. `psql` nie jest dostępny w tej powłoce. Bez nowego skryptu w `scripts/`. Cztery wyniki:

- Lista nazw powszechnych niebędących ogólnikiem, wspólnych dla co najmniej dwóch produktów, w których co najmniej dwa niepuste zbiory substancji nie mają żadnej wspólnej substancji. Dla każdej: liczba produktów, liczba różnych zbiorów, trzy przykładowe produkty ze składem oraz kolumna „wspólne pierwsze słowo” (prawda, gdy wszystkie zbiory mają substancję zaczynającą się tym samym słowem). Kolumna jest tylko podpowiedzią i niczego nie odsiewa: „Acidum ascorbicum” i „Acidum folicum” mają wspólne pierwsze słowo, a to różne substancje. Kolejność: najpierw wiersze bez wspólnego pierwszego słowa, potem malejąco po liczbie produktów.
- Liczba wartości ze spacją nierozdzielającą w nazwie, mocy, postaci, nazwie powszechnej i nazwie substancji.
- Liczba nazw powszechnych z separatorem innym niż „+” (przecinek, średnik, ukośnik).
- Liczba par produktów, których klucz wariantu różni się wyłącznie odstępami.

#### 2. Wynik pomiaru

**File**: `context/changes/testing-check-verdict-correctness/placeholder-measurement.md`

**Intent**: Dać autorowi listę do oceny i zapisać jego decyzje.

**Contract**: Data stanu rejestru, wersja listy, cztery liczby (liczba podejrzanych nazw i trzy liczniki z pozostałych zapytań), wynik zapytania o małe litery i spację nierozdzielającą z bazy lokalnej i produkcyjnej, pełna lista podejrzanych nazw (albo pierwsze 50 w kolejności z zapytania, z informacją, ile pominięto i ile z pominiętych nie ma wspólnego pierwszego słowa) oraz tabela decyzji autora: prawdziwy ogólnik albo ta sama substancja, i co dalej (test jako znane ograniczenie albo osobna zmiana reguły). Żaden oczekiwany wynik nie trafia do testów przed decyzją autora.

### Success Criteria:

#### Automated Verification:

- Zapytania wykonują się na pełnym lokalnym rejestrze bez błędu i bez zapisu do bazy
- Plik z wynikiem zawiera cztery liczby i listę podejrzanych nazw
- Testy reguły nadal przechodzą na bazie z pełnym rejestrem: `npm run test:db`

#### Manual Verification:

- Autor przejrzał listę podejrzanych nazw i zapisał decyzję dla każdego potwierdzonego ogólnika
- Autor zdecydował, czy liczby dla spacji nierozdzielającej, separatorów i odstępów wymagają dalszych kroków
- Autor uruchomił na bazie produkcyjnej zapytanie o małe litery i spację nierozdzielającą, a wynik jest zapisany w pliku pomiaru obok wyniku z bazy lokalnej

**Implementation Note**: Zapytanie produkcyjne (`select lower('ŻÓŁĆ'), 'a' || chr(160) || 'b' ~ '\s'`) uruchamia wyłącznie autor, w edytorze SQL Supabase; agent nie łączy się z produkcją. To samo zapytanie agent uruchamia na bazie lokalnej. Różnica między wynikami to rozjazd, którego test w CI nie widzi: pokaż ją autorowi i zapytaj (`research.md`, pytanie otwarte 7). To etap z decyzją autora. Po przygotowaniu wyniku zatrzymaj się i poproś o ocenę listy; nie oceniaj jej za autora. Testy wynikające z decyzji dopisz do `tests/db/medicine-check.test.ts` w tym samym etapie.

---

## Phase 7: Stryker i dokumentacja

### Overview

Jednorazowo sprawdzamy testami mutacyjnymi, czy testy naprawdę chronią logikę werdyktu, i zapisujemy wzorce dla kolejnych faz planu testów.

### Changes Required:

#### 1. Konfiguracja testów mutacyjnych

**File**: `stryker.config.json`, `package.json`, `.gitignore`

**Intent**: Umożliwić uruchomienie Strykera na wybranym pliku, bez bazy i bez CI.

**Contract**: `devDependencies`: `@stryker-mutator/core`, `@stryker-mutator/vitest-runner` (10.x). Mutowany tylko `src/lib/medicine-check-verdict.ts`; testy z `vitest.config.ts`; raport HTML i tekstowy. Skrypt `test:mutation`. Katalogi raportu i plików tymczasowych w `.gitignore`. Bez progu wyniku. Jeśli Stryker nie działa z Vitest 5, usuń obie zależności i konfigurację, a powód zapisz w `test-plan.md` §6.6.

#### 2. Asercje dla ocalonych mutacji

**File**: `src/lib/medicine-check-verdict.test.ts`

**Intent**: Dopisać asercje tylko dla mutacji, które zaszkodziłyby użytkownikowi.

**Contract**: Dla każdej ocalonej mutacji odpowiedź na pytanie „czy ta zmiana zaszkodziłaby użytkownikowi?”. Tak: nowa asercja. Nie (mutacja równoważna albo kosmetyczna): świadomie pominięta i zapisana. Bez asercji przypinających szczegóły implementacji.

#### 3. Plan testów

**File**: `context/foundation/test-plan.md`

**Intent**: Zapisać, czego nauczyła ta faza, żeby kolejne fazy nie odkrywały tego od nowa.

**Contract**:

- §4: wiersz „unit + component” to Vitest 5 z jsdom 29 i Testing Library, zwykły plik konfiguracji; wiersz „database integration” to Vitest z `pg` na lokalnym Supabase. Poprawione zdanie o `getViteConfig()` i profil bazy testowej.
- §6.1: wzorzec testu logiki (wyrocznia z PRD, test parametryzowany dla właściwości „dopasowanie nigdy nie daje »nie masz«”).
- §6.2: wzorzec testu reguły (dane syntetyczne, transakcja wycofana, konto na przypadek, wynik przepuszczony przez werdykt).
- §6.3: wzorzec testu komponentu (podmieniony tylko `fetch`, asercje na wyrenderowanym tekście).
- §6.6: notatka z fazy: wynik Strykera, świadomie pominięte mutacje, znane ograniczenia przypięte testami, wynik pomiaru z etapu 6.
- §8: daty przeglądu.

Sekcja §3 (status faz) należy do `/10x-test-plan` i zostaje bez zmian.

#### 4. Reguły projektu i README

**File**: `AGENTS.md`, `README.md`

**Intent**: Opisać nowe polecenia tam, gdzie szukają ich ludzie i agenci.

**Contract**: W `AGENTS.md` „Command tripwires” dostaje punkty o `npm test` i `npm run test:mutation`, a zdanie „There is no unit test runner yet” zostaje zastąpione opisem, gdzie leżą testy i że nigdy pod `src/pages/`. W `README.md` tabela „Scripts” dostaje `npm test` i `npm run test:db`, a opis zadania `smoke` wspomina o testach reguły.

### Success Criteria:

#### Automated Verification:

- Stryker kończy uruchomienie i zapisuje raport: `npm run test:mutation`
- Testy bez bazy przechodzą po dopisaniu asercji: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Autor zatwierdził listę świadomie pominiętych mutacji
- Po wypchnięciu gałęzi i otwarciu pull requesta zadania `ci` i `smoke` są zielone

**Implementation Note**: Po przejściu automatów zatrzymaj się i poproś autora o potwierdzenie kroków ręcznych. Pull request istnieje od etapu 5 w wersji roboczej: wypchnij nowe commity i oznacz go jako gotowy do przeglądu. Jeśli go nie ma, otwórz go po wypchnięciu gałęzi (reguła z `context/foundation/lessons.md`).

---

## Testing Strategy

### Unit Tests:

- Logika werdyktu: każda kombinacja pozycji `variant` i `substance`, obie wartości `comparable`, polska odmiana liczby opakowań.
- Bezpiecznik: nieznany typ dopasowania, brakujące i błędne pola, poprawne odpowiedzi przechodzą bez zmian.
- Komponent: zastrzeżenie przy każdej tej samej substancji, stany awarii bez „Nie masz tego leku”, ponowienie.

### Integration Tests:

- Reguła `medicine_check` na prawdziwej lokalnej bazie: 17 przeniesionych przypadków i nowe przypadki z luk, każdy przepuszczony przez bezpiecznik i logikę werdyktu.
- Znane ograniczenia przypięte testami z nazwą, która to mówi: inna sól z inną nazwą powszechną; ewentualne ogólniki z etapu 6 według decyzji autora.

### Manual Testing Steps:

1. Uruchom aplikację lokalnie i otwórz `http://localhost:4321/szukaj`.
2. Sprawdź lek, który jest w apteczce: zielony werdykt „Masz ten lek”.
3. Sprawdź lek z tą samą substancją co lek w apteczce: żółty werdykt i zastrzeżenie o farmaceucie.
4. Sprawdź lek spoza apteczki: „Nie masz tego leku”.
5. Po otwarciu pull requesta sprawdź, że zadania `ci` i `smoke` są zielone.

## Performance Considerations

- Bezpiecznik to kilka porównań na odpowiedzi z co najwyżej kilkunastoma pozycjami; bez biblioteki, więc bez wpływu na rozmiar kodu w przeglądarce (margines z S-09).
- `npm run test:db` zastępuje skrypt w zadaniu `smoke`. Start Vitest dodaje kilka sekund do zadania, które trwa około 2,5 minuty.
- Testy bez bazy nie działają w CI do Fazy 4, więc nie wydłużają zadania `ci`.

## Migration Notes

- Brak migracji bazy i zmian danych.
- Etap 3 zmienia zachowanie produkcyjne: odpowiedź, której aplikacja nie rozumie, pokazuje błąd z ponowieniem zamiast „Nie masz tego leku”. Wycofanie to cofnięcie commita etapu 3.
- Do Fazy 4 testy bez bazy są uruchamiane tylko lokalnie. Regresja w logice werdyktu nie zablokuje wdrożenia; zablokuje ją dopiero test reguły w `smoke`, jeśli dotyczy nazw pól lub wartości z bazy.

## References

- Related research: `context/changes/testing-check-verdict-correctness/research.md`
- Plan testów: `context/foundation/test-plan.md` (§2 ryzyka 1 i 2, §3 Faza 1, §6)
- PRD: `context/foundation/prd.md:73-80`, `:167`, `:169`, `:221-225`
- Decyzje D1–D3 i sprawdzone pary: `context/archive/2026-10-09-medicine-check/research.md:43-45`, `:55-58`
- Wzorzec danych i transakcji: `scripts/medicine-check-check.mjs:33-196`
- Reguła: `supabase/migrations/20261010120000_medicine_check.sql:110-225`
- Logika werdyktu dziś: `src/components/registry/MedicineCheckResult.tsx:39-62`, `:138-180`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Narzędzie do testów

#### Automated

- [x] 1.1 Testy bez bazy uruchamiają się na pustym zestawie: `npm test -- --passWithNoTests` — e9fe0b4
- [x] 1.2 Lint przechodzi z nowymi plikami konfiguracji: `npm run lint` — e9fe0b4
- [x] 1.3 Typy przechodzą: `npx astro sync && npx astro check` — e9fe0b4
- [x] 1.4 Build przechodzi i nie zawiera plików testowych: `npm run build` — e9fe0b4

### Phase 2: Logika werdyktu w osobnym pliku

#### Automated

- [x] 2.1 Testy logiki werdyktu przechodzą: `npm test`
- [x] 2.2 Lint przechodzi: `npm run lint`
- [x] 2.3 Skan widoków przechodzi: `npm run ui:scan`
- [x] 2.4 Typy przechodzą: `npx astro check`
- [x] 2.5 Build przechodzi: `npm run build`

#### Manual

- [x] 2.6 Na `http://localhost:4321/szukaj` trzy werdykty (lek z apteczki, lek z tą samą substancją, lek spoza apteczki) wyglądają i brzmią jak przed zmianą

### Phase 3: Bezpiecznik odpowiedzi

#### Automated

- [ ] 3.1 Testy bezpiecznika i werdyktu przechodzą: `npm test`
- [ ] 3.2 Lint przechodzi: `npm run lint`
- [ ] 3.3 Typy przechodzą: `npx astro check`
- [ ] 3.4 Build przechodzi: `npm run build`

#### Manual

- [ ] 3.5 Na `http://localhost:4321/szukaj` sprawdzenie leku z apteczki i leku spoza apteczki nadal pokazuje werdykt, a nie błąd

### Phase 4: Test komponentu wyniku

#### Automated

- [ ] 4.1 Testy komponentu i logiki przechodzą: `npm test`
- [ ] 4.2 Lint przechodzi: `npm run lint`
- [ ] 4.3 Typy przechodzą: `npx astro check`

### Phase 5: Testy reguły w Vitest

#### Automated

- [ ] 5.1 Testy reguły przechodzą na lokalnej bazie po `npx supabase db reset`: `npm run test:db`
- [ ] 5.2 Uruchomienie bez `DATABASE_URL` kończy się błędem, nie pominięciem: `npm run test:db`
- [ ] 5.3 Testy bez bazy nadal przechodzą: `npm test`
- [ ] 5.4 Lint przechodzi: `npm run lint`
- [ ] 5.5 Typy przechodzą: `npx astro check`
- [ ] 5.6 Żadne odwołanie do usuniętego skryptu nie zostało poza `context/`: wyszukiwanie `medicine-check-check` w repozytorium

#### Manual

- [ ] 5.7 Po wypchnięciu gałęzi i otwarciu roboczego pull requesta zadanie `smoke` z krokiem `npm run test:db` jest zielone

### Phase 6: Pomiar na pełnym rejestrze

#### Automated

- [ ] 6.1 Zapytania wykonują się na pełnym lokalnym rejestrze bez błędu i bez zapisu do bazy
- [ ] 6.2 Plik z wynikiem zawiera cztery liczby i listę podejrzanych nazw
- [ ] 6.3 Testy reguły nadal przechodzą na bazie z pełnym rejestrem: `npm run test:db`

#### Manual

- [ ] 6.4 Autor przejrzał listę podejrzanych nazw i zapisał decyzję dla każdego potwierdzonego ogólnika
- [ ] 6.5 Autor zdecydował, czy liczby dla spacji nierozdzielającej, separatorów i odstępów wymagają dalszych kroków
- [ ] 6.6 Autor uruchomił na bazie produkcyjnej zapytanie o małe litery i spację nierozdzielającą, a wynik jest zapisany w pliku pomiaru obok wyniku z bazy lokalnej

### Phase 7: Stryker i dokumentacja

#### Automated

- [ ] 7.1 Stryker kończy uruchomienie i zapisuje raport: `npm run test:mutation`
- [ ] 7.2 Testy bez bazy przechodzą po dopisaniu asercji: `npm test`
- [ ] 7.3 Lint przechodzi: `npm run lint`
- [ ] 7.4 Typy przechodzą: `npx astro check`
- [ ] 7.5 Build przechodzi: `npm run build`

#### Manual

- [ ] 7.6 Autor zatwierdził listę świadomie pominiętych mutacji
- [ ] 7.7 Po wypchnięciu gałęzi i otwarciu pull requesta zadania `ci` i `smoke` są zielone
