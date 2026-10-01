# Kopia Rejestru Produktów Leczniczych w bazie — Implementation Plan

## Overview

Powtarzalny i atomowy import kopii RPL do Supabase (F-01, FR-001). Import wczytuje produkty ludzkie z substancjami czynnymi i opakowaniami. Uruchamia się go poleceniem `npm run registry:import` lokalnie albo ręcznie odpalanym workflow GitHub Actions na produkcji. Mini-zrzut w CI pilnuje parsera i powtarzalności. To fundament dla S-01 (wyszukiwanie) i S-07 (codzienne odświeżanie).

## Current State Analysis

- Repo nie ma migracji (`supabase/` zawiera tylko `config.toml` i `snippets/`), parsera XML ani klienta Postgresa w `package.json`. Skrypty to zależność-oszczędne `.mjs` w `scripts/` (`scripts/smoke.mjs`, `scripts/roadmap-sync.mjs`).
- CI (`.github/workflows/ci.yml`) ma job `smoke`, który uruchamia lokalny Supabase (`supabase start` stosuje migracje z `supabase/migrations/`). Job `deploy` zależy od `ci` i `smoke`. Migracji na produkcyjną bazę nikt dziś nie stosuje automatycznie.
- Produkcyjny Supabase: projekt w Frankfurcie (`context/deployment/deploy-plan.md`).
- Dane: zrzut XML w wersji 6.0.0 pod stałym adresem, z namespace `http://rejestry.ezdrowie.gov.pl/rpl/eksport-danych-v6.0.0`. Struktura, liczności i pułapki są opisane w `context/changes/registry-copy-load/research.md`.

## Desired End State

- Migracja tworzy `registry_products`, `registry_product_substances`, `registry_packages` i `registry_imports`, z RLS: odczyt tylko dla roli `authenticated`, bez zapisu przez API.
- `npm run registry:import -- --file <ścieżka>` albo bez `--file` (pobiera z URL RPL) wczytuje zrzut do bazy wskazanej przez `DATABASE_URL` w jednej transakcji. Ponowne uruchomienie daje ten sam stan bez ręcznego sprzątania.
- Na zrzucie 2026-09-23 import kończy się stanem: 20 258 aktywnych produktów, 0 weterynaryjnych, 25 515 substancji, 71 432 aktywne opakowania.
- CI importuje mini-zrzuty i sprawdza wynik. Produkcja ma dane wczytane workflowem `registry-import.yml`.

### Key Discoveries:

- `id` produktu jest unikalny w zrzucie, 22 909 rekordów (research.md, „Liczności”).
- Substancje są osobnymi elementami w XML, a w CSV tekstem, stąd wybór XML (research.md, „XML kontra CSV”).
- Zrzut całościowy nie ma atrybutu `status`, a wycofanie da się poznać najwyżej po `waznoscPozwolenia` (research.md, „Status i wycofanie”).
- `moc` ma do 1 831 znaków, więc kolumny tekstowe nie mogą mieć limitów. 940 produktów ma encje XML, więc trzeba użyć prawdziwego parsera.
- Import ma działać w GitHub Actions i wgrywać dane w jednej transakcji (`context/foundation/tech-stack.md:24`).

## What We're NOT Doing

- Harmonogram (`schedule`), powiadomienie o nieudanym imporcie i data aktualizacji w UI: to S-07.
- Indeksy wyszukiwania, ranking i wybór pól do podpowiedzi: to S-01.
- Normalizacja pisowni substancji („Diosmectitum”/„Diosmectiteum”) i fallback na nazwę powszechnie stosowaną przy porównaniu: to S-03/S-06.
- Leki weterynaryjne: import je pomija (decyzja planu).
- Filtrowanie produktów z wygasłym albo zawieszonym pozwoleniem: import bierze wszystkie i zapisuje surową wartość `waznoscPozwolenia`. Decyzja o pokazywaniu należy do S-01.
- Opakowania z `skasowane="TAK"`: nie są wstawiane jako aktywne.
- Producenci, drogi podania z gatunkami i okresami karencji, materiały edukacyjne, zgody prezesa: nie są potrzebne w MVP.
- Automatyczne stosowanie migracji na produkcji w CI.
- Typy w `src/types.ts` i jakikolwiek kod aplikacji: pierwszy konsument to S-01.

## Implementation Approach

Skrypt Node łączy się bezpośrednio z Postgresem (`pg`, `DATABASE_URL`), bo atomowość wymaga transakcji, a supabase-js jej nie daje. XML jest parsowany strumieniowo (`saxes`) z pliku albo z odpowiedzi `fetch`. Całość dzieje się w jednej transakcji:

1. Wczytanie do tabel tymczasowych (`ON COMMIT DROP`).
2. Bezpieczniki.
3. Upsert produktów i opakowań po `id`. Rekordy, których zabrakło w zrzucie, dostają `removed_at` zamiast `DELETE`, bo od S-02 apteczka wskazuje produkty rejestru.
4. Podmiana substancji per produkt.
5. Wpis do `registry_imports`.

Postgres (MVCC) nie blokuje odczytów w trakcie importu. Błąd w dowolnym miejscu powoduje rollback, więc stan bazy się nie zmienia.

## Critical Implementation Details

- **Bezpieczniki przed zmianami:**
  - import przerywa się, gdy namespace korzenia nie jest `…/eksport-danych-v6.0.0`;
  - import przerywa się, gdy `stanNaDzien` jest starszy niż najnowszy `snapshot_date` w `registry_imports` (równy jest dozwolony, żeby ponowny import działał);
  - import przerywa się, gdy liczba produktów ludzkich w zrzucie jest mniejsza niż 90% obecnie aktywnych (`removed_at IS NULL`). Bez tego obcięty albo pusty zrzut oznaczyłby cały rejestr jako usunięty.

  Przy pierwszym imporcie (pusta tabela) ostatni bezpiecznik nie działa.

- **Połączenie z produkcji:** runnery GitHub Actions nie mają IPv6, a bezpośredni host bazy Supabase jest IPv6-only. Sekret musi zawierać connection string poolera Supavisor w trybie session (port 5432), nie bezpośredni host i nie tryb transaction.

## Phase 1: Schemat bazy

### Overview

Tabele kopii rejestru z RLS, gotowe do zapisu przez skrypt i odczytu przez zalogowanych użytkowników.

### Changes Required:

#### 1. Migracja tabel rejestru

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_registry_tables.sql`

**Intent**: Utworzyć cztery tabele kopii RPL z RLS według konwencji z `AGENTS.md` (włączony RLS, polityki osobno per operacja i rola). Kolumny to angielskie snake_case, a każda tabela i kolumna z mapowaniem na pole XML ma komentarz `COMMENT ON`.

**Contract**:

- `registry_products`:
  - `id bigint PK` (XML `id`), `name text not null` (`nazwaProduktu`), `common_name` (`nazwaPowszechnieStosowana`), `previous_name` (`nazwaPoprzedniaProduktu`, `"brak"` → null);
  - `strength` (`moc`), `pharmaceutical_form` (`nazwaPostaciFarmaceutycznej`), `marketing_authorization_holder`, `procedure_type`, `authorization_number`;
  - `authorization_validity` (surowe `waznoscPozwolenia`), `atc_codes text[]`, `routes text[]` (`drogaPodaniaNazwa`), `leaflet_url`, `characteristic_url`;
  - `created_at`, `updated_at`, `removed_at timestamptz null`.
- `registry_product_substances`: `product_id bigint FK → registry_products ON DELETE CASCADE`, `position smallint`, `name text not null`, `amount`, `unit`, `preparation_amount`, `preparation_unit`, `other_description`; PK `(product_id, position)`.
- `registry_packages`: `id bigint PK` (XML `opakowanie@id`), `product_id bigint FK` z indeksem, `gtin`, `availability_category`, `units jsonb` (tablica `{count, kind, capacity, capacity_unit, info}` z `jednostkaOpakowania`), `created_at`, `updated_at`, `removed_at`.
- `registry_imports`: `id bigint identity PK`, `snapshot_date date not null` (`stanNaDzien`), `source text` (URL albo nazwa pliku), `started_at`, `finished_at`, `products_active`, `products_removed`, `substances`, `packages_active` (wszystkie liczniki `int not null`). `products_active`, `substances` i `packages_active` to stan w bazie po imporcie; `products_removed` to liczba produktów oznaczonych jako usunięte w tym imporcie.
- `created_at` i `updated_at` w `registry_products` i `registry_packages` to `timestamptz not null default now()`. `updated_at` oznacza ostatnią rzeczywistą zmianę danych wiersza (albo jego `removed_at`), a nie datę ostatniego importu; tę daje `registry_imports`.
- Puste stringi z XML są zapisywane jako `null`. Kolumny tekstowe nie mają limitu długości.
- RLS włączony na wszystkich czterech tabelach. Każda dostaje politykę `SELECT TO authenticated USING (true)` i żadnych polityk INSERT/UPDATE/DELETE. Migracja nadaje jawnie `grant select on <4 tabele> to authenticated`, żeby nie polegać na domyślnych grantach Supabase. Import działa jako właściciel tabel przez bezpośrednie połączenie, więc RLS go nie dotyczy.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` stosuje migrację bez błędów na lokalnym Supabase
- `npx supabase db lint --fail-on error` nie zgłasza błędów dla nowych tabel
- `npm run lint` przechodzi
- `npx astro check` przechodzi

#### Manual Verification:

- W lokalnym Studio cztery tabele mają włączony RLS i po jednej polityce SELECT dla `authenticated`
- Zapytanie SQL do `pg_class.relrowsecurity` i `pg_policies` potwierdza RLS na czterech tabelach i dokładnie jedną politykę SELECT dla `authenticated` na tabelę (test ról na danych jest w skrypcie sprawdzającym, faza 3)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Parser i skrypt importu

### Overview

Skrypt, który strumieniowo czyta zrzut RPL i atomowo wgrywa go do bazy, oraz mini-zrzuty z przypadkami brzegowymi.

### Changes Required:

#### 1. Zależności

**File**: `package.json`

**Intent**: Dodać `pg` i `saxes` jako `devDependencies` (import działa poza Workerem, więc nie trafia do bundla) oraz skrypt `registry:import`.

**Contract**: `"registry:import": "node scripts/registry-import.mjs"`. Argumenty: `--file <ścieżka>` (bez niego skrypt pobiera z `https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/public-pl-report/6.0.0/overall.xml`). Zmienna `DATABASE_URL` jest wymagana, a jej brak kończy skrypt błędem przed parsowaniem.

#### 2. Parser zrzutu

**File**: `scripts/lib/rpl-parser.mjs`

**Intent**: Zamienić strumień tekstu XML na sekwencję rekordów produktów, przekazywanych dalej po kolei, bez budowania całego drzewa w pamięci.

**Contract**:

- Funkcja przyjmuje async-iterowalny strumień tekstu i zwraca `{ snapshotDate, products }`, gdzie `products` to async iterator rekordów `{ id, name, …, substances[], packages[] }` w kształcie kolumn z fazy 1.
- Rzuca błąd, gdy namespace korzenia się nie zgadza albo brakuje `stanNaDzien`.
- Produkty z `rodzajPreparatu` innym niż `ludzki` są pomijane.
- Opakowania z `skasowane="TAK"` są pomijane. Brak atrybutu albo wartość `NIE` oznacza aktywne opakowanie.
- Encje XML dekoduje `saxes`.
- Kolejność substancji z XML wyznacza `position`.

#### 3. Skrypt importu

**File**: `scripts/registry-import.mjs`

**Intent**: Połączyć źródło (plik albo `fetch`), parser i transakcję zapisu. Wypisać zwięzłe podsumowanie i zakończyć się kodem ≠ 0 przy każdym błędzie.

**Contract**:

- Kolejność w transakcji:
  1. tabele tymczasowe;
  2. wsadowe inserty (np. po 1 000 wierszy);
  3. bezpieczniki z „Critical Implementation Details”;
  4. upsert `registry_products` po `id` z `removed_at = null` (produkt, który wrócił, znowu jest aktywny); `ON CONFLICT … DO UPDATE SET …, updated_at = now() WHERE (kolumny danych, removed_at) IS DISTINCT FROM (excluded…)`, więc wiersz bez zmian nie jest przepisywany;
  5. `removed_at = now()`, `updated_at = now()` dla aktywnych produktów spoza zrzutu;
  6. usunięcie i ponowne wstawienie substancji produktów ze zrzutu;
  7. upsert `registry_packages` po `id` z tym samym warunkiem `IS DISTINCT FROM` oraz `removed_at`/`updated_at = now()` dla aktywnych opakowań spoza zrzutu (także tych, które stały się skasowane);
  8. wiersz w `registry_imports` z licznikami.
- Wynik na stdout: data stanu, liczba aktywnych i oznaczonych jako usunięte produktów, substancji, opakowań i czas trwania.
- `--dry-run` parsuje i wypisuje liczniki bez łączenia z bazą (do szybkiej weryfikacji parsera).

#### 4. Mini-zrzuty

**File**: `scripts/fixtures/rpl-sample-v1.xml`, `scripts/fixtures/rpl-sample-v2.xml`

**Intent**: Małe, prawdziwe wycinki zrzutu 2026-09-23 (dane publiczne) z przypadkami brzegowymi do testu w CI.

**Contract**:

- v1 (`stanNaDzien="2026-09-23"`, około 12 produktów) zawiera: produkt z jedną substancją, produkt z 3+ substancjami, produkt bez substancji (Smecta IR, `id 100016564`), produkt weterynaryjny, produkt z encją XML w atrybucie, produkt z `moc` dłuższą niż 255 znaków, produkt z opakowaniem `skasowane="TAK"` oraz produkt z wygasłym `waznoscPozwolenia`.
- v2 (`stanNaDzien="2026-09-24"`) to v1 bez jednego produktu ludzkiego, z jednym nowym produktem, ze zmienioną nazwą jednego produktu i z jednym opakowaniem przestawionym na `skasowane="TAK"`.
- Oczekiwane liczności obu wersji są zapisane w skrypcie sprawdzającym (faza 3).

### Success Criteria:

#### Automated Verification:

- `npm run registry:import -- --file scripts/fixtures/rpl-sample-v1.xml --dry-run` wypisuje liczności zgodne z zawartością fixture'u, a produkt weterynaryjny jest pominięty
- Pełny zrzut lokalnie (`--file "…/Rejestr_Produktow_Leczniczych_calosciowy_stan_na_dzien_20260923_6.0.0.xml"`) do lokalnego Supabase kończy się stanem: 20 258 aktywnych produktów, 25 515 substancji, 71 432 aktywne opakowania
- Drugie uruchomienie na tym samym pliku kończy się tymi samymi licznościami i 0 produktów oznaczonych jako usunięte
- Import pliku z obciętym końcem kończy się kodem ≠ 0, a liczności w bazie się nie zmieniają
- `npm run lint` przechodzi

#### Manual Verification:

- W Studio rekord Smecty (`id 100016564`) ma `common_name = 'Diosmectitum'` i 0 substancji, a produkt z encją ma zdekodowany tekst (np. `&` zamiast `&amp;`)
- Import bez `--file` pobiera bieżący zrzut z RPL i kończy się sukcesem (`snapshot_date` = data dzisiejsza)
- Czas pełnego importu lokalnie jest akceptowalny (rząd minut, nie godzin)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: CI, workflow produkcyjny i dokumentacja

### Overview

Automatyczna kontrola importu w CI, ręczne uruchamianie importu na produkcji i opis nowych poleceń.

### Changes Required:

#### 1. Skrypt sprawdzający

**File**: `scripts/registry-import-check.mjs`

**Intent**: Sprawdzić stan bazy po sekwencji importów fixture'ów, bez dodatkowych zależności poza `pg`.

**Contract**: Po sekwencji v1, v1, v2 sprawdza:

- liczność aktywnych i oznaczonych jako usunięte produktów;
- brak produktów weterynaryjnych;
- zmienioną nazwę;
- `removed_at` ustawione dla produktu i opakowania usuniętych w v2;
- 3 wiersze w `registry_imports` z datami 2026-09-23, 2026-09-23 i 2026-09-24;
- RLS na danych: w transakcji `set local role anon` → `count(*) = 0` z `registry_products`, a `set local role authenticated` → `count(*) > 0`.

Każda niezgodność kończy skrypt kodem ≠ 0 z czytelnym komunikatem.

#### 2. Krok w CI

**File**: `.github/workflows/ci.yml`

**Intent**: W jobie `smoke`, po `supabase start` (który stosuje migracje), uruchomić import v1 dwa razy, potem v2, potem skrypt sprawdzający. Dzięki temu migracja, parser i powtarzalność są pilnowane przy każdym PR.

**Contract**: `DATABASE_URL` wskazuje lokalną bazę (`DB_URL` z `supabase status -o env`, czyli port 54322). Kroki są przed buildem i testem smoke, żeby błąd importu był widoczny osobno.

#### 3. Workflow importu produkcyjnego

**File**: `.github/workflows/registry-import.yml`

**Intent**: Ręczne (`workflow_dispatch`) uruchomienie importu z URL RPL do produkcyjnej bazy. S-07 dopisze tu `schedule` i powiadomienie.

**Contract**: Trigger tylko `workflow_dispatch`. Node 22, `npm ci`, `npm run registry:import`. Sekret repo `REGISTRY_DATABASE_URL` (pooler Supavisor, tryb session) jest przekazywany jako `DATABASE_URL`. Brak sekretu kończy job błędem.

#### 4. Dokumentacja

**File**: `README.md`, `AGENTS.md`, `.claude/skills/ci-check/SKILL.md`

**Intent**:

- README: polecenie `registry:import` w tabeli „Scripts”, opis workflow i sekretu oraz instrukcja `npx supabase db push` dla migracji produkcyjnych.
- AGENTS.md: wpis w „Command tripwires”.
- ci-check: krok importu fixture'ów w części lustrzanej do joba `smoke`.

**Contract**: Sekcje „Scripts” i „CI” w README, „Command tripwires” w AGENTS.md oraz lista kroków smoke w ci-check.

### Success Criteria:

#### Automated Verification:

- Lokalnie: sekwencja v1, v1, v2 i `node scripts/registry-import-check.mjs` kończy się kodem 0 na świeżym `npx supabase db reset`
- `npm run lint` przechodzi
- `npx astro check` przechodzi
- `npm run build` przechodzi
- Job `smoke` w CI na PR przechodzi razem z nowymi krokami importu

#### Manual Verification:

- Migracja zastosowana na produkcyjny Supabase (`npx supabase link` + `npx supabase db push`)
- Sekret `REGISTRY_DATABASE_URL` ustawiony w repo (connection string poolera w trybie session)
- Ręczne uruchomienie `registry-import.yml` kończy się sukcesem, a produkcyjna tabela `registry_products` ma około 20 tys. aktywnych produktów
- Drugie ręczne uruchomienie tego samego dnia kończy się sukcesem bez oznaczania produktów jako usunięte
- README i AGENTS.md czytają się poprawnie

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Brak test runnera w repo (moduł 3). Rolę testów parsera pełni `--dry-run` na fixture'ach i skrypt sprawdzający.

### Integration Tests:

- CI: v1, v1, v2 i check na lokalnym Supabase. Pokrywa migrację, RLS na danych (anon/authenticated), filtr weterynaryjny, encje, długą `moc`, brak substancji, powtarzalność, `removed_at` produktów i opakowań oraz zmianę danych.

### Manual Testing Steps:

1. Pełny zrzut 2026-09-23 lokalnie, dwukrotnie, z porównaniem liczności z planem.
2. Plik obcięty w połowie: import kończy się błędem, a dane się nie zmieniają.
3. Import z URL RPL lokalnie, potem workflow na produkcji.

## Performance Considerations

- 74 MB XML jest czytany strumieniowo. Wsadowe inserty do tabel tymczasowych ograniczają liczbę zapytań do kilkuset.
- Transakcja trzyma blokady wierszy tylko w tabelach rejestru. Odczyty (S-01) nie są blokowane.

## Migration Notes

- Nowa migracja nie zmienia istniejących tabel. Produkcyjna baza wymaga ręcznego `supabase db push`, bo CI nie stosuje migracji na produkcji.

## References

- Research: `context/changes/registry-copy-load/research.md`
- Roadmap: `context/foundation/roadmap.md:79-92` (F-01), `:219` (pytanie 5)
- Stack: `context/foundation/tech-stack.md:24`
- CI: `.github/workflows/ci.yml` (job `smoke`)
- Wzorzec skryptu: `scripts/smoke.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schemat bazy

#### Automated

- [ ] 1.1 `npx supabase db reset` stosuje migrację bez błędów na lokalnym Supabase
- [ ] 1.2 `npx supabase db lint --fail-on error` nie zgłasza błędów dla nowych tabel
- [ ] 1.3 `npm run lint` przechodzi
- [ ] 1.4 `npx astro check` przechodzi

#### Manual

- [ ] 1.5 W lokalnym Studio cztery tabele mają włączony RLS i po jednej polityce SELECT dla `authenticated`
- [ ] 1.6 Zapytanie SQL do `pg_class.relrowsecurity` i `pg_policies` potwierdza RLS na czterech tabelach i jedną politykę SELECT dla `authenticated` na tabelę

### Phase 2: Parser i skrypt importu

#### Automated

- [ ] 2.1 `npm run registry:import -- --file scripts/fixtures/rpl-sample-v1.xml --dry-run` wypisuje liczności zgodne z zawartością fixture'u, a produkt weterynaryjny jest pominięty
- [ ] 2.2 Pełny zrzut lokalnie do lokalnego Supabase kończy się stanem: 20 258 aktywnych produktów, 25 515 substancji, 71 432 aktywne opakowania
- [ ] 2.3 Drugie uruchomienie na tym samym pliku kończy się tymi samymi licznościami i 0 produktów oznaczonych jako usunięte
- [ ] 2.4 Import pliku z obciętym końcem kończy się kodem ≠ 0, a liczności w bazie się nie zmieniają
- [ ] 2.5 `npm run lint` przechodzi

#### Manual

- [ ] 2.6 W Studio rekord Smecty (`id 100016564`) ma `common_name = 'Diosmectitum'` i 0 substancji, a produkt z encją ma zdekodowany tekst
- [ ] 2.7 Import bez `--file` pobiera bieżący zrzut z RPL i kończy się sukcesem
- [ ] 2.8 Czas pełnego importu lokalnie jest akceptowalny

### Phase 3: CI, workflow produkcyjny i dokumentacja

#### Automated

- [ ] 3.1 Lokalnie: sekwencja v1, v1, v2 i `node scripts/registry-import-check.mjs` kończy się kodem 0 na świeżym `npx supabase db reset`
- [ ] 3.2 `npm run lint` przechodzi
- [ ] 3.3 `npx astro check` przechodzi
- [ ] 3.4 `npm run build` przechodzi
- [ ] 3.5 Job `smoke` w CI na PR przechodzi razem z nowymi krokami importu

#### Manual

- [ ] 3.6 Migracja zastosowana na produkcyjny Supabase (`npx supabase link` + `npx supabase db push`)
- [ ] 3.7 Sekret `REGISTRY_DATABASE_URL` ustawiony w repo
- [ ] 3.8 Ręczne uruchomienie `registry-import.yml` kończy się sukcesem, a produkcyjna tabela `registry_products` ma około 20 tys. aktywnych produktów
- [ ] 3.9 Drugie ręczne uruchomienie tego samego dnia kończy się sukcesem bez oznaczania produktów jako usunięte
- [ ] 3.10 README i AGENTS.md czytają się poprawnie
