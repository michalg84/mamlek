# S-10: Formularz dodawania zapomina wybór po zmianie nazwy — Implementation Plan

## Overview

Po wyborze leku z podpowiedzi na `/apteczka` zmiana tekstu w polu „Lek” zostawia formularz poprzedniego leku, a „Dodaj do apteczki” dodaje ten poprzedni lek. Zerujemy wybór przy każdej edycji tekstu (jak na `/szukaj`) i robimy `onEdit` wymaganym w `MedicineSuggest`, żeby żaden kolejny użytkownik komponentu nie mógł go pominąć.

## Current State Analysis

Ramowanie: `context/changes/kit-add-form-reset-on-edit/frame.md` (pewność HIGH, początkowe ujęcie potwierdzone, błąd odtworzony na żywo 2026-10-29 trzema sposobami: inna nazwa, puste pole, skasowana litera).

- `KitAddForm` trzyma wybór w `variant` (`src/components/kit/KitAddForm.tsx:346`) i przekazuje do `MedicineSuggest` tylko `onSelect` (`:350`); `PackForm` renderuje się, gdy `variant` jest ustawiony (`:352`).
- `MedicineSuggest` wywołuje `onEdit?.()` w `handleChange` (`src/components/registry/MedicineSuggest.tsx:63`); prop jest opcjonalny (`:15`). `select()` nie woła `onEdit` (`:52-57`).
- `RegistrySearch` ma właściwy wzorzec: `onEdit={() => setSelected(null)}` (`src/components/registry/RegistrySearch.tsx:51-57`), naprawiony w commicie 3c974ae.
- `MedicineSuggest` mają dwaj użytkownicy: `KitAddForm` i `RegistrySearch`.
- `PackForm` ma `key={variant.id}` (`KitAddForm.tsx:352`), więc wybór innego leku z podpowiedzi już resetuje pola; brakuje tylko ścieżki edycji tekstu.
- Pakiety leku ładuje `useVariantPackages` z `GET /api/registry/packages?product=<id>` (`src/components/hooks/useVariantPackages.ts:36`).
- Brak testu `KitAddForm`. Istnieje wzorzec `src/components/registry/RegistrySearch.test.tsx` oraz pomocniki `tests/helpers/fetch.ts` (`stubRoutedFetch` zna tylko listę wyszukiwania i `/api/kit/check`, a każdy inny adres odrzuca jako „Unexpected fetch”) i `tests/helpers/fake-search-worker.ts`.

## Desired End State

Na `/apteczka` każda zmiana tekstu w polu „Lek” po wyborze leku usuwa formularz opakowania (wybrane opakowanie, ilość i datę ważności też). Przycisk „Dodaj do apteczki” znika razem z formularzem i nie idzie żadne `POST /api/kit`. Ponowny wybór z podpowiedzi pokazuje formularz wybranego leku. Pominięcie `onEdit` przy `<MedicineSuggest>` kończy się błędem `astro check`. Weryfikacja: nowy `KitAddForm.test.tsx` zielony i czerwony bez poprawki, `/ci-check` zielony.

### Key Discoveries:

- Pułapka z `test-plan.md` §6.3 dotyczy tego samego mechanizmu: scenariusz musi naprawdę zmieniać tekst (`fireEvent.change`), bo to wywołuje `onEdit`.
- `RegistrySearch.test.tsx` pokazuje cały wzorzec: `openSearch()` czeka na „Wpisz co najmniej 3 litery”, `search()` pisze i dostarcza odpowiedź workera, `pick()` klika opcję po tekście.
- Fixture `tests/fixtures/registry-search-list.ts` ma gotowe warianty (`ibuprom400`, `ibuprom200`, `ibupromMax400`), a opcje są rozpoznawane po tekście „nazwa+moc · postać”.

## What We're NOT Doing

- Test e2e w Playwright (decyzja: tylko test komponentu).
- Zachowywanie wpisanych pól, gdy tekst wraca do nazwy wybranego leku (decyzja: edycja zawsze zeruje wybór, nazwa nie identyfikuje wariantu).
- Zmiany w `RegistrySearch`, w API `POST /api/kit` ani w bazie.
- Zmiany reguł wyszukiwania i kolejności podpowiedzi (S-11).

## Implementation Approach

TDD: najpierw czerwony test odtwarzający kroki użytkownika, potem najmniejsza poprawka po stronie rodzica (`KitAddForm`), na końcu utwardzenie kontraktu komponentu współdzielonego. Fazy są sekwencyjne (faza 2 zmienia typ, który faza 1 już spełnia), więc bez równoległości.

## Phase 1: Test regresyjny i poprawka (TDD)

### Overview

Odtwarzamy błąd testem na prawdziwym `KitAddForm`, potwierdzamy, że bez poprawki jest czerwony, i naprawiamy.

### Changes Required:

#### 1. Pomocnik fetch dla pakietów

**File**: `tests/helpers/fetch.ts`

**Intent**: Test `KitAddForm` potrzebuje odpowiedzi na `GET /api/registry/packages?product=<id>` i możliwości sprawdzenia, że nie poszło `POST /api/kit`. Obecny `stubRoutedFetch` odrzuca każdy inny adres.

**Contract**: Dodać obsługę ścieżki `/api/registry/packages` do istniejącego routera (albo osobną funkcję w tym pliku o tym samym kształcie), z odpowiedzią podaną przez test per `productId` i listą wykonanych żądań. Nie zmieniać zachowania dla `/api/kit/check` ani dla listy; istniejące testy (`RegistrySearch.test.tsx`, `MedicineCheckResult.test.tsx`) muszą przechodzić bez zmian. `POST /api/kit` nadal zostaje odrzucone jako nieoczekiwane, a test sprawdza w `fetchMock.mock.calls`, że nie padło.

#### 2. Test komponentu

**File**: `src/components/kit/KitAddForm.test.tsx` (nowy)

**Intent**: Zapisać scenariusze błędu jako testy na prawdziwym `KitAddForm`, podmieniając tylko `fetch` i `Worker`, w stylu `RegistrySearch.test.tsx`.

**Contract**: Scenariusze (nazwy opisują zachowanie):

- po wyborze leku formularz pokazuje „Wybrano: <nazwa>” i przycisk „Dodaj do apteczki”;
- zmiana tekstu na inną nazwę usuwa „Wybrano: …” i przycisk;
- wyczyszczenie pola usuwa formularz;
- skasowanie jednej litery z nazwy usuwa formularz (ta sama nazwa nie przywraca go bez nowego wyboru);
- po edycji nie wykonano żadnego `POST /api/kit`;
- ponowny wybór z podpowiedzi pokazuje formularz wybranego leku, także innego wariantu niż poprzedni;
- ilość i data wpisane przed edycją nie wracają po ponownym wyborze.

Asercje dotyczą tylko tego, co wyrenderowane (tekst, role). Bez sleepów; odpowiedzi dostarczane w `await act(async …)`. Edycja tekstu musi być prawdziwą zmianą pola (`fireEvent.change`), nie wejściem przez ArrowDown (pułapka z `test-plan.md` §6.3).

#### 3. Poprawka

**File**: `src/components/kit/KitAddForm.tsx`

**Intent**: Edycja tekstu odrzuca bieżący wybór, więc formularz nie stoi pod inną nazwą niż pole.

**Contract**: `MedicineSuggest` dostaje `onEdit`, które ustawia `variant` na `null` (jak w `RegistrySearch.tsx:54-56`), z komentarzem uzasadniającym w stylu istniejącego. Bez innych zmian w `PackForm`.

### Success Criteria:

#### Automated Verification:

- Nowy test jest czerwony bez poprawki (uruchomić go przed krokiem 3) i zielony po niej: `npx vitest run --project component src/components/kit/KitAddForm.test.tsx`
- Istniejące testy komponentów przechodzą: `npx vitest run --project component`
- Lint przechodzi: `npm run lint`
- Sprawdzenie typów przechodzi: `npx astro sync && npx astro check`

#### Manual Verification:

- Na `http://localhost:4321/apteczka`: wybór leku, potem zmiana tekstu, wyczyszczenie pola i skasowanie litery usuwają formularz, a wybór z podpowiedzi go przywraca (kroki odtworzenia z frame; użytkownik decyduje, czy robi je sam, czy agent).

**Implementation Note**: Po automatycznych kontrolach zatrzymaj się na potwierdzenie ręczne przed fazą 2. Plik `.test.tsx` nie trafia do `src/pages/`.

---

## Phase 2: Wymagany `onEdit` w kontrakcie `MedicineSuggest`

### Overview

Pominięcie `onEdit` przestaje być możliwe bez błędu kompilacji.

### Changes Required:

#### 1. Kontrakt komponentu

**File**: `src/components/registry/MedicineSuggest.tsx`

**Intent**: Wymusić na każdym użytkowniku obsługę edycji, bo ta klasa błędu zdarzyła się już dwa razy (`RegistrySearch` do 2026-10-09, `KitAddForm` do tej zmiany).

**Contract**: `onEdit` w `MedicineSuggestProps` staje się wymagany (`onEdit: () => void`), a wywołanie w `handleChange` traci `?.`. Komentarz do propa zostaje. Obaj dotychczasowi użytkownicy już go przekazują po fazie 1.

### Success Criteria:

#### Automated Verification:

- Sprawdzenie typów przechodzi: `npx astro check`
- Dowód, że kontrakt działa: tymczasowo usunąć `onEdit` z `KitAddForm.tsx`, `npx astro check` zgłasza błąd brakującego propa, potem przywrócić i `npx astro check` znów przechodzi
- Testy przechodzą: `npx vitest run --project unit --project component --project registry`
- Lint przechodzi: `npm run lint`
- Pełna weryfikacja jak w CI: `/ci-check`

#### Manual Verification:

- Brak (zmiana tylko w typach; zachowanie sprawdzone w fazie 1).

---

## Testing Strategy

### Unit Tests:

- Jedna warstwa: test komponentu (`KitAddForm.test.tsx`), zgodnie z `test-plan.md` §6.3. Test „bez poprawki czerwony” jest dowodem, że łapie błąd.

### Integration Tests:

- Brak. E2E poza zakresem; `POST /api/kit` ma testy w `tests/api/` i nie jest zmieniane.

### Manual Testing Steps:

1. Uruchom serwer lokalny z zaimportowanym rejestrem, zaloguj się, wejdź na `http://localhost:4321/apteczka`.
2. Wybierz lek z podpowiedzi, potem zmień nazwę, wyczyść pole i skasuj literę: formularz ma znikać za każdym razem.
3. Wybierz lek ponownie z podpowiedzi: formularz wraca, pola puste.

## Performance Considerations

Brak: jedna dodatkowa aktualizacja stanu przy edycji tekstu.

## References

- Frame: `context/changes/kit-add-form-reset-on-edit/frame.md`
- Wzorzec poprawki: `src/components/registry/RegistrySearch.tsx:51-57`, commit 3c974ae
- Wzorzec testu: `src/components/registry/RegistrySearch.test.tsx`, `tests/helpers/fetch.ts`, `tests/helpers/fake-search-worker.ts`
- Reguły testów: `context/foundation/test-plan.md` §6.3, §6.6
- Roadmapa: S-10, issue #38

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Test regresyjny i poprawka (TDD)

#### Automated

- [x] 1.1 Nowy test jest czerwony bez poprawki i zielony po niej: `npx vitest run --project component src/components/kit/KitAddForm.test.tsx` — 9bdb111
- [x] 1.2 Istniejące testy komponentów przechodzą: `npx vitest run --project component` — 9bdb111
- [x] 1.3 Lint przechodzi: `npm run lint` — 9bdb111
- [x] 1.4 Sprawdzenie typów przechodzi: `npx astro sync && npx astro check` — 9bdb111

#### Manual

- [x] 1.5 Na `http://localhost:4321/apteczka` edycja, wyczyszczenie pola i skasowanie litery usuwają formularz, a wybór z podpowiedzi go przywraca — 9bdb111

### Phase 2: Wymagany `onEdit` w kontrakcie `MedicineSuggest`

#### Automated

- [x] 2.1 Sprawdzenie typów przechodzi: `npx astro check` — fbfac1d
- [x] 2.2 Usunięcie `onEdit` z `KitAddForm.tsx` powoduje błąd `astro check`; po przywróceniu przechodzi — fbfac1d
- [x] 2.3 Testy przechodzą: `npx vitest run --project unit --project component --project registry` — fbfac1d
- [x] 2.4 Lint przechodzi: `npm run lint` — fbfac1d
- [x] 2.5 Pełna weryfikacja jak w CI: `/ci-check` — fbfac1d
