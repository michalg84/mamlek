# Variant key btrim Implementation Plan

## Overview

Klucz wariantu leku (`lower(nazwa) | lower(moc) | lower(postać)`) zaczyna obcinać spacje na początku i końcu każdej części (`btrim`) wszędzie, gdzie się go porównuje: w regule sprawdzenia, w liście podpowiedzi, w opakowaniach wariantu, w kluczu po stronie klienta i w kontroli CI importu. Dzięki temu pięć par produktów z rejestru, które różnią się tylko spacją na końcu mocy, staje się jednym wariantem, a sprawdzenie odpowiada „Masz ten lek”. Wycinek S-14 z roadmapy; decyzja autora z pytania 7 (tylko `btrim`, podwójne i nierozdzielające spacje bez zmian).

## Current State Analysis

Klucz wariantu bez `btrim` porównuje się dziś w pięciu miejscach (roadmapa wymienia cztery, z numerami linii sprzed S-13):

- `medicine_check` — `supabase/migrations/20261010120000_medicine_check.sql:165-167` (definicja nadal aktualna; S-13 jej nie ruszał).
- `registry_refresh_search_list` — aktualna definicja w `supabase/migrations/20261116120000_withdrawn_medicine_in_kit.sql:71` (`partition by lower(p.name), lower(coalesce(p.strength, '')), …`).
- `registry_variant_packages` — aktualna definicja w tej samej migracji, `:174-176`.
- `variantKey` / `kitItemVariantKey` — `src/lib/kit-import.ts:140-157`; import CSV porównuje nimi warianty pozycji apteczki z wariantami listy („masz już”) i wiersze pliku między sobą.
- Kontrola CI `scripts/registry-import-check.mjs:179` — liczy unikalne klucze wariantu (bez `btrim`) i wymaga, żeby równały się `variant_count` listy; po zmianie listy bez tej poprawki job `smoke` padnie, gdy dane zawierają spację na końcu.

Pomiar 2026-11-17 na lokalnej bazie z pełnym rejestrem (20 351 produktów, wszystkie aktywne):

- Spacje na początku/końcu występują tylko w mocy: 23 wartości; nazwa i postać — 0.
- Po `btrim` łączy się 5 par kluczy (44 produkty): Citrafleet `(0,01 g + 3,50 g + 10,97 g)/saszetkę` (7), Cyclo 3 Fort `150 mg + 150 mg + 100 mg` (10), Dermovate `0,5 mg/ml` (4), Hepa-Merz 3000 `3 g/5 g` (6), Tardyferon `80 mg fe2+` (17). Liczba wariantów listy: 16 278 → 16 273.
- Szósta para z pomiaru 2026-10-08 (Citrafleet `…/sasz.`) różni się podwójną spacją w środku i zgodnie z decyzją autora zostaje dwoma wariantami.
- **Dzisiejszy skutek (rozstrzyga niewiadomą S-14):** różny dla par. Dermovate, Hepa-Merz 3000 i Tardyferon dostają dziś „ta sama substancja” (zgodny zbiór nazw powszechnych), a Citrafleet i Cyclo 3 Fort — „Nie masz” (żaden zbiór nie pasuje). Po zmianie wszystkie pięć: „Masz ten lek”.

## Desired End State

- Sprawdzenie leku zwraca dopasowanie `variant` dla pozycji apteczki, której produkt różni się od szukanego tylko spacjami na początku/końcu nazwy, mocy lub postaci.
- Lista podpowiedzi ma jeden wariant na taki klucz; `registry_variant_packages` zwraca opakowania obu zapisów.
- Import CSV traktuje oba zapisy jako jeden wariant („masz już”, duplikaty w pliku).
- `scripts/registry-import-check.mjs` liczy klucze tak samo jak lista.
- Weryfikacja: nowy test `test:db` „spacja na końcu to ten sam lek” i testy jednostkowe `variantKey` przechodzą z czerwonego na zielony; na lokalnej bazie z pełnym rejestrem lista ma 16 273 warianty.

### Key Discoveries:

- `medicine_check` odwołuje się do `kit_items`, więc nie może trafić do `REGISTRY_MIGRATIONS` (scratchowa baza `tests/db/registry-import.test.ts` nie ma tej tabeli, a ciało funkcji SQL jest sprawdzane przy tworzeniu). Lista i opakowania dotykają tylko tabel rejestru — stąd dwie migracje (`tests/db/registry-import-fixtures.ts:19-24`, strażnik `tests/db/registry-import.test.ts:347-353`).
- `registry_variant_packages` ma dziś ten sam typ zwracany co po S-13, więc wystarczy `create or replace` (zostają uprawnienia); tak samo `registry_refresh_search_list` i `medicine_check`.
- Testy `test:db` działają w jednej transakcji z wycofaniem, jako `authenticated` przez `actAs` (`tests/db/medicine-check-fixtures.ts:156-186`); nie zależą od zaimportowanego rejestru, więc test listy sam wstawia wiersz `registry_imports` (bez niego `registry_refresh_search_list` nic nie robi, `20261116120000_withdrawn_medicine_in_kit.sql:51-54`).
- `kitItemVariantKey` skraca moc dłuższą niż 80 znaków tak jak lista (`src/lib/kit-import.ts:148-157`); obcinanie spacji musi zajść przed skróceniem, żeby oba zapisy dały ten sam klucz.
- Brak indeksów na wyrażeniach `lower(...)` (`create index` tylko w `kit_items.sql:28` i `registry_tables.sql:103`), więc `btrim` nie psuje żadnego planu zapytania.

## What We're NOT Doing

- Nie zwijamy podwójnych spacji w środku ani spacji nierozdzielających (decyzja autora 2026-10-13; szósta para Citrafleet zostaje osobno).
- Nie zmieniamy danych w bazie ani parsera importu (`scripts/lib/rpl-parser.mjs`) — wartości zostają jak w XML rejestru (decyzja z planowania).
- Nie zmieniamy wyświetlanej mocy w liście podpowiedzi — przedstawiciel wariantu pokazuje moc jak w rejestrze; spacja na końcu jest niewidoczna.
- Nie ruszamy normalizacji zbiorów substancji (`medicine_check_normalize` już ma `btrim`) ani logiki dopasowania substancji — to S-06.
- Nie zmieniamy fikstur XML (`scripts/fixtures/*.xml`) ani testu importera na scratchowej bazie.

## Implementation Approach

Jedna reguła w pięciu miejscach, zmieniona razem w jednej fazie, test najpierw: czerwone testy (`test:db` i jednostkowe) → migracje i poprawka klienta → zielone. Druga faza: dokumentacja, nowy golden `search:check` i ręczne sprawdzenie w aplikacji.

Wdrożenie jak w S-13: najpierw merge (Cloudflare wdraża kod, który działa też na starej bazie — klucz z `trim` po stronie klienta jest tylko luźniejszy), potem ręczny `npx supabase db push`. Odwrotnie stary klient porównywałby moc ze spacją z przedstawicielem bez spacji i gubił „masz już” w imporcie.

## Critical Implementation Details

**Wspólna lokalna baza.** Trzy inne sesje (worktree S-06, S-11, S-12) używają tej samej lokalnej bazy Supabase z pełnym rejestrem. Nowe migracje zastosuj przez `npx supabase migration up`, nie `npx supabase db reset` — reset skasowałby pełny rejestr (potrzebny do `search:check` i testu ręcznego) i dane tamtych sesji. Nie uruchamiaj `test:api` ani `smoke` równolegle z tamtymi sesjami.

## Phase 1: Klucz wariantu z btrim (baza i klient)

### Overview

Najpierw testy, które padają na obecnej regule, potem dwie migracje, poprawka `variantKey` i kontroli CI.

### Changes Required:

#### 1. Test „spacja na końcu to ten sam lek” (czerwony)

**File**: `tests/db/variant-key.test.ts` (nowy)

**Intent**: Jeden syntetyczny lek w dwóch zapisach mocy (`"0,5 mg/ml"` i `"0,5 mg/ml "`, ten sam name i form, różne zbiory substancji albo ogólnik, żeby dopasowanie nie przeszło przez substancję) i pozycja apteczki z zapisu ze spacją. Test przypina trzy miejsca SQL: `medicine_check` dla produktu bez spacji zwraca tę pozycję z `match: 'variant'` (i `checkVerdict` daje werdykt „masz ten lek”); `registry_variant_packages` dla każdego z dwóch produktów zwraca opakowania obu; po `registry_refresh_search_list()` (z własnym wierszem `registry_imports`, w transakcji) payload ma dokładnie jeden wariant o tej nazwie i mocy. Do tego przypadek graniczny: podwójna spacja w środku nadal daje dwa warianty (decyzja autora).

**Contract**: Wzorzec i helpery z `tests/db/medicine-check-fixtures.ts` (transakcja z wycofaniem, savepoint na test, `actAs` / `actAsOwner`, `checkAs`); werdykt przez `parseMedicineCheck` i `checkVerdict` z `src/lib/medicine-check-verdict.ts`, jak w `medicine-check.test.ts`. Lista budowana jako właściciel (`actAsOwner`), bo `registry_refresh_search_list` nie jest dostępna dla ról API.

#### 2. Testy jednostkowe klucza klienta (czerwone)

**File**: `src/lib/kit-import.test.ts`

**Intent**: `variantKey` daje ten sam klucz dla części różniących się tylko spacjami na początku/końcu (nazwa, moc, postać), ale różny dla podwójnej spacji w środku; `kitItemVariantKey` obcina spacje przed skróceniem do 80 znaków (moc 80 znaków + spacja daje ten sam klucz co moc 80 znaków). Opis klucza w komentarzu nagłówka testu (`kit-import.test.ts:34`) uzupełniony o `btrim`.

**Contract**: istniejący blok `describe("variantKey", …)` (`kit-import.test.ts:327`).

#### 3. Migracja rejestru: lista i opakowania wariantu

**File**: `supabase/migrations/20261117120000_variant_key_btrim.sql` (nowy)

**Intent**: `create or replace` funkcji `registry_refresh_search_list` i `registry_variant_packages` z ciałami z `20261116120000_withdrawn_medicine_in_kit.sql`, zmienionymi tylko w kluczu: każda część `lower(btrim(...))` (w `partition by` listy i w złączeniu `base`–`p` opakowań). Komentarze funkcji (`comment on function`) opisują klucz z `btrim`. Na końcu `select public.registry_refresh_search_list();`, żeby produkcja dostała scaloną listę bez nowego importu. Nagłówek migracji: kolejność wdrożenia (merge, potem `db push`) i rollback.

**Contract**: sygnatury i typy zwracane bez zmian (uprawnienia zostają); klucz `lower(btrim(p.name)), lower(btrim(coalesce(p.strength, ''))), lower(btrim(coalesce(p.pharmaceutical_form, '')))`. Migracja nie odwołuje się do `kit_items` ani `auth.` w kodzie.

#### 4. Migracja reguły sprawdzenia

**File**: `supabase/migrations/20261117120100_variant_key_btrim_medicine_check.sql` (nowy)

**Intent**: `create or replace function public.medicine_check` z ciałem z `20261010120000_medicine_check.sql`, zmienionym tylko w porównaniu `variant` (linie 165-167) na `lower(btrim(...))` po obu stronach. Komentarz nad funkcją: klucz zgodny z listą i `registry_variant_packages` z poprzedniej migracji.

**Contract**: sygnatura `medicine_check(bigint) returns jsonb`, kształt odpowiedzi bez zmian. Migracja odwołuje się do `kit_items` (zostaje poza `REGISTRY_MIGRATIONS`, strażnik to akceptuje).

#### 5. Lista migracji rejestru

**File**: `tests/db/registry-import-fixtures.ts`

**Intent**: Dopisać `20261117120000_variant_key_btrim.sql` do `REGISTRY_MIGRATIONS` — redefiniuje funkcję, którą woła importer, i nie dotyka `kit_items`.

**Contract**: `REGISTRY_MIGRATIONS` (pięć plików).

#### 6. Klucz po stronie klienta

**File**: `src/lib/kit-import.ts`

**Intent**: `variantKey` obcina spacje na początku i końcu każdej części przed `toLowerCase`; `kitItemVariantKey` obcina moc przed skróceniem do `LIST_STRENGTH_MAX`. JSDoc obu funkcji opisuje klucz jak baza: `lower(btrim(...))`.

**Contract**: `variantKey(name, strength, form): string`, `kitItemVariantKey(item): string` — sygnatury bez zmian. `String.prototype.trim` obcina też inne białe znaki niż spacja (np. nierozdzielającą), a `btrim` w Postgres tylko spację; w danych są wyłącznie zwykłe spacje (pomiar: 0 innych białych znaków na końcach), więc użyj `trim()` dla prostoty i zanotuj tę różnicę w JSDoc.

#### 7. Kontrola CI importu

**File**: `scripts/registry-import-check.mjs`

**Intent**: Zapytanie „search list variant count” (`:179`) liczy unikalne klucze z `btrim`, tak jak lista; opis kontroli bez zmian merytorycznych.

**Contract**: `select distinct lower(btrim(name)), lower(btrim(coalesce(strength, ''))), lower(btrim(coalesce(pharmaceutical_form, '')))`.

### Success Criteria:

#### Automated Verification:

- Nowy `tests/db/variant-key.test.ts` i nowe przypadki w `src/lib/kit-import.test.ts` padają przed zmianą reguły (zapisane wyjście czerwonego przebiegu)
- Migracje stosują się na lokalnej bazie bez resetu: `npx supabase migration up`
- `npm run test:db` przechodzi (w tym `registry-import.test.ts` ze strażnikiem `REGISTRY_MIGRATIONS` i nowy test wariantu)
- `npx vitest run --project unit --project component --project registry` przechodzi
- `node scripts/registry-import-check.mjs` przechodzi na lokalnej bazie
- `npm run lint` i `npx astro check` bez błędów

#### Manual Verification:

- Na lokalnej bazie lista ma 16 273 warianty (było 16 278), a Dermovate `0,5 mg/ml` roztwór na skórę jest w podpowiedziach raz

**Implementation Note**: Po automatycznych kontrolach zatrzymaj się na potwierdzenie testu ręcznego przez użytkownika przed fazą 2.

---

## Phase 2: Dokumentacja i weryfikacja

### Overview

Zapis decyzji, kolejności wdrożenia i rollbacku, nowy golden wyszukiwania i ręczne sprawdzenie werdyktów w aplikacji.

### Changes Required:

#### 1. AGENTS.md

**File**: `AGENTS.md`

**Intent**: W „Supabase migrations” dopisać kolejność wdrożenia dla dwóch nowych migracji (merge, potem `db push`) i rollback (przywrócić `registry_refresh_search_list` i `registry_variant_packages` z `20261116120000_withdrawn_medicine_in_kit.sql`, `medicine_check` z `20261010120000_medicine_check.sql`, potem `select public.registry_refresh_search_list()`). W opisie `test:db`: „(four today)” → „(five today)”, wzmianka o `tests/db/variant-key.test.ts`.

**Contract**: sekcje „Key conventions → Supabase migrations” i „Command tripwires → npm run test:db”.

#### 2. Roadmapa i pytanie 7

**File**: `context/foundation/roadmap.md`

**Intent**: W S-14 i w Open Roadmap Question 7 zastąpić nieaktualne numery linii aktualnymi miejscami (pięć, z kontrolą CI) i wpisać zmierzony skutek: przed zmianą Dermovate, Hepa-Merz 3000, Tardyferon — „ta sama substancja”, Citrafleet, Cyclo 3 Fort — „Nie masz”; po zmianie wszystkie „Masz ten lek”; niewiadoma S-14 rozstrzygnięta. Status zmienia `/10x-implement` i `/10x-archive`, nie ta faza.

**Contract**: blok `### S-14`, punkt 7 w „Open Roadmap Questions”; potem `npm run roadmap:sync`.

#### 3. Golden wyszukiwania

**File**: `.perf/search-golden.json` (lokalny, poza repozytorium)

**Intent**: Migracja tworzy nową wersję listy, więc `search:check` przed i po nie jest porównywalny; zapisać golden od nowa na nowej liście.

**Contract**: `npm run search:check -- --save`, potem `npm run search:check` (exit 0).

### Success Criteria:

#### Automated Verification:

- `npm run search:check -- --save`, a potem `npm run search:check` kończy się kodem 0
- `npm run lint` bez błędów po zmianach dokumentacji
- `npm run roadmap:sync -- --dry-run` pokazuje tylko zmianę S-14

#### Manual Verification:

- W aplikacji (lokalnie, `http://localhost:4321/szukaj`) z pozycją Dermovate ze spacją w mocy w apteczce: sprawdzenie Dermovate z podpowiedzi daje „Masz ten lek” (wcześniej „ta sama substancja”)
- To samo dla Citrafleet `(0,01 g + 3,50 g + 10,97 g)/saszetkę` (wcześniej „Nie masz”)
- Po merge i `npx supabase db push` na produkcji: `select variant_count from registry_search_list` mniejsze o 5 względem stanu sprzed push, a sprawdzenie Dermovate jak wyżej

**Implementation Note**: Testy ręczne wykonuje użytkownik albo agent — decyduje użytkownik. Produkcyjny `db push` wyłącznie ręcznie, przez autora, po merge.

---

## Testing Strategy

### Unit Tests:

- `variantKey`: spacje na początku/końcu w każdej części dają ten sam klucz; podwójna spacja w środku — inny; wielkość liter jak dotąd.
- `kitItemVariantKey`: obcinanie przed skróceniem do 80 znaków.

### Integration Tests:

- `tests/db/variant-key.test.ts`: `medicine_check` (`match: 'variant'`, werdykt „masz ten lek”), `registry_variant_packages` (opakowania obu zapisów z obu stron), `registry_refresh_search_list` (jeden wariant; podwójna spacja — dwa).
- Istniejące `medicine-check.test.ts`, `registry-variant-packages.test.ts`, `registry-import.test.ts` (scratchowa baza z pięcioma migracjami rejestru) bez zmian w asercjach.
- CI `smoke`: `registry-import-check.mjs` na fiksturach.

### Manual Testing Steps:

1. Zalogować się lokalnie i dodać do apteczki Dermovate w zapisie ze spacją: produkt 100266120 (import równoległy, moc `0,5 mg/ml `). Po migracji formularz dodawania pokazuje opakowania obu zapisów w jednym wariancie, więc trzeba wybrać opakowanie tego produktu. Przedstawicielem wariantu na liście jest 100018066.
2. Na `/szukaj` wybrać Dermovate z podpowiedzi i sprawdzić. Oczekiwany werdykt: „Masz ten lek”.
3. Powtórzyć dla Citrafleet `(0,01 g + 3,50 g + 10,97 g)/saszetkę`.

## Performance Considerations

`btrim` w kluczu to stały koszt na wiersz; brak indeksów na tych wyrażeniach. Lista maleje o 5 wariantów — payload praktycznie bez zmian, `npm run perf` niepotrzebny.

## Migration Notes

Dwie migracje, obie tylko redefiniują funkcje (bez zmian danych i schematu). Produkcja: merge, potem ręczny `npx supabase db push`; ostatnie polecenie pierwszej migracji przelicza listę. Rollback: przywrócić poprzednie definicje (`20261116120000_withdrawn_medicine_in_kit.sql` dla listy i opakowań, `20261010120000_medicine_check.sql` dla reguły), potem `select public.registry_refresh_search_list()`.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-14, Open Roadmap Question 7)
- Audyt: `context/audits/prd-conformance/2026-11-16.md` (F4)
- Pomiar z 2026-10-08 i decyzja autora: `context/archive/2026-10-10-testing-check-verdict-correctness/placeholder-measurement.md:22-33,118`
- Wzorzec migracji z kolejnością wdrożenia: `supabase/migrations/20261116120000_withdrawn_medicine_in_kit.sql`
- Reguła sprawdzenia: `supabase/migrations/20261010120000_medicine_check.sql:110-225`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Klucz wariantu z btrim (baza i klient)

#### Automated

- [x] 1.1 Nowy `tests/db/variant-key.test.ts` i nowe przypadki w `src/lib/kit-import.test.ts` padają przed zmianą reguły (zapisane wyjście czerwonego przebiegu)
- [x] 1.2 Migracje stosują się na lokalnej bazie bez resetu: `npx supabase migration up`
- [x] 1.3 `npm run test:db` przechodzi (w tym `registry-import.test.ts` ze strażnikiem `REGISTRY_MIGRATIONS` i nowy test wariantu)
- [x] 1.4 `npx vitest run --project unit --project component --project registry` przechodzi
- [ ] 1.5 `node scripts/registry-import-check.mjs` przechodzi na lokalnej bazie
- [x] 1.6 `npm run lint` i `npx astro check` bez błędów

#### Manual

- [x] 1.7 Na lokalnej bazie lista ma 16 273 warianty (było 16 278), a Dermovate `0,5 mg/ml` roztwór na skórę jest w podpowiedziach raz

### Phase 2: Dokumentacja i weryfikacja

#### Automated

- [ ] 2.1 `npm run search:check -- --save`, a potem `npm run search:check` kończy się kodem 0
- [ ] 2.2 `npm run lint` bez błędów po zmianach dokumentacji
- [ ] 2.3 `npm run roadmap:sync -- --dry-run` pokazuje tylko zmianę S-14

#### Manual

- [ ] 2.4 W aplikacji (lokalnie, `http://localhost:4321/szukaj`) z pozycją Dermovate ze spacją w mocy w apteczce: sprawdzenie Dermovate z podpowiedzi daje „Masz ten lek” (wcześniej „ta sama substancja”)
- [ ] 2.5 To samo dla Citrafleet `(0,01 g + 3,50 g + 10,97 g)/saszetkę` (wcześniej „Nie masz”)
- [ ] 2.6 Po merge i `npx supabase db push` na produkcji: `select variant_count from registry_search_list` mniejsze o 5 względem stanu sprzed push, a sprawdzenie Dermovate jak wyżej
