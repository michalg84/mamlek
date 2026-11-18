# Ostrzeżenie o kończącej się dacie ważności — plan implementacji

## Overview

S-08 (FR-014): użytkownik widzi ostrzeżenie o zbliżającym się końcu ważności — razem z datą — na liście apteczki i przy wyniku sprawdzenia. Przy okazji rozstrzygamy otwarte pytanie z roadmapy: werdykt „Masz ten lek” przestaje być zielony, gdy wszystkie pasujące opakowania leku są przeterminowane. Zmiana jest wyłącznie po stronie klienta (logika w `src/lib/`, widoki React); baza, RPC i API zostają bez zmian.

## Current State Analysis

- Data ważności jest zapisywana z dokładnością do miesiąca jako ostatni dzień miesiąca (`expiryToDate`, `src/lib/kit-format.ts:192`; wszystkie trzy ścieżki API ustawiają `expiry_precision: "month"`). Precyzja `day` istnieje w typie i bazie, ale dziś nikt jej nie zapisuje.
- Jedyne oznaczenie daty to „· przeterminowany” w `KitItemDetails` (`src/components/kit/KitItemDetails.tsx:41-44`), na podstawie `isExpired` (`src/lib/kit-format.ts:230-232`). Ten komponent opisuje pozycję i na liście apteczki, i w wyniku sprawdzenia.
- `today` (YYYY-MM-DD) jest już dostępne w obu widokach: lista — z serwera (`src/pages/apteczka.astro:115`), po hydracji z przeglądarki (`src/components/kit/KitList.tsx:344-352`); wynik sprawdzenia — `todayIso()` w przeglądarce (`src/components/registry/MedicineCheckResult.tsx:115`).
- `checkVerdict` (`src/lib/medicine-check-verdict.ts:87-115`) nie patrzy na datę; pomija tylko puste opakowania (S-12). Kolor werdyktu wynika z `kind` (`MedicineCheckResult.tsx:23-27`), live region ogłasza tytuł, szczegół, notki i liczbę pustych opakowań (`:117-121`).
- RPC sortuje pozycje po sile dopasowania, potem po najbliższej dacie ważności (`supabase/migrations/20261118120000_medicine_check_match_level.sql:198`), więc przeterminowane trafiają na początek grupy.
- `checkVerdict` wywołują: `MedicineCheckResult.tsx:110`, testy unit (`src/lib/medicine-check-verdict.test.ts`) i testy bazy (`tests/db/medicine-check.test.ts:875, 897, 911, 1058`, `tests/db/variant-key.test.ts:138-139, 146, 177`). Fikstury bazy mają daty z przeszłości (np. `2020-01-31`, `tests/db/medicine-check.test.ts:218`).
- `scripts/ui-shots.mjs` ma stany `check-*` z odpowiedziami na sztywno; domyślna pozycja `checkItem` ma `expiresOn: "2026-03-31"` (`:160`), czyli dziś jest już przeterminowana.

## Desired End State

- Wiersz pozycji (lista i wynik sprawdzenia) pokazuje przy dacie „· kończy się ważność”, gdy miesiąc ważności to bieżący albo następny miesiąc (dziś, 18.11.2026: 11/2026 i 12/2026); „· przeterminowany” jak dotąd; nieznana data — bez oznaczenia.
- Lista `/apteczka` ma nad listą podsumowanie, gdy jest co zgłosić, np. „Kończy się ważność: 2 opakowania · Przeterminowane: 1 opakowanie”; liczby zmieniają się po edycji daty i usunięciu pozycji.
- Wynik sprawdzenia:
  - wszystkie niepuste opakowania tego leku przeterminowane → czerwony werdykt „Masz ten lek, ale przeterminowany”, szczegół „Termin ważności minął: MM/RRRR” (najpóźniejsza data wśród nich);
  - przypadek mieszany → zielone „Masz ten lek · N”, gdzie N liczy tylko ważne (niepuste, nieprzeterminowane); przeterminowane zostają w sekcji „W apteczce”, na jej końcu;
  - wszystkie liczone (ważne) opakowania tego leku kończą się w progu → zielony werdykt, szczegół „Ważność kończy się MM/RRRR” (najpóźniejsza data wśród nich);
  - werdykt substancji: tytuł i kolor bez zmian; szczegół (nazwy leków) dostaje „ · wszystkie przeterminowane”, gdy wszystkie niepuste opakowania z tą substancją są przeterminowane, albo „ · ważność kończy się MM/RRRR”, gdy wszystkie są ważne i w progu;
  - czytnik ekranu: szczegół werdyktu jest już ogłaszany; dodatkowo zdanie „Przeterminowane opakowania w apteczce: N”, gdy N > 0 (wzorem pustych opakowań).
- Weryfikacja: testy unit i komponentów zielone, `test:db` zielony ze stałą datą, nowe stany w `ui:shots`, testy ręczne na `http://localhost:4331`.

### Key Discoveries:

- Jeden komponent `KitItemDetails` daje ostrzeżenie w obu miejscach naraz (`src/components/kit/KitItemDetails.tsx:22`).
- Precedens S-12: puste opakowania wyjęte z werdyktu, osobna sekcja i zdanie dla czytnika (`src/lib/medicine-check-verdict.ts:76-85`, `MedicineCheckResult.tsx:45-64`).
- Brak tokenu `--destructive-foreground` (`src/styles/global.css:23, 62`); werdykty `success`/`warning` to jasne tło z ciemnym tekstem. Czerwony werdykt: `bg-destructive/10 text-destructive` — bez edycji `global.css` (plik współdzielony z S-15).
- `packCount` (odmiana „opakowanie/opakowania/opakowań”) jest prywatne w `medicine-check-verdict.ts:62-73`; podsumowanie listy potrzebuje tej samej odmiany.

## What We're NOT Doing

- Zmian w bazie, RPC `medicine_check`, API i zapisie daty (precyzja dzienna to osobna luka F2).
- Powiadomień poza aplikacją (e-mail, push).
- Zmiany kolejności listy apteczki (zostaje „najnowsze pierwsze”) i filtrowania po dacie.
- Osobnego tytułu dla werdyktu substancji z przeterminowanymi (tylko dopisek w szczególe).
- Wyjmowania przeterminowanych z sekcji „W apteczce” do osobnej sekcji (zostają w niej, na końcu).
- Edycji `global.css`, `Layout.astro`, `scripts/ui-scan.mjs`, `AGENTS.md` (pliki współdzielone z S-15).

## Implementation Approach

Najpierw czysta reguła z testami (faza 1), potem widoki z testami komponentów (faza 2), na końcu weryfikacja na zrzutach, bazie i ręcznie (faza 3). Fazy są zależne (widok używa reguły), więc idą po kolei. Próg liczymy w miesiącach kalendarzowych, bo tak użytkownik widzi datę: opakowanie „kończy się”, gdy nie jest przeterminowane, a `YYYY-MM` jego daty ≤ następny miesiąc względem `today` (z przejściem przez rok: 12/2026 → 01/2027). Ta sama reguła działa dla precyzji dziennej (patrzy na miesiąc daty).

## Critical Implementation Details

- **Kolejność w `checkVerdict`**: najpierw odrzucić puste (S-12), potem podzielić niepuste na ważne i przeterminowane. „Wszystkie przeterminowane” znaczy: co najmniej jedno niepuste opakowanie w grupie i żadne ważne. Opakowanie z nieznaną datą jest ważne i nie „kończy się”, więc wyłącza dopisek „ważność kończy się”.
- **Stała data w `tests/db`**: testy bazy sprawdzają regułę RPC, nie datę; przekazują `checkVerdict(result, BEFORE_ANY_EXPIRY)` z datą wcześniejszą niż każda fikstura (np. `"2000-01-01"`), żeby wynik nie zależał od dnia uruchomienia.
- **Istniejące testy a zegar**: fabryki pozycji w `MedicineCheckResult.test.tsx` i `RegistrySearch.test.tsx` mają `expiresOn: null` (zegar prawdziwy, ale data nieznana nie zmienia werdyktu), a `KitList.test.tsx` / `KitItemEdit.test.tsx` udają `Date` (listopad 2026) z datami 12/2027 — dokładne dopasowania „Ważny do: 12/2027” zostają. Nowe testy z datami muszą udawać `Date` (`vi.setSystemTime`), nigdy nie polegać na dniu uruchomienia; w teście „marks an expired pack and leaves a valid one unmarked” pozycja `2026-11-30` przy `today` 2026-11-04 staje się „kończy się” — asercja (brak „przeterminowany”) dalej trzyma, ale nazwa/zakres testu do przejrzenia.
- **Testy ręczne z datą z przeszłości** są wykonalne z UI: formularz dodawania i edycji oferuje lata od 5 wstecz (`src/components/kit/kit-fields.tsx:134-135`), a zod przyjmuje rok ≥ 2000 (`src/lib/kit-request.ts:20`) — bez wstawiania do bazy.

## Phase 1: Reguła daty i werdyktu (TDD)

### Overview

Czyste funkcje stanu daty i nowa reguła werdyktu, z testami unit pisanymi przed kodem.

### Changes Required:

#### 1. Stan daty ważności

**File**: `src/lib/kit-format.ts`

**Intent**: Dodać jedną funkcję zwracającą stan daty opakowania względem `today` oraz przenieść tu odmianę liczby opakowań, żeby użyły jej i werdykt, i podsumowanie listy.

**Contract**: `expiryStatus(expiresOn: string | null, today: string): "expired" | "expiring" | "valid" | "unknown"` — `expired` = `isExpired`; `expiring` = nieprzeterminowane i miesiąc daty ≤ następny miesiąc po `today`; `unknown` dla `null`. `isExpired` zostaje (używa go reszta kodu). `packCount(count: number): string` eksportowane stąd (przeniesione z `medicine-check-verdict.ts`, bez zmiany wyniku).

#### 2. Testy stanu daty

**File**: `src/lib/kit-format.test.ts`

**Intent**: Przypadki brzegowe progu: ostatni dzień bieżącego miesiąca, następny miesiąc, miesiąc po nim, przejście grudzień → styczeń, wczoraj (przeterminowany), dziś = data (ważny, kończy się), `null`, precyzja dzienna w progu; odmiana `packCount` (1, 2, 5, 12, 22).

**Contract**: projekt `unit` Vitest.

#### 3. Reguła werdyktu

**File**: `src/lib/medicine-check-verdict.ts`

**Intent**: `checkVerdict` dostaje `today` i rozróżnia ważne, przeterminowane i kończące się opakowania zgodnie z „Desired End State”; dodać funkcję zwracającą przeterminowane niepuste pozycje (dla zdania czytnika).

**Contract**: `checkVerdict(result: MedicineCheckResponse, today: string): CheckVerdict`; `CheckVerdict["kind"]` dostaje wartość `"expired"`; `variants` / `same` zawierają wszystkie niepuste pozycje grupy, ważne przed przeterminowanymi (kolejność RPC zachowana wewnątrz obu części); `expiredPacks(result, today): MedicineCheckItem[]` (niepuste, przeterminowane, kolejność RPC). Teksty: tytuł `"Masz ten lek, ale przeterminowany"`, szczegóły `"Termin ważności minął: MM/RRRR"`, `"Ważność kończy się MM/RRRR"`, dopiski substancji `" · wszystkie przeterminowane"` / `" · ważność kończy się MM/RRRR"` (data przez `formatExpiry` z precyzją pozycji, najpóźniejsza w grupie).

#### 4. Testy werdyktu

**File**: `src/lib/medicine-check-verdict.test.ts`

**Intent**: Dopisać przypadki: wszystkie warianty przeterminowane (kind `expired`, szczegół z najpóźniejszą datą), mieszany (licznik tylko ważnych, przeterminowane na końcu `variants`), wszystkie ważne w progu (szczegół), jedno z nieznaną datą (bez szczegółu), przeterminowane warianty + ważna substancja (kind `expired`, `same` niepuste), substancja wszystkie przeterminowane / wszystkie w progu / mieszana, puste + przeterminowane (puste nie liczą się nigdzie), `expiredPacks`. Istniejące wywołania dostają stałe `today`.

**Contract**: projekt `unit`.

#### 5. Wywołania w testach bazy

**File**: `tests/db/medicine-check.test.ts`, `tests/db/variant-key.test.ts`

**Intent**: Przekazać stałą datę wcześniejszą niż każda fikstura, żeby testy reguły RPC nie zależały od dnia.

**Contract**: `checkVerdict(result, BEFORE_ANY_EXPIRY)`; stała w `tests/db/medicine-check-fixtures.ts`.

#### 6. Tymczasowe dopasowanie wywołania w widoku

**File**: `src/components/registry/MedicineCheckResult.tsx`

**Intent**: Przekazać `today` do `checkVerdict` i obsłużyć `kind: "expired"` w `VERDICT_STYLE`, żeby faza kończyła się zielonym `astro check`; pełny widok w fazie 2.

**Contract**: `VERDICT_STYLE.expired = { icon: CircleAlert (lub podobna), className: "bg-destructive/10 text-destructive" }`.

### Success Criteria:

#### Automated Verification:

- Nowe testy unit najpierw czerwone, po implementacji zielone: `npx vitest run --project unit`
- Lint czysty: `npm run lint`
- Typy: `npx astro check`

**Implementation Note**: po zielonych bramkach przejść do fazy 2 bez czekania na test ręczny (brak kroków ręcznych).

---

## Phase 2: Ostrzeżenie w widokach (TDD komponentów)

### Overview

Oznaczenie „kończy się ważność” w wierszu, nowy werdykt i zdanie czytnika w wyniku sprawdzenia, podsumowanie nad listą apteczki.

### Changes Required:

#### 1. Wiersz pozycji

**File**: `src/components/kit/KitItemDetails.tsx`

**Intent**: Przy dacie pokazać „· kończy się ważność” dla stanu `expiring`, obok istniejącego „· przeterminowany”.

**Contract**: używa `expiryStatus`; klasa oznaczenia `text-warning-foreground font-medium` (role class, bez nowych tokenów).

#### 2. Wynik sprawdzenia

**File**: `src/components/registry/MedicineCheckResult.tsx`

**Intent**: Czerwony werdykt dla `expired`, zdanie „Przeterminowane opakowania w apteczce: N” w live regionie (po zdaniu o pustych), lista sekcji z kolejności z `checkVerdict`.

**Contract**: live region: `[werdykt…, emptyPacksAnnouncement, expiredPacksAnnouncement]`; `today` liczone raz i przekazane do `checkVerdict`, `expiredPacks` i `ItemList`.

#### 3. Podsumowanie listy apteczki

**File**: `src/components/kit/KitList.tsx`

**Intent**: Nad listą akapit z liczbą opakowań kończących się i przeterminowanych (liczonych po dacie, także puste), tylko gdy któraś liczba > 0; wyliczany z `items` i `today`, więc zmienia się po edycji i usunięciu.

**Contract**: tekst `"Kończy się ważność: {packCount(n)}"` i `"Przeterminowane: {packCount(m)}"`, łączone `" · "`, pomijana część z zerem; zwykły `<p>` (nie live region), w tym samym kontenerze co `<ul>`; brak przy pustej apteczce.

#### 4. Testy komponentów

**Files**: `src/components/kit/KitList.test.tsx`, `src/components/kit/KitItemDetails.test.tsx` (jeśli brak — w `KitList.test.tsx`), `src/components/registry/MedicineCheckResult.test.tsx`

**Intent**: Z udawanym `Date`: oznaczenie „kończy się ważność” tylko dla bieżącego i następnego miesiąca; podsumowanie (oba liczniki, jeden, brak; zmiana po usunięciu i po edycji daty); wynik sprawdzenia — czerwony werdykt i jego tekst, licznik mieszany, szczegół „Ważność kończy się”, dopisek substancji, zdanie czytnika z liczbą przeterminowanych, kolejność wierszy (przeterminowane na końcu).

**Contract**: projekt `component` (jsdom, tylko `fetch` / `Worker` zastąpione).

### Success Criteria:

#### Automated Verification:

- Testy komponentów najpierw czerwone, potem zielone: `npx vitest run --project component`
- Pełny zestaw CI: `npx vitest run --project unit --project component --project registry`
- Lint i skan UI: `npm run lint`, `npm run ui:scan`
- Typy: `npx astro check`

**Implementation Note**: po zielonych bramkach przejść do fazy 3.

---

## Phase 3: Weryfikacja na zrzutach, bazie i ręcznie

### Overview

Stany zrzutów dla nowych werdyktów, przebieg testów bazy i testy ręczne użytkownika.

### Changes Required:

#### 1. Stany zrzutów

**File**: `scripts/ui-shots.mjs`

**Intent**: Daty odpowiedzi `check-*` liczone względem dnia uruchomienia (żeby stany nie zmieniały się z upływem czasu) i nowe stany: `check-expired` (wszystkie warianty przeterminowane) oraz `check-have-expiring` (wszystkie ważne w progu). `check-have` zostaje przypadkiem mieszanym.

**Contract**: tablica `STATES` (nie `GUARDED` w `ui-scan.mjs`, który jest plikiem S-15).

### Success Criteria:

#### Automated Verification:

- Testy bazy zielone (lokalna baza, za zgodą koordynatora): `npm run test:db`
- ci-check zielony: `/ci-check`
- Zrzuty wszystkich stanów (serwer na :4331, za zgodą koordynatora na bazę): `BASE_URL=http://localhost:4331 npm run ui:shots -- --label s08`

#### Manual Verification:

- `http://localhost:4331/apteczka`: pozycja z datą w bieżącym lub następnym miesiącu ma „· kończy się ważność”, starsza „· przeterminowany”, dalsza bez oznaczenia; podsumowanie nad listą zgadza się i zmienia po edycji daty oraz usunięciu pozycji.
- `http://localhost:4331/szukaj`: sprawdzenie leku z samymi przeterminowanymi opakowaniami daje czerwone „Masz ten lek, ale przeterminowany”; mieszany — zielone z licznikiem ważnych; kontrast czerwonego werdyktu czytelny w jasnym motywie.
- Czytnik ekranu (opcjonalnie): po wyniku słychać szczegół werdyktu i liczbę przeterminowanych.

**Implementation Note**: po automatycznej weryfikacji zatrzymać się i zapytać użytkownika, które testy ręczne wykonuje sam, a które ja.

---

## Testing Strategy

### Unit Tests:

- `expiryStatus`: granice miesiąca, przejście roku, `null`, precyzja dzienna.
- `checkVerdict`: wszystkie kombinacje ważne / przeterminowane / kończące się / puste / nieznana data w obu grupach.

### Integration Tests:

- `npm run test:db`: reguła RPC bez zmian, werdykt liczony ze stałą datą.
- Komponenty: `KitList`, `MedicineCheckResult` z udawanym `Date`.

### Manual Testing Steps:

1. Dodać w `/apteczka` trzy opakowania: data w bieżącym miesiącu, data sprzed roku, data za rok; sprawdzić oznaczenia i podsumowanie.
2. Zmienić datę jednej pozycji i usunąć inną; podsumowanie się aktualizuje.
3. W `/szukaj` sprawdzić lek, którego wszystkie opakowania są przeterminowane, potem dodać ważne opakowanie i sprawdzić ponownie.

## Performance Considerations

Brak: obliczenia na kilkudziesięciu pozycjach w przeglądarce, bez nowych zapytań.

## Migration Notes

Brak migracji; wdrożenie przez merge (Cloudflare), rollback przez revert.

## References

- Research: `context/changes/expiry-warning/research.md`
- Precedens pustych opakowań: `context/archive/2026-11-17-kit-quantity-semantics/plan.md`
- F4 z `context/archive/2026-10-09-medicine-check/reviews/impl-review.md:82-100`, F10 z `context/audits/prd-conformance/2026-11-16.md:177-190`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguła daty i werdyktu (TDD)

#### Automated

- [x] 1.1 Nowe testy unit najpierw czerwone, po implementacji zielone — e24f2ac
- [x] 1.2 Lint czysty — e24f2ac
- [x] 1.3 Typy — e24f2ac

### Phase 2: Ostrzeżenie w widokach (TDD komponentów)

#### Automated

- [x] 2.1 Testy komponentów najpierw czerwone, potem zielone — 5c194c9
- [x] 2.2 Pełny zestaw CI — 5c194c9
- [x] 2.3 Lint i skan UI — 5c194c9
- [x] 2.4 Typy — 5c194c9

### Phase 3: Weryfikacja na zrzutach, bazie i ręcznie

#### Automated

- [x] 3.1 Testy bazy zielone — dc3f6f8
- [x] 3.2 ci-check zielony — dc3f6f8
- [x] 3.3 Zrzuty wszystkich stanów — dc3f6f8

#### Manual

- [x] 3.4 /apteczka: oznaczenia i podsumowanie — dc3f6f8
- [x] 3.5 /szukaj: czerwony werdykt, przypadek mieszany, kontrast — dc3f6f8
- [ ] 3.6 Czytnik ekranu (opcjonalnie)
