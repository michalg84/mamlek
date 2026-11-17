# Poziom dopasowania substancji czynnych (S-06) — plan implementacji

## Overview

Użytkownik wybiera na `/szukaj` poziom dopasowania: „Ten sam skład” (precyzyjny), „Zawiera wszystkie składniki” lub „Zawiera którykolwiek składnik”. Wynik sprawdzenia leku zmienia się zgodnie z tym poziomem (roadmap S-06, FR-016, US-01). Poziom staje się parametrem RPC `medicine_check`, przechodzi przez `GET /api/kit/check` i zostaje zapamiętany w `localStorage`. Tytuł werdyktu i zastrzeżenie mówią prawdę na każdym poziomie.

## Current State Analysis

- Reguła mieszka w jednym RPC `public.medicine_check(bigint)` (`supabase/migrations/20261117120100_variant_key_btrim_medicine_check.sql:19-136`). „Substance” to dziś równość zbioru części NPS **albo** równość zbioru substancji (`:77-85`). Pusty zbiór (ogólnik) nigdy nie pasuje dzięki `cardinality(s.…_set) > 0`. Kolejność to wariant, potem termin, potem najnowsze (`:131`).
- Ogólniki: 7 wartości + przedrostki „produkt ” / „preparat ” w `medicine_check_is_generic` (`supabase/migrations/20261010120000_medicine_check.sql:37-56`). `-` nie jest na liście. Z tej funkcji korzysta tylko `medicine_check` (importer i lista wyszukiwania jej nie wołają).
- Ścieżka: `RegistrySearch.tsx:71` → `useMedicineCheck.ts:35` (`fetch /api/kit/check?product=`) → `check.ts:6,24-27` (zod) → `services/medicine-check.ts:12` (`rpc`) → `parseMedicineCheck` / `checkVerdict` (`src/lib/medicine-check-verdict.ts:47-58,74-97`) → `MedicineCheckResult.tsx` (CAUTION `:17`, ogłoszenie `sr-only` `:93-95`).
- Nie ma miejsca na preferencje: brak tabeli ustawień, `localStorage` i stanu w URL na `/szukaj`. Jest gotowy `src/components/ui/radio-group.tsx`.
- Pomiar (research): „zawiera wszystkie” daje więcej trafień niż „precyzyjny” w 36% wariantów jednoskładnikowych. Przy złożonych „zawiera jeden” podnosi medianę z 4 do 63 (max 493). Zdanie z roadmapy, że dla jednoskładnikowych poziomy dają ten sam wynik, jest fałszywe.

## Desired End State

- Na `/szukaj` nad wynikiem widać przełącznik trzech poziomów. Domyślny jest „Ten sam skład”, a wybór przeżywa przeładowanie strony na tym samym urządzeniu.
- Zmiana poziomu przy wybranym leku od razu odświeża werdykt. Nigdy nie widać werdyktu z innego poziomu ani innego leku.
- `medicine_check(p_product_id, p_level)` porównuje obie drogi (NPS i substancje) operatorem poziomu: `=` / `@>` (posiadany ⊇ szukany) / `&&`. Wynik jest monotoniczny: precyzyjny ⊆ zawiera wszystkie ⊆ zawiera którykolwiek. Ogólniki, w tym `-`, nie pasują na żadnym poziomie.
- Lista „Masz lek…” jest posortowana po sile dopasowania.
- Weryfikacja: `npm test`, `npm run test:db`, `npm run test:api` są zielone, a ręczny test na `/szukaj` (port 4333) przechodzi z czytnikiem ekranu.

### Key Discoveries:

- `x @> '{}'` jest w Postgresie zawsze prawdą. Warunek `cardinality(s.…_set) > 0` musi zostać na każdym poziomie, inaczej ogólnik w szukanym leku dopasuje całą apteczkę (`…120100:80,83`).
- `create or replace` z inną listą argumentów tworzy przeciążenie, a nie podmianę. Potrzebne jest `drop function public.medicine_check(bigint)` + `create` + ponowne `revoke`/`grant` (`…120100:7-8`, wzór: `registry_variant_packages` w AGENTS.md).
- Parametr z wartością domyślną `'exact'` zostawia bez zmian wszystkie dzisiejsze wywołania w `tests/db/*` (`checkAs` w `tests/db/medicine-check-fixtures.ts:161-167`, `kit-access.test.ts:210`, `variant-key.test.ts:134,142,173`).
- `MedicineCheckResult` montuje się od nowa przy zmianie leku (`key={selected.id}`, `RegistrySearch.tsx:71`), ale zmiana poziomu musi przejść przez zależności hooka (`useMedicineCheck.ts:24-64`), żeby przerwać poprzednie zapytanie.
- `MedicineSuggest` jest wspólny z formularzami apteczki (S-11 zmienia wyszukiwanie). Przełącznik trafia do `RegistrySearch`, nie do `MedicineSuggest`.

## What We're NOT Doing

- Nie zapisujemy poziomu na koncie (bez migracji tabeli ustawień i bez RLS) ani w URL.
- Nie pokazujemy `matchedBy` ani etykiety siły przy pozycjach. Siła wpływa tylko na kolejność.
- Nie zmieniamy liczenia pozycji apteczki: ilości, pustych opakowań ani przeterminowanych. To zakres S-12 (decyzja F10). CTE `kit` w RPC zostaje bez zmian.
- Nie zmieniamy `KitItemDetails`, `kit-format.ts` ani formularzy apteczki.
- Nie poprawiamy mieszanin o innym składzie pod jedną NPS (bluszcz + lukrecja, szczepy Lactobacillus). Na liście ogólników ląduje tylko `-`.
- Nie szukamy nowych kształtów ogólników wśród produktów bez substancji (pytanie 10, luka z researchu).
- Nie dodajemy przełącznika poziomu do formularzy apteczki ani do importu CSV.

## Implementation Approach

Kolejność to reguła → API → ekran. Każda warstwa jest kompatybilna wstecz: RPC bez `p_level` działa jak dziś, API bez `level` przyjmuje `exact`. Dzięki temu kod wdrożony przed `db push` nadal działa na starej bazie, a test w każdej fazie przypina tylko swoją warstwę. Teksty zależne od poziomu żyją w nowym module `src/lib/match-level.ts`, żeby zmiany w plikach współdzielonych z S-12 (`medicine-check-verdict.ts`, `MedicineCheckResult.tsx`) były jak najmniejsze.

## Critical Implementation Details

**Zależność od S-12 (`kit-quantity-semantics`) — do uzgodnienia z koordynatorem przed implementacją.** S-12 zmieni `src/lib/medicine-check-verdict.ts` (puste opakowanie nie liczy się do „Masz ten lek”, przeterminowane osobno), być może ciało `medicine_check` (pozycje z `quantity = 0`) oraz `MedicineCheckResult` i `KitItemDetails`. S-06 nie zakłada, że te pliki zostaną bez zmian:

- Parametr poziomu zmienia tylko CTE `matched` (warunek dopasowania i siła) oraz `order by` i echo `level`. Nie dotyka CTE `kit` ani filtrowania po ilości.
- Kto merguje drugi, bierze ciało `medicine_check` z migracji pierwszego i nakłada na nie swoją zmianę w nowej migracji (z późniejszym znacznikiem czasu). Jeśli S-12 zmieni RPC pierwsze, migracja S-06 robi `drop` + `create` na bazie jego ciała.
- W `checkVerdict` S-06 zmienia tylko teksty gałęzi `substance` i `none` (przez `match-level.ts`) oraz czyta `result.level`. Logika podziału `variants` / `same` należy do S-12.
- **Uzgodnione 2026-11-17 (koordynator, decyzja użytkownika):** S-12 merguje pierwszy. Zmienia TS w `medicine-check-verdict.ts` i `MedicineCheckResult.tsx` (sekcja „Puste opakowania”) i dodaje migrację samego komentarza kolumny `kit_items.quantity`, bez zmiany ciała `medicine_check`. S-06 startuje dopiero po merge S-12: rebase na main, sprawdzenie, czy znacznik migracji S-06 jest późniejszy niż migracja S-12 (w razie potrzeby nowy znacznik), dopiero potem `/10x-implement`. Zmiany fazy 2 i 3 w tych dwóch plikach nakładają się na kod S-12 po rebase.
- **Po rebase (2026-11-17, main `4f84c25`, PR #89):** migracja S-12 to `20261117120200_kit_quantity_comment.sql`, więc `20261118120000` jest później i nazwa zostaje. Ciało `medicine_check` bez zmian (bazą migracji S-06 zostaje `20261117120100_variant_key_btrim_medicine_check.sql`). `checkVerdict` pomija teraz pozycje z `quantity = 0`, a nowe `emptyPacks(result)` zasila sekcję „Puste opakowania” i dopisek w ogłoszeniu `sr-only`. Na poziomach luźnych puste opakowania leku o innym składzie też tam trafią, bez zastrzeżenia: sprawdzić w fazie 3 (test komponentu) i zdecydować, czy sekcja wymaga zastrzeżenia.
- Implementacja wymaga zgody koordynatora (`migration up`, `test:db`, `test:api`, serwer na 4333, `ui:shots` na wspólnej bazie).

**Wdrożenie migracji (kolejność z AGENTS.md: merge, potem `db push`).** Stara baza nie zna `p_level`, więc wywołanie RPC z tym argumentem dostałoby od PostgREST błąd „function not found”. Dlatego serwis pomija `p_level` dla `exact`, a parser przyjmuje brak `level` w odpowiedzi jako `exact`. Kod po merge działa na starej bazie na poziomie domyślnym. Poziomy luźne dają 500 tylko w oknie między merge a `db push`.

## Phase 1: Reguła w bazie

### Overview

Nowa definicja `medicine_check` z poziomem, `-` jako ogólnik, sortowanie po sile i echo poziomu. Testy reguły w `test:db`.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261118120000_medicine_check_match_level.sql` (znacznik późniejszy niż `20261117120100`; jeśli S-12 doda migrację wcześniej, nowszy od niej)

**Intent**: Dodać do reguły poziom dopasowania bez zmiany zachowania domyślnego i wykluczyć ogólnik `-`.

**Contract**:

- `drop function public.medicine_check(bigint)`, potem `create function public.medicine_check(p_product_id bigint, p_level text default 'exact') returns jsonb` (`stable`, `security invoker`, `search_path = ''`), `revoke execute … from public, anon`, `grant execute … to authenticated`, `comment on function`.
- `p_level` spoza `'exact' | 'all' | 'any'` → `raise exception` z `errcode = '22023'` (funkcja przechodzi na `plpgsql` albo sprawdza poziom w osobnym CTE z `case … else error`; wybór implementatora, ważne, że zła wartość nie daje cichego wyniku).
- Dla każdej drogi (`common_name`, `substances`), przy `cardinality(s.set) > 0`: `exact`: `kit_set = s_set`; `all`: `kit_set @> s_set`; `any`: `kit_set && s_set`.
- Siła pozycji: 0 wariant, 1 równy zbiór, 2 nadzbiór, 3 przecięcie. Bierzemy najmniejszą z dróg, które przeszły na danym poziomie. `matchedBy` to droga z najmniejszą siłą, a przy remisie `common_name` (jak dziś).
- `order by` siła rosnąco, potem `expires_on asc nulls last, created_at desc, id desc`. Na poziomie `exact` kolejność jest identyczna z dzisiejszą.
- Odpowiedź dostaje pole `'level', p_level`. Kształt pozycji bez zmian (`match` nadal `'variant' | 'substance'`).
- `create or replace function public.medicine_check_is_generic(text)`: lista dostaje wartość `'-'` (sygnatura bez zmian, więc uprawnienia zostają).
- Komentarz nagłówka: migracja czyta `kit_items`, więc nie należy do `REGISTRY_MIGRATIONS`. `medicine_check_is_generic` nie jest wołana przez importer.

#### 2. Testy reguły

**File**: `tests/db/medicine-check.test.ts`, `tests/db/medicine-check-fixtures.ts`

**Intent**: Przypiąć semantykę każdego poziomu na obu drogach i pułapki brzegowe.

**Contract**: `checkAs` dostaje opcjonalny poziom (brak = wywołanie bez `p_level`). Nowe przypadki:

- G14 (podzbiór / nadzbiór) dla każdego poziomu: nadzbiór pasuje od `all`, podzbiór i przecięcie tylko przy `any`.
- Droga NPS na każdym poziomie (części NPS ⊇ i ∩) przy niezwiązanych substancjach.
- Monotoniczność: na tych samych danych zbiór pozycji `exact` ⊆ `all` ⊆ `any`.
- Ogólnik w szukanym leku nie pasuje do niczego przy `all` i `any` (pułapka `@> '{}'`). NPS `-` nie pasuje na żadnym poziomie.
- Kolejność po sile (równy przed nadzbiorem przed przecięciem, mimo bliższego terminu słabszego) i `matchedBy` przy remisie.
- Echo `level` (także `exact` przy wywołaniu bez parametru) i błąd dla nieznanego poziomu.
- Każda odpowiedź dalej przechodzi przez `parseMedicineCheck` / `checkVerdict` (po fazie 2 z polem `level`).

#### 3. Dokumentacja reguł

**File**: `AGENTS.md`, `context/foundation/prd.md` (Business Logic)

**Intent**: Opisać kolejność wdrożenia i rollback migracji oraz regułę poziomów.

**Contract**: AGENTS.md, punkt „Supabase migrations”: merge, potem `db push`. Rollback to `drop function public.medicine_check(bigint, text)`, odtworzenie `medicine_check(bigint)` z `20261117120100_variant_key_btrim_medicine_check.sql` (z revoke/grant) i `medicine_check_is_generic` z `20261010120000_medicine_check.sql`. Opis `test:db` dostaje poziomy. PRD: trzy poziomy, obie drogi, monotoniczność, `-` jako ogólnik.

### Success Criteria:

#### Automated Verification:

- Migracja nakłada się na wspólną bazę: `npx supabase migration up` (po zgodzie koordynatora)
- Testy reguły przechodzą: `npm run test:db`
- Testy unit, komponentów i registry przechodzą bez zmian: `npm test`
- Lint i typy: `npm run lint`, `npx astro check`

#### Manual Verification:

- Na pełnym rejestrze: zapytanie tylko do odczytu dla 3 leków (jednoskładnikowy, złożony, z NPS `-`) daje liczby pozycji monotoniczne między poziomami

**Implementation Note**: Po fazie 1 i zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Phase 2: API i werdykt

### Overview

Parametr `level` w `GET /api/kit/check`, typy, parser odpowiedzi i teksty werdyktu dla każdego poziomu.

### Changes Required:

#### 1. Poziom i teksty

**File**: `src/lib/match-level.ts` (nowy), `src/types.ts`

**Intent**: Jedno źródło listy poziomów, domyślnego poziomu i tekstów zależnych od poziomu.

**Contract**: `type MatchLevel = "exact" | "all" | "any"` w `types.ts`. `MedicineCheckResponse` dostaje `level: MatchLevel`. Moduł eksportuje `MATCH_LEVELS`, `DEFAULT_MATCH_LEVEL = "exact"`, `isMatchLevel()` oraz dla każdego poziomu etykietę, tytuł `substance`, dopisek `none` i zastrzeżenie:

| Poziom  | Etykieta                      | Tytuł (substance)                        | Dopisek (none, comparable)            | Zastrzeżenie                                                                               |
| ------- | ----------------------------- | ---------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `exact` | Ten sam skład                 | Masz lek z tą samą substancją czynną     | Ani leku z tą samą substancją czynną  | Ten sam skład czynny nie oznacza, że leki można zamieniać. Zapytaj farmaceutę lub lekarza. |
| `all`   | Zawiera wszystkie składniki   | Masz lek zawierający składniki tego leku | Ani leku zawierającego jego składniki | Te leki mogą mieć inny skład. Nie zamieniaj ich bez porady farmaceuty lub lekarza.         |
| `any`   | Zawiera którykolwiek składnik | Masz lek ze wspólnym składnikiem         | Ani leku z żadnym z jego składników   | Te leki mogą mieć inny skład. Nie zamieniaj ich bez porady farmaceuty lub lekarza.         |

Teksty `exact` są dosłownie dzisiejsze.

#### 2. Endpoint i serwis

**File**: `src/pages/api/kit/check.ts`, `src/lib/services/medicine-check.ts`

**Intent**: Przyjąć poziom z zapytania i przekazać go do RPC.

**Contract**: `level` z `z.enum(MATCH_LEVELS)`. Brak parametru → `exact`, zła wartość → 400 `Invalid parameter level: expected one of exact, all, any` (bez zapisu i bez szczegółów błędu). `getMedicineCheck(supabase, productId, level)` wysyła `p_level` tylko dla poziomu innego niż `exact` (zgodność ze starą bazą, patrz Critical Implementation Details).

#### 3. Parser i werdykt

**File**: `src/lib/medicine-check-verdict.ts`

**Intent**: Odrzucić odpowiedź bez poprawnego poziomu i budować tytuł/dopisek z tekstów poziomu.

**Contract**: `parseMedicineCheck` przyjmuje brak `level` jako `exact` (odpowiedź starej bazy), a wartość spoza `MATCH_LEVELS` odrzuca (`null`). `checkVerdict` bierze tytuł `substance` i dopisek `none` z `match-level.ts` według `result.level`. Gałąź `variant` i podział `variants` / `same` bez zmian (należą do S-12). Komentarz o kolejności w `checkVerdict` i docstring `MedicineCheckResponse.items` w `types.ts` dostają kolejność po sile dopasowania.

#### 4. Testy

**File**: `src/lib/medicine-check-verdict.test.ts`, `tests/api/kit-input.test.ts`

**Intent**: Przypiąć teksty poziomów i walidację parametru.

**Contract**: unit: tytuł i dopisek dla każdego poziomu, `level` brakujący → `exact`, niepoprawny → `null`. API: `level` niepoprawny (`""`, `ALL`, `exact,all`) → 400 bez wycieku, każdy poprawny → 200 z echem, brak → 200 z `level: "exact"`, nadzbiór z apteczki pojawia się od `all` (dane brzegowe z rejestru, jak dziś).

### Success Criteria:

#### Automated Verification:

- Testy unit i komponentów przechodzą: `npm test`
- Testy API przechodzą: `npm run test:api` (serwer na 4333, po zgodzie koordynatora)
- Lint i typy: `npm run lint`, `npx astro check`

#### Manual Verification:

- `http://localhost:4333/api/kit/check?product=<id>&level=any` w zalogowanej przeglądarce zwraca `level: "any"` i więcej pozycji niż `level=exact` dla leku złożonego z apteczki testowej

**Implementation Note**: Po fazie 2 i zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Phase 3: Ekran

### Overview

Przełącznik poziomu na `/szukaj`, zapamiętanie w `localStorage`, poziom w zapytaniu sprawdzenia i zastrzeżenie dla każdego poziomu.

### Changes Required:

#### 1. Hook poziomu

**File**: `src/components/hooks/useMatchLevel.ts` (nowy)

**Intent**: Trzymać poziom w stanie i w `localStorage`.

**Contract**: `useMatchLevel(): [MatchLevel, (level: MatchLevel) => void]`. Klucz `mamlek:match-level`. Pierwszy render (SSR i hydratacja) zwraca `DEFAULT_MATCH_LEVEL`, a odczyt jest w `useEffect`. Wartość spoza `MATCH_LEVELS` albo błąd `localStorage` (tryb prywatny) daje domyślny poziom i nie wywala ekranu.

#### 2. Zapytanie sprawdzenia

**File**: `src/components/hooks/useMedicineCheck.ts`

**Intent**: Poziom jest częścią zapytania i klucza wyniku, żeby zmiana poziomu przerwała poprzednie zapytanie i nie pokazała starego werdyktu.

**Contract**: `useMedicineCheck(productId, level)`. URL `…?product=<id>&level=<level>`, a `key` / `requestKey` zawierają poziom. Odpowiedź z `result.level !== level` → stan `error`.

#### 3. Przełącznik i wynik

**File**: `src/components/registry/RegistrySearch.tsx`, `src/components/registry/MedicineCheckResult.tsx`

**Intent**: Pokazać poziom przy wyszukiwaniu i dopasować zastrzeżenie.

**Contract**: `RegistrySearch` renderuje pod polem wyszukiwania `RadioGroup` (`src/components/ui/radio-group.tsx`) z legendą „Dopasowanie składu” i trzema etykietami z `match-level.ts`. Na telefonie (390 px) jest pionowy. Przekazuje `level` do `MedicineCheckResult`. `MedicineCheckResult` przyjmuje `level` i bierze zastrzeżenie z `match-level.ts` zamiast stałej `CAUTION`, w bloku i w ogłoszeniu `sr-only`. Klasy tylko ról (`ui:scan`).

#### 4. Testy i zrzuty

**File**: `src/components/registry/RegistrySearch.test.tsx`, `src/components/registry/MedicineCheckResult.test.tsx`, `scripts/ui-shots.mjs`

**Intent**: Przypiąć brak nieaktualnego werdyktu przy zmianie poziomu, zapamiętanie i teksty.

**Contract**:

- `RegistrySearch`: domyślnie `exact` w URL zapytania. Zmiana poziomu wysyła nowe zapytanie, a wolna odpowiedź starego poziomu nie nadpisuje nowej (wzór `:216-326`). Poziom z `localStorage` jest użyty przy pierwszym sprawdzeniu, zły wpis daje `exact`.
- `MedicineCheckResult`: zastrzeżenie i ogłoszenie dla każdego poziomu.
- `ui:shots`: nowy stan `check-substance-any` (poziom luźny z pozycją).

### Success Criteria:

#### Automated Verification:

- Testy unit i komponentów przechodzą: `npm test`
- Skan wartości dosłownych czysty: `npm run ui:scan`
- Lint, typy, build: `npm run lint`, `npx astro check`, `npm run build`
- Zrzuty wszystkich stanów: `BASE_URL=http://localhost:4333 npm run ui:shots -- --label s06` (po zgodzie koordynatora)

#### Manual Verification:

- Na `http://localhost:4333/szukaj`: przełącznik widoczny, domyślnie „Ten sam skład”, zmiana poziomu przy wybranym leku złożonym zmienia werdykt i listę
- Wybrany poziom zostaje po przeładowaniu strony
- Na telefonie (390 px) przełącznik jest czytelny i nie rozpycha karty
- Czytnik ekranu (NVDA) ogłasza werdykt raz i w całości, z zastrzeżeniem poziomu (F2/F6 z impl-review `medicine-check`)

**Implementation Note**: Po fazie 3 i zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- `checkVerdict` / `parseMedicineCheck` dla każdego poziomu, brak `level` → `exact`
- `useMatchLevel`: zły wpis i niedostępny `localStorage`

### Integration Tests:

- `test:db`: semantyka poziomów na obu drogach, monotoniczność, ogólniki (`@> '{}'`, `-`), kolejność po sile, echo, zły poziom
- `test:api`: walidacja `level`, echo, nadzbiór od `all`
- E2E `tests/e2e/kit-item-check-verdict.spec.ts` przechodzi bez zmian (poziom domyślny)

### Manual Testing Steps:

1. Zaloguj się na `http://localhost:4333/auth/signin` kontem z lekiem złożonym w apteczce (np. „Panadol Femina”), przejdź na `http://localhost:4333/szukaj`.
2. Wyszukaj lek jednoskładnikowy z tą substancją (paracetamol): przy „Ten sam skład” „Nie masz…”, przy „Zawiera którykolwiek składnik” „Masz lek ze wspólnym składnikiem” i zastrzeżenie „mogą mieć inny skład”.
3. Przełącz poziom szybko kilka razy i sprawdź, że werdykt zawsze pasuje do zaznaczonego poziomu.
4. Przeładuj stronę i sprawdź, że poziom został.
5. Powtórz krok 2 z NVDA.

## Performance Considerations

Przy `any` RPC może zwrócić kilkadziesiąt pozycji, ale jest ograniczone apteczką jednego użytkownika (RLS), nie rejestrem. Operatory tablic działają na zbiorach liczonych dziś tak samo, więc koszt jest jak przy `=`. Lista wyszukiwania i worker się nie zmieniają.

## Migration Notes

- Lokalnie i na wspólnej bazie: `npx supabase migration up` (nie `db reset`), po zgodzie koordynatora.
- Produkcja: merge, potem `npx supabase db push`. Serwis nie wysyła `p_level` dla `exact`, więc do `db push` domyślny poziom działa na starej bazie.
- Rollback: `drop function public.medicine_check(bigint, text)`, odtworzenie `medicine_check(bigint)` z `20261117120100_variant_key_btrim_medicine_check.sql` wraz z `revoke`/`grant` oraz `medicine_check_is_generic` z `20261010120000_medicine_check.sql`.

## References

- Research: `context/changes/substance-match-level/research.md`
- Reguła dziś: `supabase/migrations/20261117120100_variant_key_btrim_medicine_check.sql:19-136`
- Ogólniki: `supabase/migrations/20261010120000_medicine_check.sql:37-56`
- Wcześniejszy plan reguły: `context/archive/2026-10-09-medicine-check/plan.md:62,95`
- Wzór drop + create z grantami: `supabase/migrations/20261116120000_withdrawn_medicine_in_kit.sql`
- Testy nieaktualnego werdyktu: `src/components/registry/RegistrySearch.test.tsx:216-326`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguła w bazie

#### Automated

- [x] 1.1 Migracja nakłada się na wspólną bazę: `npx supabase migration up` (po zgodzie koordynatora) — za zgodą użytkownika, tylko lokalnie; pierwsze `test:db` złapało kolizję aliasu `strength` z kolumną mocy (99 testów czerwonych), więc lokalny rollback według AGENTS.md, alias `match_strength` i ponowne `migration up` — bd0898c
- [x] 1.2 Testy reguły przechodzą: `npm run test:db` — 171/171; celowe zepsucie: wyłączenie nadzbioru i części wspólnej → 9 czerwonych, wyłączenie strażnika pustego zbioru → 16 czerwonych, po przywróceniu zielone — bd0898c
- [x] 1.3 Testy unit, komponentów i registry przechodzą bez zmian: `npm test` — 710/710 — bd0898c
- [x] 1.4 Lint i typy: `npm run lint`, `npx astro check` — bd0898c

#### Manual

- [x] 1.5 Na pełnym rejestrze: zapytanie tylko do odczytu dla 3 leków (jednoskładnikowy, złożony, z NPS `-`) daje liczby pozycji monotoniczne między poziomami — czeka na potwierdzenie użytkownika; wynik (20 354 produkty jako apteczka): Metafen 186 / 225 / 225, Cefalgin Migraplus 10 / 10 / 303, Zdrój (NPS `-`) 0 / 0 / 0. Powtórzone 2026-11-17 (agent, na prośbę użytkownika) w transakcji wycofanej na końcu, apteczka = jedno opakowanie każdego produktu (20 353), liczone z wariantem samego leku: Cefalgin Migraplus 11 / 11 / 304, Metafen (100145400) 16 / 16 / 498, Zdrój 1 / 1 / 1 (tylko on sam, `-` nic nie dopasowuje) — monotoniczne; `kit_items` = 99

### Phase 2: API i werdykt

#### Automated

- [x] 2.1 Testy unit i komponentów przechodzą: `npm test` — 725/725 — cae9dd0
- [ ] 2.2 Testy API przechodzą: `npm run test:api` (serwer na 4333, po zgodzie koordynatora) — lokalnie nie da się: wspólna baza ma pełny rejestr (20 354 produkty) zamiast fixture'ów v1, v1, v2, więc `loadBoundaryData` przerywa przed testami; import fixture'ów zmieniłby wspólny stan. Sprawdzi CI (`smoke`). Testy poziomu sprawdzają walidację i echo; dopasowanie nadzbioru zostaje w `test:db`, bo fixture'y nie mają pary nadzbioru
- [x] 2.3 Lint i typy: `npm run lint`, `npx astro check` — cae9dd0

#### Manual

- [x] 2.4 `http://localhost:4333/api/kit/check?product=<id>&level=any` w zalogowanej przeglądarce zwraca `level: "any"` i więcej pozycji niż `level=exact` dla leku złożonego z apteczki testowej — czeka na potwierdzenie użytkownika; skrypt z kontem tymczasowym (Cefalgin Migraplus w apteczce, szukany Apap): brak/`exact` 0 pozycji, `all` i `any` Cefalgin (`substance`/`common_name`), `ALL` 400; konto usunięte, `kit_items` = 99. W zalogowanej przeglądarce (Playwright, konto tymczasowe): `level=exact` 0 pozycji, `level=any` `level: "any"` i Cefalgin Migraplus

### Phase 3: Ekran

#### Automated

- [x] 3.1 Testy unit i komponentów przechodzą: `npm test` — 744/744 (unit + component + registry)
- [x] 3.2 Skan wartości dosłownych czysty: `npm run ui:scan` — 0 trafień w 14 plikach
- [x] 3.3 Lint, typy, build: `npm run lint`, `npx astro check`, `npm run build`
- [x] 3.4 Zrzuty wszystkich stanów: `BASE_URL=http://localhost:4333 npm run ui:shots -- --label s06` (po zgodzie koordynatora) — 38/38. Przełącznik zawsze pionowy: przy 1280 karta jest wąska i rząd łamał się 2 + 1. Konta tymczasowe `shots-*` usunięte. Odstępstwa od planu: (1) nagłówek „Także z tą samą substancją czynną” też zależy od poziomu (`alsoHeading` w `match-level.ts`), bo na poziomach luźnych byłby nieprawdziwy; (2) sekcja „Puste opakowania” zostaje bez zastrzeżenia także na poziomach luźnych, jak na `exact` od S-12: puste opakowanie to przypomnienie, nie zamiennik, a werdykt i jego zastrzeżenie go nie liczą; (3) `useMatchLevel` używa `useSyncExternalStore` zamiast `useEffect` (reguła `react-hooks/set-state-in-effect`), z tym samym kontraktem: serwer i hydratacja dają `exact`; przy odmowie `localStorage` przełącznik działa dla otwartej strony, a błąd idzie do `console.warn`

#### Manual

- [x] 3.5 Na `http://localhost:4333/szukaj`: przełącznik widoczny, domyślnie „Ten sam skład”, zmiana poziomu przy wybranym leku złożonym zmienia werdykt i listę — agent (Playwright, Cefalgin Migraplus w apteczce, wybrany Apap 500 mg): `exact` „Nie masz tego leku / Ani leku z tą samą substancją czynną”, po kliknięciu „Zawiera którykolwiek składnik” „Masz lek ze wspólnym składnikiem”, lista W apteczce: Cefalgin Migraplus; domyślny poziom na zrzutach `ui:shots`
- [x] 3.6 Wybrany poziom zostaje po przeładowaniu strony — agent: po przeładowaniu zaznaczone „Zawiera którykolwiek składnik”, `localStorage` = `any`
- [x] 3.7 Na telefonie (390 px) przełącznik jest czytelny i nie rozpycha karty — agent: `scrollWidth` 390 = szerokość okna, etykiety w jednej kolumnie, najdłuższa kończy się na 249 px
- [x] 3.8 Czytnik ekranu (NVDA) ogłasza werdykt raz i w całości, z zastrzeżeniem poziomu (F2/F6 z impl-review `medicine-check`) — agent sprawdził tylko DOM: region `status` werdyktu dostaje jeden tekst na poziom, na `any` w całości z zastrzeżeniem („Masz lek ze wspólnym składnikiem. Cefalgin Migraplus. Te leki mogą mieć inny skład. …”); czytnika ekranu nie użyto (NVDA nie jest zainstalowany); użytkownik 2026-11-17 uznał sprawdzenie DOM i testy komponentu ogłoszenia za wystarczające
