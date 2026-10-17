# Faza 3 wdrażania testów — dostęp do apteczki i granice danych wejściowych: plan implementacji

## Overview

Faza 3 planu testów (`context/foundation/test-plan.md` §3) ma dowieść dwóch rzeczy. Ryzyko #4: dane apteczki są odizolowane per konto, a bez sesji nie da się do nich dostać. Ryzyko #6: endpointy apteczki czysto odrzucają nieprawidłowe dane. Dowód powstaje na dwóch warstwach:

- **baza**: nowe przypadki w istniejącej uprzęży `tests/db` (drugie konto, rola `anon`, ograniczenia kolumn, przypięta luka F2, strażnik `security definer`);
- **API aplikacji**: nowy projekt Vitest `npm run test:api`, czarna skrzynka HTTP na uruchomionym serwerze.

Oba zestawy działają w CI od tej fazy.

## Current State Analysis

Pełne ustalenia: `context/changes/testing-kit-access-and-input-boundaries/research.md`. Najważniejsze:

- **Izolacja stoi w bazie.**
  - Cztery polityki RLS per operacja `user_id = (select auth.uid())`, `user_id default auth.uid()`, brak polityk i grantów dla `anon` (`supabase/migrations/20261007120000_kit_items.sql:17`, `:44-76`).
  - `medicine_check` i `registry_variant_packages` są `security invoker` z odebranym `execute` dla `public, anon` (`20261010120000_medicine_check.sql:113`, `:234-238`; `kit_items.sql:100`, `:126`).
  - API aplikacji nie przyjmuje właściciela: `.strict()` w `src/pages/api/kit/index.ts:8-18`, a `addKitItem` nie podaje `user_id` (`src/lib/services/kit.ts:100-109`).
- **Pokrycie dziś:**
  - `scripts/smoke.mjs:181-257`: anonim dostaje 401/302, drugie konto nie widzi leku na `/apteczka` ani w sprawdzeniu, ujemna ilość i nieznane opakowanie dają 400;
  - `tests/db/medicine-check.test.ts:593-599`: jeden przypadek RLS na RPC.
  - Brak bezpośrednich `select/insert/update/delete` jako inne konto, cudzego `user_id`, zmiany `user_id`, roli `anon` na tabeli i funkcjach (G21 odłożone do tej fazy).
  - Z #6 brak większości granic: wycofane opakowanie, ilość ponad opakowanie, ilość > 100000, typy, `expiry`, nieznany klucz, zły JSON, 415, „nic nie zapisano”.
- **Na zbadanych ścieżkach żadne dane nie dają 500.** Testy chronią przed regresją, nie wykrywają znanego defektu.
- **Niezmienniki #6 są dwupoziomowe.** Baza pilnuje tylko `quantity >= 0`, enum precyzji, pary data/precyzja i klucza obcego (`kit_items.sql:18-24`). Limit opakowania, wycofane opakowanie, zakres lat i precyzja `month` istnieją tylko w API. Właściciel może je ominąć przez API danych na własnych wierszach (F2, przyjęte; `roadmap.md:301` Parked).
- **Kolejność w trasach**: 503 → 401 → 415 → 400 → 201/500 (`index.ts:28-80`, `check.ts:16-39`). Anonim zawsze dostaje 401 niezależnie od treści.
- **Dane graniczne z rejestru** (ustalone w planowaniu):
  - fixture'y zawierają opakowania z jednym wpisem i liczbową ilością (np. `72840`: `liczbaOpakowan="10"`, `sasz.`; `scripts/fixtures/rpl-sample-v1.xml:50-53`);
  - po imporcie v1, v1, v2 opakowanie `4` jest wycofane przy aktywnym produkcie, a produkt `100434824` jest wycofany (`scripts/registry-import-check.mjs:8`, `:11`).
- **W migracjach nie ma żadnej funkcji `security definer` ani `create extension`** (grep po `supabase/migrations/`).

## Desired End State

- `npm run test:db` zawiera nowy plik `tests/db/kit-access.test.ts`. Dowodzi on na danych dwóch syntetycznych kont i roli `anon`:
  - drugie konto nie może odczytać, dodać do, zmienić ani usunąć cudzej apteczki;
  - cudzego `user_id` nie da się wstawić ani przypisać;
  - `anon` nie ma dostępu do tabeli ani funkcji;
  - ograniczenia kolumn działają;
  - luka F2 jest przypięta nazwanymi testami;
  - żadna funkcja w `public` nie jest `security definer`.
- `npm run test:api` (nowy `vitest.api.config.ts`, pliki w `tests/api/`) dowodzi przez HTTP na uruchomionym serwerze:
  - każde nieprawidłowe żądanie do `POST /api/kit` i `GET /api/kit/check` dostaje czyste 4xx (nigdy 500), nie zmienia liczby wierszy konta i nie zawiera w treści nic z wnętrza serwera;
  - anonim dostaje 401 niezależnie od treści;
  - drugie konto nie może przez API aplikacji dodać do cudzej apteczki ani zobaczyć cudzego wiersza.
- Job `smoke` w CI uruchamia `test:api` po `smoke`.
- AGENTS.md, README i plan testów (§3 uwaga, §6.2, §6.4, §6.6, §7, §8) opisują nowe zestawy i wzorce.

### Key Discoveries:

- Uprząż `tests/db` przełącza rolę i `request.jwt.claims` (`tests/db/medicine-check-fixtures.ts:144-167`). `World` umie już tworzyć produkty z `units`, wycofane opakowania i konta. `connectLocal` rzuca błąd bez lokalnego `DATABASE_URL` (`:11-28`).
- `set role` sprawdza członkostwo **użytkownika sesji** (`postgres`), więc z `authenticated` można przejść na `anon` i z powrotem bez `reset role`.
- `/apteczka?dodano=<id>` szuka id tylko na liście konta i ignoruje cudze (`src/pages/apteczka.astro:22-28`). Puste konto pokazuje „Apteczka jest pusta” (`:87`), a potwierdzenie ma postać „Dodano: <nazwa>” (`:68`).
- Smoke działa na `npm run preview` w kroku CI `Run smoke test against production preview` (`.github/workflows/ci.yml:62-66`). Plik `supabase.env` ma `DB_URL`, `API_URL` i `ANON_KEY` (`:46`).
- Limit `sign_in_sign_ups = 30` na 5 min (`supabase/config.toml:190`), potwierdzanie e-maili wyłączone (`:209`).

## What We're NOT Doing

- **Test przez prawdziwe PostgREST z JWT** (supabase-js + klucz anon). Uprząż SQL sprawdza te same polityki i granty, bez zmian w CI i bez kont, których nie da się posprzątać. Wykluczenie trafia do §7 planu testów.
- **Zamknięcie luki F2** (twarda granica opakowania i daty w bazie). To zmiana produktu, zaparkowana w roadmapie. Tu tylko ją przypinamy testami.
- **Usuwanie `issues` z odpowiedzi 400.** Ścieżka pola i komunikat zod to szczegóły żądania, nie serwera (decyzja autora 2026-10-17). Testy pilnują, żeby w treści nie było niczego z wnętrza serwera.
- **Testy edycji i usuwania przez API aplikacji.** Tych tras nie ma do S-05. Na poziomie danych są pokryte w Fazie 1 tego planu.
- **Zmiany w `scripts/smoke.mjs`.** Zostaje bez zależności. Pomocnik sesji w `tests/api/` to jego osobna kopia.
- **Wymuszenie bramki jako wymaganej** (branch protection, hooki agenta) — to Faza 4 planu testów.
- **Wywoływanie handlerów tras wprost w Vitest** — wymagałoby podmiany `astro:env/server` i pomijałoby middleware.
- **Wymuszanie odpowiedzi 500** z zewnątrz. Stały komunikat 500 jest w kodzie (`index.ts:76-80`, `check.ts:35-39`), a testy pilnują tylko, że żadne nieprawidłowe dane do niego nie prowadzą.

## Implementation Approach

Fazy 1 i 2 dotykają rozłącznych plików i nie zależą od siebie, więc **można je wykonać równolegle**. Faza 3 (CI i dokumentacja) czeka na obie.

Wartości oczekiwane biorą się ze źródeł granic, nie z kodu:

- polityki RLS i granty z migracji;
- typy kolumn (`integer`, `bigint`);
- kontrakt S-04 (`context/archive/2026-10-07-add-medicine-to-kit/plan.md:146`, `:47-48`);
- F1 (`MAX_QUANTITY` = 100000 jako granica bezpieczeństwa przed przepełnieniem `integer`).

Liczby graniczne są w testach literałami z komentarzem o źródle, nie importem stałej ani schematu z kodu. Każda granica ma obie strony: wartość tuż za granicą daje 4xx, wartość na granicy daje 201. Inaczej zbyt surowe API przeszłoby niezauważone.

## Critical Implementation Details

- **Błąd SQL przerywa transakcję.** W `tests/db` każda instrukcja, której oczekujemy jako odrzuconej, musi iść we własnym zagnieżdżonym savepoincie (`savepoint` → instrukcja → `rollback to savepoint`). Inaczej kolejne instrukcje w teście padną z „current transaction is aborted”. Rolę i `request.jwt.claims` ustawiaj **przed** wewnętrznym savepointem: `rollback to savepoint` cofa też `set local` wykonane po nim.
- **Odrzucenie przez RLS ma dwie postaci.**
  - `select`, `update` i `delete` cudzych wierszy nie rzucają błędu, tylko dotykają 0 wierszy. Test sprawdza `rowCount === 0` **i** to, że wiersz po operacji (odczytany jako właściciel tabeli) jest nienaruszony.
  - `insert` z cudzym `user_id` i `update` zmieniający `user_id` na cudzy rzucają `42501` (`with check`).
  - Brak grantu (`anon`, `truncate`) też daje `42501`.
- **Limit logowań lokalnie.** Każdy przebieg `test:api` zakłada 2 konta (2 rejestracje + 2 logowania). Przy wielu przebiegach w ciągu 5 minut lokalny Supabase odrzuci rejestrację (limit 30). Błąd rejestracji musi to mówić wprost, a nie wyglądać jak porażka testu dostępu.

## Faza 1: Izolacja i ograniczenia w bazie

### Overview

Nowe przypadki w `tests/db` na syntetycznych danych w wycofywanej transakcji. Dowodzą #4 na poziomie danych (każda operacja, drugie konto, `anon`) oraz tej części #6, którą egzekwuje baza. Przypinają też lukę F2 i dodają strażnika `security definer`.

### Changes Required:

#### 1. Pomocniki ról i oczekiwanych błędów

**File**: `tests/db/medicine-check-fixtures.ts`

**Intent**: Dodać do uprzęży przełączanie na wybrane konto i na `anon` (dziś robi to tylko `checkAs` dla jednego RPC) oraz uruchamianie instrukcji oczekiwanej jako odrzucona we własnym savepoincie. Dzięki temu oba pliki testów bazy używają jednego mechanizmu.

**Contract**:

- `actAs(client, userId)`: `set local role authenticated` + `request.jwt.claims = {sub, role: "authenticated"}`.
- `actAsAnon(client)`: `set local role anon` + claims `{role: "anon"}`.
- `actAsOwner(client)`: `reset role`, do odczytu stanu po operacji.
- `expectSqlError(client, sql, params, code)`: zagnieżdżony savepoint, oczekiwany `SQLSTATE`, `rollback to savepoint`.
- `checkAs` zachowuje sygnaturę (może korzystać z `actAs`). Plik zostaje pod obecną nazwą, żeby nie ruszać istniejącego testu.

#### 2. Test izolacji i ograniczeń

**File**: `tests/db/kit-access.test.ts` (nowy)

**Intent**: Dowieść na dwóch syntetycznych kontach A i B (osobna para na grupę przypadków, wzorzec `World`) i roli `anon`, że RLS i granty trzymają izolację per operacja i że baza egzekwuje swoje ograniczenia. Nagłówek pliku nazywa źródła oczekiwań: migrację `kit_items`, test-plan #4/#6 i F2. Struktura jak w `medicine-check.test.ts`: jedna transakcja na plik, savepoint na test.

**Contract** — przypadki, w nawiasie oczekiwany wynik:

- **B wobec wiersza A**:
  - `select` po id i bez filtra (0 wierszy A);
  - `update quantity` (0 wierszy, wiersz A bez zmian);
  - `delete` (0 wierszy, wiersz A istnieje);
  - `insert` z `user_id = A` (`42501`).
- **A wobec własnego wiersza**:
  - `update user_id = B` (`42501`, wiersz A nadal należy do A);
  - `insert` bez `user_id` (wiersz dostaje `user_id = A` z domyślnej wartości);
  - A widzi swój wiersz (kontrola, że test nie przechodzi „bo nic nie widać”).
- **`anon`**:
  - `select`, `insert`, `update` i `delete` na `kit_items` (`42501`);
  - `select public.medicine_check(...)` i `select * from public.registry_variant_packages(...)` (`42501`).
- **`authenticated`**: `truncate kit_items` (`42501`).
- **Ograniczenia bazy** (jako A, na własnym wierszu):
  - `quantity = -1` (`23514`);
  - `expiry_precision = 'week'` (`23514`);
  - data bez precyzji i precyzja bez daty (`23514`);
  - nieistniejące `package_id` (`23503`).
- **Przypięta luka F2** — nazwy zaczynają się od `known gap (Parked, F2):`; wszystkie przechodzą jako A, na własnym wierszu:
  - ilość ponad rozmiar opakowania (opakowanie syntetyczne `units = [{count: "10", kind: "sasz."}]`, `quantity = 999`);
  - `package_id` wycofanego opakowania;
  - `expiry_precision = 'day'` z dowolną datą.
- **Strażnik**: żadna funkcja w `pg_proc` ze schematu `public` nie ma `prosecdef = true`. Lista wyjątków jest pusta i opisana komentarzem: dopisanie wyjątku to świadoma decyzja z uzasadnieniem, nie poprawka testu.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset`, potem `npm run test:db` przechodzi: nowe przypadki i dotychczasowe 35 bez zmian
- `npm run lint` przechodzi
- `npx astro check` przechodzi

#### Manual Verification:

- Sprawdzenia mutacyjne na lokalnej bazie (SQL wykonany ręcznie, po każdym `npx supabase db reset`) wywracają właściwe przypadki: `alter policy ... for select using (true)` → izolacja select; `grant select on kit_items to anon` → przypadek `anon`; `alter function public.medicine_check(bigint) security definer` → strażnik oraz istniejący przypadek RLS na RPC; usunięcie `with check` z polityki update (`drop policy` + `create policy` bez `with check`) → przypadek „update user_id = B”
- Nazwy przypadków F2 czytane bez kodu jasno mówią, że to przyjęta luka, nie oczekiwane zachowanie docelowe

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się i zapytaj, czy użytkownik sam wykona sprawdzenia mutacyjne, czy oddaje je agentowi. Nie odhaczaj ich bez jego decyzji.

---

## Faza 2: Granice i dostęp przez API aplikacji

### Overview

Nowy projekt Vitest uruchamiany na działającym serwerze (`BASE_URL`) z lokalną bazą (`DATABASE_URL`, tylko odczyt: wybór danych granicznych i liczenie wierszy konta). Dowodzi #6 na `POST /api/kit` i `GET /api/kit/check` oraz tej części #4, która przechodzi przez API aplikacji.

### Changes Required:

#### 1. Konfiguracja i skrypt

**File**: `vitest.api.config.ts` (nowy), `package.json`

**Intent**: Osobna konfiguracja, żeby `npm test` nigdy nie potrzebował serwera, a `test:db` bazy z innym zakresem plików. Wzorzec: `vitest.db.config.ts`.

**Contract**:

- `include: ["tests/api/**/*.test.ts"]`, `environment: "node"`, alias `@`;
- `fileParallelism: false` (wspólny limit logowań, przewidywalna kolejność);
- dłuższy `testTimeout` dla HTTP;
- skrypt `"test:api": "vitest run --config vitest.api.config.ts"`.

#### 2. Pomocniki HTTP i danych

**File**: `tests/api/helpers.ts` (nowy)

**Intent**: Sesja z ciasteczek jak w `smoke.mjs` (osobna kopia, smoke zostaje bez zależności) oraz odczyty z lokalnej bazy, które wybierają dane graniczne z rejestru zamiast wpisywać id na sztywno. Dzięki temu testy działają i na fixture'ach z CI, i na pełnym rejestrze lokalnie.

**Contract**:

- `BASE_URL` (domyślnie `http://localhost:4321`).
- `signUpAndSignIn(email)` przez `/api/auth/signup` i `/api/auth/signin` → słoik ciasteczek. Zwraca czytelny błąd, gdy rejestracja zostanie odrzucona (np. limit logowań).
- `send(path, { method, body, contentType, jar })` → `{ status, body }` z `redirect: "manual"` i `Origin`. Surowe `body`, żeby dało się wysłać zły JSON i dowolny `Content-Type`.
- Odczyty przez `connectLocal` z `tests/db/medicine-check-fixtures.ts`; każdy rzuca błąd (nigdy nie pomija), gdy rejestr nie ma potrzebnego rekordu:
  - aktywne opakowanie aktywnego produktu z jednym wpisem `units` o dodatniej liczbie całkowitej w `count` (zwraca id i tę liczbę);
  - aktywne opakowanie bez takiej liczby;
  - wycofane opakowanie aktywnego produktu;
  - opakowanie wycofanego produktu;
  - id produktu z opakowaniem.
- `kitRowCount(email)`: liczba wierszy `kit_items` konta o danym e-mailu (join `auth.users`).
- `expectNoInternals(body)`: treść nie zawiera śladów wnętrza serwera (`kit_items`, `registry_`, `violates`, `SQLSTATE`, `syntax error`, ramek stosu `\n    at `, `PostgrestError`).

#### 3. Granice danych wejściowych (#6)

**File**: `tests/api/kit-input.test.ts` (nowy)

**Intent**: Jedno konto zalogowane w `beforeAll`. Każdy przypadek nieprawidłowy sprawdza trzy rzeczy:

- oczekiwany kod 4xx;
- `kitRowCount` bez zmian;
- `expectNoInternals`.

Przypadki prawidłowe na granicy sprawdzają 201 i +1 wiersz. Granice mają komentarz ze źródłem (kolumna, S-04, F1), a nie odwołanie do schematu zod. Przypadki w `it.each` pogrupowane po polu.

**Contract** — `POST /api/kit`:

- **415**: poprawny JSON z `Content-Type: text/plain`; brak `Content-Type`.
- **400 — ciało**: `{`, `[]`, `null`, `"x"`.
- **400 — nieznany klucz**: `userId`, `user_id`.
- **400 — `packageId`**: brak; `0`; `-1`; `1.5`; `"123"`; `null`; `2^53`; `1e20`; id spoza rejestru; wycofane opakowanie; opakowanie wycofanego produktu.
- **400 — `quantity`**: `-1`; `1.5`; `"5"`; `true`; `100001`; rozmiar opakowania + 1 (na opakowaniu z jednym wpisem).
- **400 — `expiry`**: `month` `0` i `13`; `year` `1999` i `2101`; dodatkowy klucz `day`; napis `"2026-10"`.
- **4xx — za duże ciało**: około 100 kB napisu w nieznanym kluczu.
- **201 na granicy**:
  - `quantity` `0`;
  - `quantity` równe rozmiarowi opakowania;
  - `quantity` `100000` na opakowaniu bez liczbowego rozmiaru;
  - `expiry` `{1, 2000}` i `{12, 2100}`;
  - bez `quantity` i `expiry`.

**Contract** — `GET /api/kit/check`:

- **400 dla `product`**: brak; puste; `abc`; `-1`; `0`; `1.5`; `1e3`; `99999999999999999999`.
- **404**: nieznany produkt.

Każda odpowiedź w pliku ma kod różny od 500.

#### 4. Dostęp przez API aplikacji (#4)

**File**: `tests/api/kit-access.test.ts` (nowy)

**Intent**: Uzupełnić smoke o przypadki dostępu, których nie ma: uwierzytelnienie przed walidacją oraz próby dotarcia do cudzej apteczki przez trasy aplikacji. Konta A i B zakładane w `beforeAll`.

**Contract** — przypadki, w nawiasie oczekiwany wynik:

- **Anonim, `POST /api/kit`** z poprawnym ciałem, ciałem niepoprawnym i złym `Content-Type` (401, nigdy 400/415).
- **Anonim, `GET /api/kit/check`** z poprawnym i niepoprawnym `product` (401).
- **B, `POST /api/kit` z `userId` konta A** (400, `kitRowCount(A)` bez zmian).
- **B dodaje poprawny wiersz** (201; +1 u B, A bez zmian — właściciel pochodzi z sesji).
- **A dodaje wiersz, B otwiera `/apteczka?dodano=<id A>`** (200; brak „Dodano:” i nazwy leku A; „Apteczka jest pusta” albo tylko własne wiersze B).

### Success Criteria:

#### Automated Verification:

- Lokalnie z fixture'ami (`npx supabase db reset`, import v1, v1, v2), zbudowaną aplikacją na `npm run preview` i `DATABASE_URL`: `BASE_URL=http://localhost:4321 npm run test:api` przechodzi
- `npm test` nie uruchamia plików z `tests/api/` (liczba plików bez zmian)
- `npm run lint` przechodzi
- `npx astro check` przechodzi

#### Manual Verification:

- Sprawdzenia mutacyjne (`npm run dev` dla szybkości, każda zmiana cofnięta `git checkout --` przed następną) wywracają właściwe przypadki: usunięcie `.strict()` z obiektu ciała w `src/pages/api/kit/index.ts` → nieznany klucz; usunięcie sprawdzenia rozmiaru opakowania → „rozmiar opakowania + 1”; przeniesienie sprawdzenia `locals.user` za walidację → przypadki anonimowe; zmiana `.max(MAX_QUANTITY)` na `.max(MAX_QUANTITY - 1)` → przypadek 201 na granicy 100000
- Przy wyłączonym lokalnym Supabase `test:api` kończy się czytelnym błędem połączenia, a nie zielonym przebiegiem

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się i zapytaj, czy użytkownik sam wykona sprawdzenia mutacyjne, czy oddaje je agentowi. Nie odhaczaj ich bez jego decyzji.

---

## Faza 3: CI i dokumentacja

### Overview

Podpięcie `test:api` do joba `smoke` i opisanie nowych zestawów oraz wzorców tam, gdzie czytają je przyszli agenci i autor.

### Changes Required:

#### 1. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Uruchamiać `test:api` w tym samym kroku co smoke, na tym samym podglądzie produkcyjnym (serwer startuje w tle w tym kroku), z `DATABASE_URL` z `supabase.env`. `test:db` uruchamia nowe przypadki bazy bez zmian w CI.

**Contract**: krok `Run smoke test against production preview` dostaje `source supabase.env` i `export DATABASE_URL="$DB_URL"`, a po `npm run smoke` uruchamia `BASE_URL=http://localhost:4321 npm run test:api`. Nazwa kroku mówi o obu zestawach.

#### 2. AGENTS.md i README

**File**: `AGENTS.md`, `README.md`

**Intent**: Nowa komenda i rozszerzony zakres `test:db` muszą być widoczne w „Command tripwires” i w tabeli skryptów oraz opisie CI.

**Contract**:

- AGENTS.md:
  - wpis `npm run test:api`: co sprawdza, `BASE_URL` + lokalny `DATABASE_URL`, wymaga zaimportowanego rejestru i wyłączonego potwierdzania e-maili, uruchamiany w CI po smoke, kiedy uruchomić (po zmianie tras `/api/kit*`, middleware, `kit-format`, migracji `kit_items`);
  - wpis `test:db` wspomina izolację apteczki i strażnika `security definer`;
  - linia „Automated tests:” wymienia `test:api`.
- README: wiersz w tabeli skryptów i zdanie w opisie joba `smoke`.

#### 3. Plan testów

**File**: `context/foundation/test-plan.md`

**Intent**: Uzupełnić książkę kucharską wzorcami z tej fazy i zapisać decyzje, żeby kolejne endpointy (S-05: edycja, usuwanie) dostały testy tym samym wzorcem.

**Contract**:

- **§3**: uwaga, że zestawy Fazy 3 działają w jobie `smoke` od tej fazy, a Faza 4 tylko je wymusza.
- **§6.2**: zamiast „TBD” wzorzec izolacji dwóch użytkowników: `actAs`/`actAsAnon`/`expectSqlError`, dwie postacie odrzucenia RLS, przypięta luka F2, strażnik `security definer` i reguła „nowa funkcja na danych użytkownika = invoker albo świadomy wyjątek”.
- **§6.4**: zamiast „TBD” wzorzec testu endpointu: czarna skrzynka HTTP, trzy asercje na przypadek nieprawidłowy (4xx, liczba wierszy, brak wnętrza), obie strony granicy, źródło granicy w komentarzu, dane graniczne z bazy, anonim przed walidacją. Plus przypomnienie dla S-05: dodać trasy edycji i usuwania do obu plików.
- **§6.6**: notatki Fazy 3 (dostarczone, wyniki sprawdzeń mutacyjnych, wnioski).
- **§7**: wykluczenie „test przez prawdziwe PostgREST” z uzasadnieniem.
- **§8**: data uzupełnienia książki kucharskiej.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- `npx prettier --check` na zmienionych plikach Markdown i YAML przechodzi
- Job `smoke` w CI na PR tej zmiany przechodzi, a w jego logu widać przebieg `test:api` i nowe przypadki `test:db`

#### Manual Verification:

- Autor czyta §6.2 i §6.4 i potwierdza, że według nich dopisałby test dla nowej trasy S-05 bez zaglądania do tego planu

---

## Testing Strategy

### Unit Tests:

- Brak nowych. Granice żyją w trasach i bazie, a ich dowodem jest integracja (test-plan §2, #6: najtańsza warstwa z prawdziwym sygnałem).

### Integration Tests:

- `tests/db/kit-access.test.ts`: izolacja per operacja, `anon`, `truncate`, ograniczenia kolumn, przypięta luka F2, strażnik `security definer`.
- `tests/api/kit-input.test.ts`: granice `POST /api/kit` i `GET /api/kit/check`, „nic nie zapisano”, „brak wnętrza w treści”, obie strony granic.
- `tests/api/kit-access.test.ts`: 401 przed walidacją, cudzy `userId`, właściciel z sesji, cudzy `?dodano`.

### Manual Testing Steps:

1. Sprawdzenia mutacyjne z Fazy 1 (SQL na lokalnej bazie, `db reset` po każdym).
2. Sprawdzenia mutacyjne z Fazy 2 (edycja tras na `npm run dev`, `git checkout --` po każdej).
3. Przegląd §6.2 i §6.4 przez autora.

## Performance Considerations

- `test:api` wydłuża job `smoke` o kilkadziesiąt żądań HTTP do lokalnego podglądu (rzędu kilkunastu sekund). `test:db` rośnie o kilkadziesiąt przypadków w jednej transakcji (pomijalne).

## References

- Research: `context/changes/testing-kit-access-and-input-boundaries/research.md`
- Plan testów: `context/foundation/test-plan.md` §2 (#4, #6), §3 (Faza 3), §5, §6.2, §6.4
- Wzorzec testu bazy: `tests/db/medicine-check.test.ts`, `tests/db/medicine-check-fixtures.ts:116-167`
- Wzorzec HTTP: `scripts/smoke.mjs:9-43`, `:181-257`
- Kontrakt `POST /api/kit`: `context/archive/2026-10-07-add-medicine-to-kit/plan.md:146`, `:47-48`; F1/F2/F7 w `context/archive/2026-10-07-add-medicine-to-kit/reviews/impl-review.md:27-54`, `:100-108`
- G21: `context/archive/2026-10-10-testing-check-verdict-correctness/plan.md:51`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Izolacja i ograniczenia w bazie

#### Automated

- [x] 1.1 `npx supabase db reset`, potem `npm run test:db` przechodzi: nowe przypadki i dotychczasowe 35 bez zmian — 67a6d3b
- [x] 1.2 `npm run lint` przechodzi — 67a6d3b
- [x] 1.3 `npx astro check` przechodzi — 67a6d3b

#### Manual

- [x] 1.4 Sprawdzenia mutacyjne na lokalnej bazie wywracają właściwe przypadki (select using true, grant anon, medicine_check security definer, update bez with check) — 67a6d3b
- [x] 1.5 Nazwy przypadków F2 czytane bez kodu jasno mówią, że to przyjęta luka

### Phase 2: Granice i dostęp przez API aplikacji

#### Automated

- [x] 2.1 Lokalnie z fixture'ami, `npm run preview` i `DATABASE_URL`: `npm run test:api` przechodzi
- [x] 2.2 `npm test` nie uruchamia plików z `tests/api/`
- [x] 2.3 `npm run lint` przechodzi
- [x] 2.4 `npx astro check` przechodzi

#### Manual

- [x] 2.5 Sprawdzenia mutacyjne tras wywracają właściwe przypadki (`.strict()`, rozmiar opakowania, kolejność 401, granica 100000)
- [x] 2.6 Przy wyłączonym lokalnym Supabase `test:api` kończy się czytelnym błędem

### Phase 3: CI i dokumentacja

#### Automated

- [ ] 3.1 `npm run lint` przechodzi
- [ ] 3.2 `npx prettier --check` na zmienionych plikach Markdown i YAML przechodzi
- [ ] 3.3 Job `smoke` w CI na PR przechodzi, z przebiegiem `test:api` i nowymi przypadkami `test:db` w logu

#### Manual

- [ ] 3.4 Autor potwierdza, że według §6.2 i §6.4 dopisałby test dla nowej trasy S-05
