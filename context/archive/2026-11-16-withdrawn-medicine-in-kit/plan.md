# Withdrawn medicine in kit Implementation Plan

## Overview

Lek wycofany z rejestru (Rejestr Produktów Leczniczych, RPL) ma być widoczny w podpowiedziach z oznaczeniem „wycofany z rejestru” i niżej niż aktywne leki tego samego poziomu dopasowania. Da się go też dodać do apteczki, zaimportować z CSV i sprawdzić. Dzięki temu lek kupiony przed wycofaniem da się wpisać i zachować. Wycofane opakowania leków, które nadal są w rejestrze, także można wybrać, z oznaczeniem i za aktywnymi. Roadmapa S-13, audyt `context/audits/prd-conformance/2026-11-16.md` F15, Open Roadmap Question 5.

## Current State Analysis

- **Lista podpowiedzi** (`registry_refresh_search_list()`, `supabase/migrations/20261002130000_registry_search_list_version.sql:41-81`):
  - bierze tylko produkty z `p.removed_at is null`;
  - zwija warianty po kluczu `lower(name), lower(coalesce(strength,'')), lower(coalesce(pharmaceutical_form,''))`, a przedstawicielem zostaje produkt nie-IR o najniższym id;
  - krotka to `[id, name, strength, form, commonName, substances]`, bez znacznika.
- **`registry_variant_packages(p_product_id)`** (`supabase/migrations/20261007120000_kit_items.sql:89-127`):
  - zwraca tylko aktywne opakowania aktywnych produktów wariantu (`p.removed_at is null and pk.removed_at is null`);
  - kolejność: opakowania przedstawiciela, potem `p.id, pk.id`;
  - z niej korzystają `GET /api/registry/packages` i `PATCH /api/kit/[id]`.
- **Polityki RLS `kit_items`** sprawdzają tylko `user_id = auth.uid()` (`kit_items.sql:44-67`). Baza już dziś przyjmuje wycofane opakowanie (`tests/db/kit-access.test.ts:276-282`, „known gap F2”). Roadmapa i audyt błędnie twierdzą, że blokuje to polityka. Linie 118–119, które cytują, to filtr funkcji opakowań.
- **API odrzuca wycofane opakowania:**
  - `getPackage` i `getPackages` (`src/lib/services/kit.ts:64-128`) filtrują `removed_at`;
  - `POST /api/kit` (`src/pages/api/kit/index.ts:47-50`) i `POST /api/kit/import` (`import.ts:52-61`) zwracają wtedy 400 „Package not found or withdrawn from the registry”;
  - `PATCH` (`[id].ts:62-70`) przyjmuje tylko opakowanie z listy aktywnych;
  - `kit.ts:78` nie jest odporne na null: przy braku wiersza warunek `row?.registry_products?.removed_at !== null` jest prawdziwy przez `undefined`, więc wynik jest dobry, ale tylko przypadkiem.
- **`medicine_check`** już przyjmuje wycofany produkt i zwraca `withdrawn` dla pozycji apteczki (`20261010120000_medicine_check.sql:106-138`). Brakuje mu tylko wejścia z podpowiedzi.
- **Wyszukiwarka** (`src/lib/registry-search.ts`):
  - `buildSearchIndex` sortuje raz przez `compareEntries` (długość nazwy, nazwa, moc, id);
  - `searchVariants` dzieli trafienia na 4 poziomy (A–D) i zwraca `levels.flat().slice(0, limit)`.
- **Etykieta „wycofany z rejestru”** już jest w `KitItemDetails.tsx:44`.
- **Formularze:**
  - `KitAddForm.tsx:52-53` i `KitImportRow.tsx:88` same wybierają opakowanie, gdy lista ma dokładnie jedno;
  - przy pustej liście pokazują „Brak aktywnych opakowań tego leku w rejestrze” (`KitAddForm.tsx:153`, `KitImportRow.tsx:128`);
  - `KitItemEdit.packOptions` (`KitItemEdit.tsx:47-68`) przypina własne wycofane opakowanie pozycji jako „obecne”, bo RPC go nie zwraca.
- **Lokalna baza:** pełny rejestr, 16 280 wariantów, payload 2 049 569 B, 0 wycofanych produktów i opakowań. Zapas wydajności na wolnym profilu to ok. 350 ms (`roadmap.md:157`).

## Desired End State

- Podpowiedzi na `/szukaj`, w dodawaniu i w imporcie zawierają wycofane warianty. Pod nazwą wariantu stoi „wycofany z rejestru”. W obrębie poziomu dopasowania wycofany stoi za wszystkimi aktywnymi, a przed słabszymi poziomami.
- Wariant jest wycofany, gdy wycofane są wszystkie produkty o jego kluczu. Jeśli choć jeden produkt jest aktywny, przedstawicielem jest aktywny produkt i wariant jest aktywny.
- Lista opakowań wariantu zawiera wycofane opakowania (także wycofanych produktów-rodzeństwa) z oznaczeniem „wycofane”, za aktywnymi. Opakowanie wybiera się samo tylko wtedy, gdy lista ma dokładnie jedno opakowanie, licząc też wycofane.
  - ADAPT (przegląd implementacji, F3): `uniquePacks` zwija opakowania tego samego produktu o tej samej etykiecie bez względu na `withdrawn`. Aktywne idą pierwsze, więc wycofany bliźniak aktywnego opakowania nie pojawia się na liście i nie liczy się do reguły „dokładnie jedno”. Takie dwie pozycje nie dają użytkownikowi realnego wyboru, a `medicine_check` dopasowuje po wariancie. W edycji pozycja na ukrytym bliźniaku jest przypinana jako „obecne”. Oba przypadki przypinają testy w `KitAddForm.test.tsx` i `KitItemEdit.test.tsx`.
- `POST /api/kit`, `POST /api/kit/import` i `PATCH /api/kit/[id]` przyjmują wycofane opakowanie. Nieistniejące opakowanie dalej dostaje 400.
- Karta sprawdzenia na `/szukaj` pokazuje „wycofany z rejestru” dla wycofanego leku. Wynik `medicine_check` się nie zmienia.
- Nowy kod działa też na starej bazie: krotka 6-elementowa oznacza aktywny wariant, a brak kolumny `withdrawn` w RPC oznacza `false`.
- PRD, roadmapa (S-13, OQ5, poprawka o RLS), audyt F15, test-plan i AGENTS.md opisują nowe zachowanie.

Weryfikacja:

- `registry-import-check.mjs`, `test:db`, `test:api` i testy unit oraz component przechodzą. Nowe testy czerwienieją po celowym zepsuciu.
- `search:check` na pełnym rejestrze nie pokazuje różnic.
- `npm run perf` z ~1000 sztucznie dodanymi wycofanymi wariantami mieści się w progu 5 s na wolnym profilu.

### Key Discoveries:

- Zmiana listy kolumn `returns table(...)` wymaga `drop function` i ponownego `create`, a potem powtórzenia `revoke` i `grant`. `create or replace` tego nie przyjmie.
- Krotka listy jest pozycyjna, a stary kod ignoruje nadmiarowe elementy. Dlatego znacznik idzie jako opcjonalny 7. element `true`, dopisywany tylko wycofanym wariantom. Payload aktywnych wariantów zostaje bajt w bajt taki sam, więc wydajność rośnie tylko o same wycofane warianty.
- `registry_refresh_search_list()` podbija wersję listy. Migracja kończy się wywołaniem tej funkcji, więc przeglądarki pobiorą nową listę bez zmian w cache.
- **Kolejność wdrożenia: najpierw kod (merge PR-a), potem ręczny `npx supabase db push`.**
  - Nowy kod na starej bazie: lista nie ma wycofanych, a API przyjęłoby wycofane opakowanie tylko ze spreparowanego żądania. To nieszkodliwe.
  - Odwrotna kolejność: stary kod pokazałby wycofane warianty bez oznaczenia, a dodanie ich opakowań kończyłoby się błędem 400.
- `onSearched` w `RegistrySearch.tsx` podmienia kartę wariantu na `result.searched` z `medicine_check`, który nie ma znacznika. Znacznik trzymamy z wybranej podpowiedzi w stanie klienta, bez zmiany `medicine_check`, bo S-14 zmienia tę samą funkcję.
- `KitItemEdit.packOptions` zwraca listę bez przypinania, gdy własne opakowanie pozycji jest na liście (`:56-58`). Gdy RPC zwraca wycofane opakowania, własne wycofane opakowanie trafia na listę samo, więc trzeba sprawdzić, jak jest wtedy oznaczane jako „obecne”. Gałąź przypinania zostaje na wypadek opakowania spoza wariantu.
- `tests/api/helpers.ts` `insertKitRow` wpisuje wycofane opakowanie bezpośrednio do bazy, „bo aplikacja go odrzuca”. Po zmianie test może dodać je przez API, a helper i opis w AGENTS.md trzeba poprawić.
- Fixture'y po importach v1, v1, v2 mają wycofany produkt Crestor 100434824 i wycofane opakowania 4, 6018 i 6982 (`rpl-sample-v1.xml`). To naturalne obiekty testów ręcznych i API.

## What We're NOT Doing

- Nie zmieniamy polityk RLS `kit_items` (nic nie blokują) ani `medicine_check` (już działa; S-14 zmienia tę funkcję osobno).
- Nie dodajemy limitu wieku wycofanych leków. Do listy trafiają wszystkie z bazy, a limit można dodać później jedną migracją.
- Nie zmieniamy reguły `matchRow` w imporcie CSV. Wycofany wariant liczy się jak każde trafienie, więc dwa pasujące warianty dają wybór użytkownika. Test przypina to zachowanie.
- Nie zmieniamy `normalizeText`, `wordsOf` ani poziomów dopasowania. Zmienia się tylko kolejność w obrębie poziomu.
- Nie zmieniamy `smoke.mjs`: aktywne opakowania stoją pierwsze, a smoke bierze pierwszy wariant i jego pierwsze opakowanie.
- Nie mierzymy wydajności na produkcji.

## Implementation Approach

1. **Baza (faza 1).** Zmienia dwie funkcje w jednej migracji i dodaje do testów bazy oczekiwania dla obu.
2. **Kontrakt serwera i API (faza 2).** Faza zmienia:
   - typy `withdrawn` w krotce, wariancie i opakowaniu;
   - `kit.ts`;
   - trzy endpointy;
   - testy `test:api`.

   Typy klienta lądują tutaj, żeby fazy 3 i 4 nie zmieniały `src/types.ts`.

3. **Fazy 3 i 4 można robić równolegle**, bo mają rozłączne pliki:
   - faza 3: wyszukiwarka, podpowiedzi i karta sprawdzenia;
   - faza 4: wybór opakowania w trzech formularzach i propozycje w imporcie.
4. **Faza 5:** pomiar wydajności, testy ręczne i dokumentacja.

**Stan lokalnej bazy w kolejnych krokach** (`db reset` kasuje pełny rejestr):

| Krok                                                                             | Potrzebna baza | Jak ją uzyskać                                                                             |
| -------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| golden `search:check` (faza 1)                                                   | pełny rejestr  | zapisz go przed zmianą sortowania w fazie 3, po `npx supabase migration up` nowej migracji |
| `registry-import-check`, `test:db`, `test:api`, smoke, testy ręczne na Crestorze | fixture'y      | `npx supabase db reset`, import v1, v1, v2                                                 |
| perf (faza 5)                                                                    | pełny rejestr  | `npm run registry:import`                                                                  |

## Phase 1: Baza — lista podpowiedzi i opakowania wariantu

### Overview

Nowa migracja:

- dopuszcza wycofane warianty w liście, ze znacznikiem i z pierwszeństwem aktywnego przedstawiciela;
- sprawia, że `registry_variant_packages` zwraca wszystkie opakowania wariantu z polem `withdrawn`.

### Changes Required:

#### 1. Testy bazy (najpierw, czerwone)

**File**: `scripts/registry-import-check.mjs`

- `syntheticCollapse`:
  - aktywny 900000003 dalej jest przedstawicielem, a wycofany 900000001 (najniższe id) przegrywa;
  - nowy wariant 900000004 jest wycofany w całości, ma w krotce 7. element `true` i trafia do listy;
  - aktywny wariant nie ma 7. elementu.
- Sprawdzenia listy po v1, v1, v2:
  - Crestor 100434824 jest w liście z `true`;
  - `variant_count` liczy przedstawicieli wszystkich produktów, nie tylko aktywnych.

**File**: `tests/db/registry-variant-packages.test.ts` (nowy, na helperach `tests/db/medicine-check-fixtures.ts`, w transakcji wycofywanej po każdym teście)

- Wariant z aktywnym i wycofanym produktem (oraz wycofanym opakowaniem aktywnego produktu):
  - zwracane są wszystkie opakowania;
  - `withdrawn` jest prawdziwe dla opakowania wycofanego produktu i dla wycofanego opakowania;
  - kolejność: aktywne przed wycofanymi, w każdej grupie najpierw opakowania podanego produktu, potem `product_id`, `package_id`.
- Wariant wycofany w całości (podane id jest wycofane): zwracane są jego opakowania, wszystkie z `withdrawn`.
- Nieznane id daje pusty wynik.
- `anon` nie może wywołać funkcji.

**File**: `tests/db/kit-access.test.ts:276`

- Test „known gap (Parked, F2): a withdrawn package is accepted” zmienia opis na zamierzone zachowanie („a withdrawn package is accepted: withdrawn medicines can be kept”).

#### 2. Migracja

**File**: `supabase/migrations/20261116120000_withdrawn_medicine_in_kit.sql`

- `create or replace function public.registry_refresh_search_list()` (sygnatura bez zmian):
  - bez `where p.removed_at is null`;
  - `row_number() over (partition by ... order by (p.removed_at is not null), (p.procedure_type is not distinct from 'IR'), p.id)`;
  - krotka: `case when r.removed_at is not null then <tablica 6 elementów> || '[true]'::jsonb else <tablica 6 elementów> end`;
  - przy tej kolejności „przedstawiciel jest wycofany” znaczy tyle co „wycofany jest cały wariant”;
  - komentarz funkcji opisuje wycofane warianty.
- `drop function public.registry_variant_packages(bigint);`, potem `create function` z dodatkową kolumną `withdrawn boolean`:
  - `pk.removed_at is not null or p.removed_at is not null`;
  - bez filtrów `removed_at`;
  - `order by withdrawn, (p.id = p_product_id) desc, p.id, pk.id`;
  - nowy komentarz, potem `revoke ... from public, anon` i `grant ... to authenticated` jak w `kit_items.sql:126-127`.
- Na końcu `select public.registry_refresh_search_list();`.
- Nagłówek migracji wyjaśnia, że polityki RLS się nie zmieniają, i podaje kolejność wdrożenia (kod, potem `db push`).

#### 3. Fixture'y testu importu

**File**: `tests/db/registry-import-fixtures.ts`

- Dodaj nową migrację do `REGISTRY_MIGRATIONS`, jeśli wymaga tego test strażnik. Migracja zmienia `registry_variant_packages`, która pochodzi z `kit_items.sql`. Sprawdź regułę strażnika: migracja dotykająca `kit_items` może nie należeć do listy, a wtedy `registry_refresh_search_list` w bazie testowej importu zostaje w starej wersji. Wybierz to, czego wymaga strażnik, i zapisz decyzję w Progress jako ADAPT.
- ADAPT (przegląd implementacji, F5): migracja jest w `REGISTRY_MIGRATIONS`. Redefiniuje `registry_refresh_search_list`, którą woła importer, więc bez niej baza testowa importu sprawdzałaby starą listę. `registry_variant_packages` usuwa przez `drop ... if exists`, dlatego migracja działa też na bazie bez `kit_items`. Strażnik (`registry-import.test.ts`, regex `auth.|kit_items`) tej decyzji nie wymusza, bo nagłówek migracji wspomina `kit_items` i strażnik przyjąłby też jej pominięcie. AGENTS.md mówi teraz wprost, że ta reguła jest ręczna.

#### 4. Golden `search:check`

- Na pełnym rejestrze (`npx supabase migration up` nowej migracji, bez `db reset`), przed fazą 3: `npm run search:check -- --save`.
- Lokalnie nie ma wycofanych produktów, więc lista różni się tylko wersją.

### Success Criteria:

#### Automated Verification:

- Nowe testy `test:db` i oczekiwania `registry-import-check` są czerwone przed migracją i zielone po niej.
- Celowe zepsucie kolejności przedstawiciela (bez `removed_at is not null` na początku) albo znacznika czerwieni `registry-import-check`.
- `npx supabase db reset`, import v1, v1, v2, potem `node scripts/registry-import-check.mjs` przechodzi.
- `npm run test:db` przechodzi.

#### Manual Verification:

- Brak (zmiana bez UI; stary kod na nowej bazie nie jest wspieraną kombinacją).

---

## Phase 2: Kontrakt serwera i API

### Overview

Typy dostają `withdrawn`. Serwis i trzy endpointy przyjmują wycofane opakowania. Kod działa na starej i na nowej bazie.

### Changes Required:

#### 1. Testy API (najpierw, czerwone)

**File**: `tests/api/kit-input.test.ts`

- Sześć przypadków, które dziś wymagają odrzucenia wycofanego opakowania, zmienia się na przyjęcie:
  - `POST /api/kit` (`:104-105`) i import (`:282-283`): 201 i wiersz zapisany;
  - `PATCH` (`:550-551`): przeniesienie na wycofane opakowanie tego samego wariantu daje 200.
- Nieistniejące opakowanie dalej dostaje 400. Oczekiwany komunikat to „Package not found”.
- `PATCH` na opakowanie innego wariantu dalej dostaje 400.
- Nagłówek pliku (`:13`) opisuje nową regułę.
- Test limitu ilości na wycofanym opakowaniu (`:591-613`) zostaje.

**File**: `tests/api/helpers.ts`

- `insertKitRow` (`:314-333`) i jego komentarz: wycofane opakowanie można teraz dodać przez API. Jeśli helper nie jest już potrzebny, testy przechodzą na `POST /api/kit`, a helper znika. Jeśli jest używany gdzie indziej, zostaje z poprawionym opisem.

**File**: `src/lib/services/kit.test.ts` (nowy, node, z atrapą klienta Supabase) albo test w istniejącym pliku unit. Przypina:

- mapowanie wiersza RPC bez kolumny `withdrawn` (stara baza) na `false`;
- `getPackage` dla braku wiersza zwraca `null`;
- `getPackage` dla wycofanego opakowania zwraca je z `withdrawn: true`.

#### 2. Typy

**File**: `src/types.ts`

- `RegistryVariantTuple`: opcjonalny 7. element `withdrawn?: true`.
- `RegistryVariant`: `withdrawn: boolean`.
- `RegistryVariantPackage`: `withdrawn: boolean`. Komentarz „An active pack” zmienia się na „A pack of a variant, active or withdrawn”.

#### 3. Serwis

**File**: `src/lib/services/kit.ts`

- `VariantPackageRow` dostaje `withdrawn?: boolean`, a `getVariantPackages` mapuje `withdrawn: row.withdrawn ?? false`.
- `getPackage` i `getPackages`:
  - bez `.is("removed_at", null)` i bez odrzucania wycofanego produktu;
  - select czyta `removed_at` opakowania;
  - zwracają `withdrawn`;
  - `getPackage` sprawdza `if (!row) return null` jawnie.
- Komentarze opisują nową regułę.

#### 4. Endpointy

- **`src/pages/api/kit/index.ts:47-50`**: komunikat 400 to „Package not found”.
- **`src/pages/api/kit/import.ts:52-61`**: komunikat 400 to „Package not found”, z `index` jak dziś.
- **`src/pages/api/kit/[id].ts:57-70`**: logika bez zmian (przynależność do wariantu), poprawione komentarze. Funkcja opakowań zwraca teraz też wycofane, więc przynależność nie dowodzi już, że opakowanie jest aktywne.
- **`src/components/kit/KitImport.test.tsx:384`**: atrapa odpowiedzi dostaje nowy komunikat.

#### 5. Dekodowanie krotki

**File**: `src/lib/registry-search.ts`

- `buildSearchIndex` zamienia 7. element na `withdrawn: withdrawn === true`.
- Brak elementu oznacza `false`, więc lista ze starej bazy działa jak dziś.
- Faza 2 nie zmienia sortowania (to zadanie fazy 3).

### Success Criteria:

#### Automated Verification:

- Zmienione testy `test:api` są czerwone przed zmianą serwisu i zielone po niej (na nowej bazie z fixture'ami).
- Celowe przywrócenie filtra `removed_at` w `getPackage` czerwieni `test:api`.
- Testy unit + component + registry przechodzą.
- Lint i `npx astro check` przechodzą.
- `npm run test:api` przechodzi na lokalnym serwerze (baza: fixture'y v1, v1, v2).

#### Manual Verification:

- Brak (UI w fazach 3 i 4).

---

## Phase 3: Podpowiedzi i karta sprawdzenia

### Overview

Wycofane warianty stoją za aktywnymi w obrębie poziomu dopasowania. Podpowiedź i karta sprawdzenia na `/szukaj` pokazują „wycofany z rejestru”.

### Changes Required:

#### 1. Testy (najpierw, czerwone)

**File**: `src/lib/registry-search.test.ts`

- Wycofany wariant o krótszej, dokładnie pasującej nazwie stoi za aktywnym wariantem z tego samego poziomu.
- Wycofany wariant z poziomu A stoi przed aktywnym z poziomu B.
- Limit tnie wycofane jako pierwsze w obrębie poziomu.
- Krotka bez 7. elementu daje `withdrawn: false`, a z `true` daje `true`.

**File**: `src/components/registry/RegistrySearch.test.tsx`

- Podpowiedź wycofanego wariantu ma tekst „wycofany z rejestru”.
- Po wyborze i odpowiedzi `medicine_check` karta sprawdzenia dalej pokazuje „wycofany z rejestru”.
- Aktywny wariant tego tekstu nie ma.

#### 2. Kolejność

**File**: `src/lib/registry-search.ts`

- `compareEntries` dostaje pierwszy klucz: `Number(a.variant.withdrawn) - Number(b.variant.withdrawn)`.
- Poziomy są wypełniane w kolejności posortowanego indeksu, więc w każdym poziomie aktywne stoją przed wycofanymi.
- Komentarz `buildSearchIndex` dopisuje tę regułę.

#### 3. Etykieta w podpowiedziach

**File**: `src/components/registry/MedicineSuggest.tsx:206-222`

- Pod szczegółami opcji, w osobnej linii, `{variant.withdrawn && <span className="text-muted-foreground text-xs">wycofany z rejestru</span>}`.
- Tylko klasy ról, bo widok jest w `ui:scan`.
- Tekst należy do dostępnej nazwy opcji, więc czytnik ekranu go odczyta.

#### 4. Karta sprawdzenia

**File**: `src/components/registry/RegistrySearch.tsx`

- `VariantCard` (`:20-40`) dostaje `withdrawn` i pokazuje „wycofany z rejestru” jak `KitItemDetails`.
- Znacznik pochodzi z wybranej podpowiedzi i zostaje po `onSearched`, który podmienia dane karty na `result.searched`. Przechowaj go w stanie obok wybranego wariantu.

#### 5. Golden

- Na pełnym rejestrze `npm run search:check` (bez `--save`): bez różnic. Lokalnie 0 wycofanych, więc kolejność się nie zmienia.

### Success Criteria:

#### Automated Verification:

- Nowe testy są czerwone przed zmianą i zielone po niej.
- Celowe usunięcie klucza `withdrawn` z `compareEntries` czerwieni testy kolejności.
- Celowe usunięcie etykiety czerwieni testy komponentu.
- Testy unit + component + registry przechodzą.
- Lint, `npx astro check` i `npm run ui:scan` przechodzą.
- `npm run search:check` na pełnym rejestrze: bez różnic.

#### Manual Verification:

- Na fixture'ach `http://localhost:4321/szukaj`, „crestor”: podpowiedź z „wycofany z rejestru”, a po wyborze karta z tym samym oznaczeniem i wynik sprawdzenia.

---

## Phase 4: Wybór opakowania w formularzach

### Overview

Dodawanie, import i edycja pokazują wycofane opakowania z oznaczeniem „wycofane”, za aktywnymi. Opakowanie wybiera się samo tylko wtedy, gdy wariant ma jedno opakowanie w ogóle. Propozycje leku w imporcie oznaczają wycofane warianty.

### Changes Required:

#### 1. Testy (najpierw, czerwone)

**File**: `src/components/kit/KitAddForm.test.tsx`

- Wariant z aktywnym i wycofanym opakowaniem:
  - oba są na liście, a wycofane ma „wycofane”;
  - nic nie jest wybrane samo;
  - zapis wycofanego wysyła jego `packageId`.
- Wariant z jednym wycofanym opakowaniem: opakowanie wybiera się samo i ma oznaczenie.
- Pusta lista: komunikat „Brak opakowań tego leku w rejestrze”.

**File**: `src/components/kit/KitImport.test.tsx`

- Wiersz, którego pierwsze zapytanie trafia w aktywny i wycofany wariant (np. „X; 500 mg; tabletki” → „X 500 mg tabletki” wycofany i „X 500 mg tabletki powlekane” aktywny):
  - wiersz czeka na wybór, bez przypisania automatycznego;
  - propozycja wycofanego wariantu ma „wycofany z rejestru”.
- Wycofane opakowanie w wierszu ma „wycofane”.

**File**: `src/components/kit/KitItemEdit.test.tsx`

- Pozycja na wycofanym opakowaniu, które RPC zwraca teraz na liście:
  - opakowanie występuje raz, oznaczone jako obecne;
  - zapis bez zmiany nie wysyła `packageId`.
- Przeniesienie na inne wycofane opakowanie wysyła jego `packageId`.
- Dotychczasowe testy przypinania (`:109-130`) dostają `withdrawn` w fixture'ach opakowań.

**File**: `src/lib/kit-import.test.ts`

- `matchRow` przy dwóch trafieniach, z których jedno jest wycofane, nie daje `auto`. To przypięcie obecnej reguły.

#### 2. Wspólna etykieta opakowania

**File**: `src/components/kit/kit-fields.tsx` (albo istniejący helper etykiety opakowania)

- Mały element „wycofane” (klasa `text-muted-foreground`) dopisywany do etykiety opakowania z `withdrawn`.
- Jeden kształt dla trzech formularzy.

#### 3. Formularze

- **`src/components/kit/KitAddForm.tsx`**: oznaczenie wycofanych opakowań i komunikat pustej listy. Reguła samodzielnego wyboru (`packages.length === 1`) zostaje: lista zawiera teraz wycofane, więc jedno aktywne z jednym wycofanym daje wybór użytkownika. Komentarz mówi to wprost.
  - ADAPT (ręczne sprawdzenie na produkcji, PR #81): plan nie przewidywał oznaczenia wycofanego wariantu po wyborze, więc przy leku wycofanym w całości (np. Batrafen) linia „Wybrano: …” nie mówiła, że wycofany jest cały lek, a nie tylko opakowanie. Pod tą linią stoi teraz `WithdrawnVariantNote`, jak na karcie `/szukaj`. Przypina to test w `KitAddForm.test.tsx`.
- **`src/components/kit/KitImportRow.tsx`**:
  - oznaczenie opakowań (`RowPack`);
  - komunikat pustej listy (`:125-130`);
  - „wycofany z rejestru” przy propozycjach (`:417-438`) i przy wariancie bieżącym (`:350-358`).
- **`src/components/kit/KitItemEdit.tsx`**:
  - `packOptions` oznacza jako obecne opakowanie o `packageId === item.packageId` także wtedy, gdy przyszło z RPC;
  - gałąź przypinania zostaje dla opakowania spoza listy, z poprawionym komentarzem;
  - oznaczenie wycofanych opakowań.

### Success Criteria:

#### Automated Verification:

- Nowe testy są czerwone przed zmianą i zielone po niej.
- Celowe usunięcie oznaczenia „wycofane” czerwieni testy komponentu.
- Celowe pominięcie wycofanych w samodzielnym wyborze (`packages.filter(active).length === 1`) czerwieni test `KitAddForm`.
- Testy unit + component + registry przechodzą.
- Lint, `npx astro check` i `npm run ui:scan` przechodzą.

#### Manual Verification:

- Na fixture'ach:
  - `http://localhost:4321/apteczka`: dodanie Crestora (opakowanie z oznaczeniem, zapis, pozycja z „wycofany z rejestru” na liście);
  - edycja tej pozycji (opakowanie widoczne raz jako obecne);
  - import CSV z wierszem Crestora na `http://localhost:4321/apteczka/import`.

---

## Phase 5: Wydajność, testy końcowe i dokumentacja

### Overview

Pomiar ze sztucznymi wycofanymi wariantami, pełny zestaw testów na fixture'ach i dokumentacja.

### Changes Required:

#### 1. Pomiar wydajności

**File**: `scripts/perf-withdrawn-fixture.mjs` (nowy, tylko lokalne `DATABASE_URL`, odmawia innych hostów)

- `--add <n>` dodaje `n` nowych produktów z id od `900000000`:
  - są kopiami prawdziwych wierszy z ich substancjami;
  - mają nazwę z dopiskiem, więc każdy tworzy nowy klucz wariantu;
  - mają `removed_at = now()`;
  - na koniec `registry_refresh_search_list()`.
- `--remove` usuwa te wiersze i przebudowuje listę.
- Skrypt nie zmienia istniejących wierszy.

Przebieg na pełnym rejestrze:

1. `npm run build`, serwer przez `wrangler dev` (AGENTS.md);
2. `npm run perf -- --profile slow` jako punkt odniesienia z tej samej sesji;
3. `--add 1000` i ten sam pomiar;
4. `--remove`.

Zapisz rozmiar payloadu przed i po, a czasy listy gotowej i wpisania `ibu 400` w `plan.md` (sekcja wyników fazy 5) i w `roadmap.md` przy marginesie wydajności.

Alternatywa zamiast skryptu: jednorazowy SQL w scratchpadzie. Wtedy w repozytorium nie zostaje żaden plik, a opis kroku trafia do `test-plan.md`. Wybierz przy implementacji i zapisz decyzję jako ADAPT.

#### 2. Testy końcowe na fixture'ach

`npx supabase db reset`, import v1, v1, v2, potem:

- `node scripts/registry-import-check.mjs`;
- `npm run test:db`;
- serwer;
- `npm run smoke`;
- `npm run test:api`;
- `BASE_URL=http://localhost:4321 npm run ui:shots -- --label withdrawn`, z obejrzeniem stanów podpowiedzi.

#### 3. Dokumentacja

- **`context/foundation/prd.md`**: linia 146 („withdrawn not suggested today (change: S-13)”) i opisy 143, 238–239 opisują nowe zachowanie.
- **`context/foundation/roadmap.md`**:
  - S-13: poprawka „polityka RLS nie blokuje, zmienia się funkcja opakowań”;
  - OQ5 jako rozwiązane w S-13;
  - margines wydajności po pomiarze;
  - potem `npm run roadmap:sync`.
- **`context/audits/prd-conformance/2026-11-16.md`** F15: dopisek o błędnym wskazaniu polityki i o zamknięciu w S-13.
- **`context/foundation/test-plan.md`**: wycofane w liście i w funkcji opakowań, krok pomiaru wydajności.
- **`AGENTS.md`**: opisy `test:db` (nowy plik testu, F2 nie jest już luką), `test:api` (wycofane opakowanie przyjmowane, `insertKitRow`) i kolejność wdrożenia tej migracji.

### Wyniki fazy 5

ADAPT: zamiast `scripts/perf-withdrawn-fixture.mjs` użyto jednorazowego skryptu w scratchpadzie. W repozytorium nie został żaden plik, a opis kroku jest w `test-plan.md`.

Pomiar z 2026-11-16 na pełnym rejestrze lokalnie. Build uruchomiony przez `wrangler dev`, `npm run perf -- --profile slow`, 5 przebiegów, mediany:

| Stan              | Warianty             | Payload     | Lista gotowa (max) | Szac. z dławionym workerem | Wpisywanie na starcie (max) | Wpisywanie po wczytaniu (max) |
| ----------------- | -------------------- | ----------- | ------------------ | -------------------------- | --------------------------- | ----------------------------- |
| Punkt odniesienia | 16 280               | 2 049 569 B | 2336 ms (2555)     | 3005 ms                    | 56 ms (112)                 | 48 ms (72)                    |
| +1000 wycofanych  | 17 280 (1000 wycof.) | 2 190 890 B | 2479 ms (2645)     | 3082 ms                    | 80 ms (200)                 | 64 ms (88)                    |
| Po usunięciu      | 16 280               | 2 049 569 B | —                  | —                          | —                           | —                             |

Payload urósł o 141 321 B (+6,9%), a czas do gotowej listy o ok. 140 ms. Wszystkie wyniki mieszczą się w progach.

ADAPT (5.2): na `wrangler dev` dwa przypadki `test:api` („PATCH bez sesji → 401”) dostały 500. W logu serwera było „Network connection lost” od proxy wranglera: proxy zrywa połączenie, gdy worker odpowiada 401 bez czytania treści `PATCH`. Sam worker zwrócił w tych przypadkach 401. Na `astro dev` `test:api` przechodzi w całości (175/175).

ADAPT (5.5): `ui:shots` szuka „ibu”, a w fixture'ach nie ma ibuprofenu, więc stany z podpowiedziami kończą się timeoutem. Zamiast tego zrobiono celowane zrzuty `/szukaj` z wycofanym Crestorem 5 mg z fixture'ów, na 1280 i 390 px. Oznaczenie „wycofany z rejestru” jest w podpowiedzi i na karcie, a wynik sprawdzenia pokazuje się poprawnie. To zamyka też 3.6.

### Success Criteria:

#### Automated Verification:

- Na fixture'ach przechodzą: `registry-import-check`, `npm run test:db`, `npm run smoke`, `npm run test:api`.
- Na pełnym rejestrze: perf slow z 1000 wycofanymi wariantami mieści się w 5 s dla listy gotowej.
- Testy unit + component + registry, lint, `npx astro check` i `npm run ui:scan` przechodzą.

#### Manual Verification:

- Zrzuty `ui:shots` podpowiedzi i karty z wycofanym lekiem są czytelne na 1280 i 390 px.
- Po merge'u: `npx supabase db push` (krok autora), potem na produkcji podpowiedź wycofanego leku z oznaczeniem.

---

## Testing Strategy

### Unit Tests:

- Kolejność i dekodowanie krotki w `registry-search.test.ts`.
- `matchRow` z wycofanym trafieniem.
- Mapowanie `withdrawn` w `kit.ts` (stara i nowa baza).

### Integration Tests:

- `test:db`: `registry_variant_packages` i `kit-access`.
- `registry-import-check`: lista z wycofanymi i przedstawiciel aktywny.
- `test:api`: dodanie, import i `PATCH` wycofanego opakowania.
- Testy komponentów trzech formularzy i `/szukaj`.

### Manual Testing Steps:

1. Na fixture'ach na `http://localhost:4321/szukaj` wpisz „crestor”. Sprawdź, że jest podpowiedź z „wycofany z rejestru”, a po wyborze karta z oznaczeniem i wynik sprawdzenia.
2. Na `http://localhost:4321/apteczka` dodaj Crestora, a potem edytuj pozycję.
3. Na `http://localhost:4321/apteczka/import` zaimportuj wiersz Crestora.
4. Po wdrożeniu: `db push` i sprawdzenie na produkcji (autor).

## Performance Considerations

- Payload rośnie tylko o wycofane warianty: aktywne krotki są identyczne, a znacznik to 5 bajtów (`,true`) na wycofany wariant.
- Sortowanie w workerze dostaje jeden tani klucz liczbowy na początku.
- Pomiar z 1000 dodatkowymi wariantami (ok. 6% listy) pokazuje zapas na kilka lat wycofań.

## Migration Notes

- Kolejność wdrożenia: merge PR-a (Cloudflare wdraża kod), potem `npx supabase db push`.
- Wycofanie zmiany wymaga przywrócenia poprzednich definicji obu funkcji. Dla `registry_variant_packages` potrzebne jest `drop` i `create`, plus `revoke` i `grant`. Na końcu `select public.registry_refresh_search_list()`.
- Pozycje apteczki dodane w tym czasie na wycofanych opakowaniach zostają: baza już dziś je przyjmuje.

## References

- Roadmapa S-13, OQ5: `context/foundation/roadmap.md`
- Audyt F15: `context/audits/prd-conformance/2026-11-16.md:260-269`
- PRD: `context/foundation/prd.md:143`, `:146`, `:238-239`
- Kod:
  - `supabase/migrations/20261002130000_registry_search_list_version.sql:41-81`
  - `supabase/migrations/20261007120000_kit_items.sql:89-127`
  - `src/lib/services/kit.ts:45-128`
  - `src/pages/api/kit/{index,import,[id]}.ts`
  - `src/lib/registry-search.ts:80-108`
  - `src/components/registry/MedicineSuggest.tsx:206-222`
  - `src/components/registry/RegistrySearch.tsx:20-40`
  - `src/components/kit/{KitAddForm,KitImportRow,KitItemEdit}.tsx`
- Poprzednia zmiana o tej samej regule „nigdy nie zgaduj”: `context/archive/2026-11-16-import-match-safety/plan-brief.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza — lista podpowiedzi i opakowania wariantu

#### Automated

- [x] 1.1 Nowe testy `test:db` i oczekiwania `registry-import-check` są czerwone przed migracją i zielone po niej — d9db50d
- [x] 1.2 Celowe zepsucie kolejności przedstawiciela albo znacznika czerwieni `registry-import-check` — d9db50d
- [x] 1.3 `registry-import-check` przechodzi po `db reset` i imporcie v1, v1, v2 — d9db50d
- [x] 1.4 `npm run test:db` przechodzi — d9db50d
- [x] 1.5 Golden `search:check` zapisany na pełnym rejestrze z nową migracją — d9db50d

### Phase 2: Kontrakt serwera i API

#### Automated

- [x] 2.1 Zmienione testy `test:api` i nowe testy `kit.ts` są czerwone przed zmianą i zielone po niej — bf649df
- [x] 2.2 Celowe przywrócenie filtra `removed_at` w `getPackage` czerwieni testy — bf649df
- [x] 2.3 Testy unit + component + registry przechodzą — bf649df
- [x] 2.4 Lint przechodzi — bf649df
- [x] 2.5 Typy przechodzą (`npx astro check`) — bf649df
- [x] 2.6 `npm run test:api` przechodzi na lokalnym serwerze z fixture'ami — bf649df

### Phase 3: Podpowiedzi i karta sprawdzenia

#### Automated

- [x] 3.1 Nowe testy kolejności i etykiety są czerwone przed zmianą i zielone po niej — 6ad405f
- [x] 3.2 Celowe zepsucie klucza `withdrawn` albo etykiety czerwieni testy — 6ad405f
- [x] 3.3 Testy unit + component + registry przechodzą — 6ad405f
- [x] 3.4 Lint, typy i `ui:scan` przechodzą — 6ad405f
- [x] 3.5 `npm run search:check` na pełnym rejestrze bez różnic — 6ad405f

#### Manual

- [x] 3.6 Na `/szukaj` (fixture'y) Crestor ma oznaczenie w podpowiedzi i na karcie sprawdzenia — 49f1065

### Phase 4: Wybór opakowania w formularzach

#### Automated

- [x] 4.1 Nowe testy komponentów i `matchRow` są czerwone przed zmianą i zielone po niej — a3a9f0a
- [x] 4.2 Celowe zepsucie oznaczenia albo samodzielnego wyboru czerwieni testy — a3a9f0a
- [x] 4.3 Testy unit + component + registry przechodzą — a3a9f0a
- [x] 4.4 Lint, typy i `ui:scan` przechodzą — a3a9f0a

#### Manual

- [x] 4.5 Dodanie, edycja i import Crestora na lokalnym serwerze działają z oznaczeniami — a3a9f0a

### Phase 5: Wydajność, testy końcowe i dokumentacja

#### Automated

- [x] 5.1 Perf slow z 1000 sztucznymi wycofanymi wariantami mieści się w 5 s, baza przywrócona — 49f1065
- [x] 5.2 `registry-import-check`, `test:db`, `smoke` i `test:api` przechodzą na fixture'ach — 49f1065
- [x] 5.3 Testy unit + component + registry, lint, typy i `ui:scan` przechodzą — 49f1065
- [x] 5.4 PRD, roadmapa, audyt, test-plan i AGENTS.md zaktualizowane, `roadmap:sync` wykonany — 49f1065

#### Manual

- [x] 5.5 Zrzuty `ui:shots` z wycofanym lekiem obejrzane na 1280 i 390 px — 49f1065
- [x] 5.6 Po merge'u `db push` i sprawdzenie wycofanego leku na produkcji
