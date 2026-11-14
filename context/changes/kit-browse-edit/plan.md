# Przegląd i edycja apteczki (S-05) Implementation Plan

## Overview

Ekran `/apteczka` dziś tylko pokazuje listę. Ten plan dodaje edycję i usuwanie pozycji oraz poprawianie pozostałej ilości wprost na liście (FR-005, roadmap S-05). Edycja obejmuje też zmianę opakowania na inne opakowanie tego samego leku (wariantu). Lista dostaje znacznik „przeterminowany”, taki sam jak w wyniku sprawdzenia (S-03), a `kit_items.updated_at` zaczyna odpowiadać ostatniej zmianie (F6).

## Current State Analysis

- Lista jest renderowana w całości na serwerze w `src/pages/apteczka.astro:110-138`. Nie ma na niej żadnej akcji ani znacznika przeterminowania, a pusty stan to „Apteczka jest pusta” (`:114-115`).
- `listKitItems` (`src/lib/services/kit.ts`) nie ma limitu i zwraca też pozycje wycofane (flaga `withdrawn`). `KitItem` (`src/types.ts`) nie ma `productId`, więc z listy nie da się wczytać opakowań wariantu.
- Pakiety czytają `getPackage` / `getPackages`, które zwracają `null` dla opakowania wycofanego. To pułapka: limit ilości dla edycji pozycji na wycofanym opakowaniu trzeba czytać bez filtra `removed_at`.
- `registry_variant_packages(p_product_id)` (`supabase/migrations/20261007120000_kit_items.sql:89-121`) czyta klucz wariantu z produktu bez filtra `removed_at` i zwraca aktywne opakowania aktywnych produktów wariantu. Działa więc także dla pozycji wycofanego produktu.
- Polityki RLS update i delete już są (`20261007120000_kit_items.sql:56-67`). Nie ma triggera `updated_at` (F6). Strażnik `tests/db/kit-access.test.ts:236-255` wymaga, żeby żadna funkcja w `public` nie była `security definer`.
- Wzorzec trasy z `POST /api/kit` (`src/pages/api/kit/index.ts`): lokalny `json()` z `Cache-Control: no-store`, kolejność 503 → 401 → 415 → 400 JSON → 400 zod → 400 biznesowe, `console.error` i ogólne 500. Schemat żądania jest w `src/lib/kit-request.ts` (`kitItemRequest`, strict).
- supabase-js: `.update()` i `.delete()`, które nie trafiły w żaden wiersz, nie zwracają błędu. Z `.select()` wynik to `[]`, co trasa zamienia na 404. Przy włączonym RLS cudzy wiersz jest niewidoczny, więc też daje `[]`.
- Astro `checkOrigin` jest domyślnie włączone. DELETE z innym `Origin` dostaje 403, zanim dotrze do trasy.
- Testy:
  - `tests/api/helpers.ts`: `sendJson` ma na sztywno `POST` (`:66-73`), a `kitRowsById` (`:204-215`) nie zwraca `expires_on` ani `expiry_precision`.
  - Każdy przebieg `test:api` zakłada 4 konta. Lokalny limit to 30 rejestracji i logowań na 5 minut.
  - `stubRoutedFetch` (`tests/helpers/fetch.ts:59-119`) odrzuca każdą nieznaną trasę.
- `scripts/smoke.mjs:215-219` sprawdza w HTML `/apteczka` napis „nieznane” i nazwę leku. Dodana pozycja nie ma ilości ani daty.
- PR #62 jest zmergowany (2026-11-04, `main@33b16d2`). `uniquePacks` łączy teraz opakowania po `(productId, label)`, ale nadal może schować GTIN pozycji pod rodzeństwem o tej samej etykiecie.

## Desired End State

Na `http://localhost:4321/apteczka` każda pozycja pokazuje te same szczegóły co wynik sprawdzenia, wspólnym komponentem. Są w nich znaczniki „przeterminowany”, „puste” i „wycofany z rejestru”.

Każdy wiersz ma:

- pole ilości z przyciskiem „Zapisz”, który pokazuje się po zmianie;
- przycisk „Edytuj”, który otwiera panel z wyborem opakowania wariantu, ilością i datą ważności (z „Wyczyść”);
- przycisk „Usuń” z oknem potwierdzenia.

Przy ilości 0 wiersz pokazuje „Opakowanie puste” z propozycją usunięcia. Zmiany idą przez `PATCH /api/kit/[id]` i `DELETE /api/kit/[id]`. Wiersz aktualizuje się z odpowiedzi serwera.

Cudza pozycja daje 404, a każdy błąd jest po polsku. Trigger utrzymuje `updated_at`. Weryfikacja: `npm test`, `npm run test:db`, `npm run test:api`, `npm run smoke` i kontrole ręczne z faz 2–4.

### Key Discoveries:

- `src/pages/api/kit/index.ts`: wzorzec trasy, kolejność kodów i log błędu, który powtarzamy w `[id].ts`.
- `src/lib/kit-request.ts`: `kitItemRequest`, z którego wyprowadzamy schemat PATCH. Kontrakt „brak klucza = bez zmian, `null` = wyczyść” jest nowy, bo POST zamienia brak na `null`.
- `supabase/migrations/20261007120000_kit_items.sql:82-121`: `registry_variant_packages` daje sprawdzenie „to samo opakowanie wariantu” bez nowego SQL.
- `src/components/kit/KitAddForm.tsx`: pola ilości (sufiks „z N jedn.”, polskie komunikaty), wybór daty (dwa natywne selecty w `role="group"`) i `RadioGroup` opakowań do współdzielenia. Złego wzorca pokazywania serwerowego `payload.error` nie powtarzamy.
- `src/components/registry/MedicineCheckResult.tsx:30-55`: `ItemList` z prawie tym samym wierszem i znacznikiem `isExpired`. Staje się konsumentem wspólnego `KitItemDetails`.
- `tests/api/helpers.ts:151-185`: `loadBoundaryData` wybiera dane graniczne zapytaniami. Fixture v2 ma wariant z dwoma aktywnymi opakowaniami różnej wielkości (Smecta 10 i 30 sasz.), więc zmiana opakowania z innym limitem jest testowalna w CI.

## What We're NOT Doing

- **Semantyka ilości z S-12** (opakowania zamiast jednostek, jednostka „opakowanie”). Decyzja: S-05 teraz, S-12 potem. S-12 zmieni pole ilości w obu miejscach.
- **Zmiana samego leku w pozycji.** Edycja zmienia tylko opakowanie w obrębie wariantu. Inny lek to usunięcie i dodanie.
- **Precyzja dzienna daty w edycji.** API przyjmuje tylko miesiąc i rok. Pozycja z precyzją dzienną zachowuje ją, dopóki użytkownik nie zmieni daty.
- **Limit lub stronicowanie listy (F4).** Apteczki domowe są małe, a duże konto spowalnia tylko własną stronę.
- **Zmiana reguły `medicine_check` dla ilości 0.** Puste opakowanie nadal liczy się jako „masz już”. Propozycja usunięcia to rozwiązanie po stronie listy.
- **Cofnięcie usunięcia (undo)**: wystarcza okno potwierdzenia.
- **Ostrzeżenie o zbliżającym się końcu ważności (S-08).** Tylko znacznik „przeterminowany”.
- **Nowy test Playwright.** Ścieżki pokrywają testy komponentów, `test:api` i smoke. `tests/e2e/helpers/kit-db.ts` zostaje przy sprzątaniu SQL-em.
- **Edycja na ekranie importu** (`KitImportRow.tsx` bez zmian).
- **Blokada równoległych PATCH tej samej pozycji (znana luka, impl-review F9).** Dwa równoległe PATCH tego samego konta (zmiana opakowania i zmiana ilości) mogą zapisać ilość większą niż nowe opakowanie, bo limit jest sprawdzany przed zapisem, a baza nie ma na to ograniczenia. Dotyczy tylko własnych danych użytkownika; UI blokuje ten przypadek (przyciski wiersza są zablokowane na czas zapisu ilości).

## Implementation Approach

Backend i widok listy dzielą tylko typ `KitItem`. **Fazy 1 i 2 można wykonać równolegle** po jednym małym kroku wspólnym: najpierw ląduje osobny commit z punktem 3 fazy 1 (`KitItem.productId` i `registry_packages.product_id` w selekcie `listKitItems`). Dopiero potem praca się rozwidla, a dane testowe fazy 2 mają już `productId`. Faza 1 zmienia potem migrację, serwis, trasę `[id].ts`, testy API i bazy oraz smoke. Faza 2 zmienia `apteczka.astro`, nowe komponenty listy i `MedicineCheckResult`. Fazy 3 i 4 dokładają akcje do wyspy i zależą od obu.

Zmiany są pesymistyczne: wiersz czeka na odpowiedź serwera i podmienia się na zwrócony `KitItem`, więc zawsze pokazuje to, co zapisano. Lista zostaje renderowana na serwerze jako wyspa `client:load`. Leki są w HTML od pierwszego bajtu, a smoke i brak JS nadal działają do odczytu.

## Critical Implementation Details

- **Brak klucza a `null` w PATCH.** Zapis samej ilości wysyła `{ quantity }`. Gdyby PATCH wypełniał brakujące pola jak POST, wyczyściłby datę ważności. Pole nieobecne zostaje, `null` czyści, puste body to 400. Panel „Edytuj” wysyła tylko pola, które użytkownik zmienił.
- **Limit ilości i wycofane opakowania.**
  - Bez zmiany opakowania limit liczy się z `units` zapisanego opakowania czytanego bez filtra `removed_at`, nie przez `getPackage`. Inaczej pozycji na wycofanym opakowaniu nie da się poprawić.
  - Przy zmianie opakowania liczy się limit nowego opakowania. Gdy ilości nie wysłano, sprawdzana jest zapisana ilość.
  - `packageId` równe zapisanemu nie jest zmianą, więc nie przechodzi sprawdzenia aktywności.
- **`now()` w transakcji testu.** `tests/db` działa w jednej transakcji, a `now()` zwraca czas jej startu. Test triggera wstawia wiersz z jawnym starym `updated_at`, a potem sprawdza, że update go przesunął.
- **Data „dziś” bez rozjazdu przy hydratacji.** Serwer na Cloudflare liczy w UTC. Strona przekazuje wyspie `today` policzone w strefie `Europe/Warsaw`, a wyspa po starcie przelicza je lokalnie przez `todayIso()`. Bez tego znacznik „przeterminowany” przy końcu miesiąca różniłby się między HTML a klientem koło północy.
- **Fokus po usunięciu.** Okno potwierdzenia oddaje fokus przyciskowi, którego już nie ma. Po usunięciu fokus przechodzi na następny wiersz. Gdy go nie ma, idzie na poprzedni, a przy pustej liście na komunikat „Apteczka jest pusta”.

## Phase 1: Baza i API edycji oraz usuwania

Może iść równolegle z fazą 2. Punkt 3 (`KitItem.productId`) ląduje pierwszy, osobnym commitem, zanim fazy się rozwidlą.

### Overview

Trigger `updated_at`, funkcje serwisu, trasy `PATCH` i `DELETE /api/kit/[id]`, `productId` w `KitItem`, testy bazy i HTTP, kroki smoke i dokumentacja testów.

### Changes Required:

#### 1. Migracja triggera `updated_at`

**File**: `supabase/migrations/20261104120000_kit_items_updated_at.sql`

**Intent**: Każdy update wiersza `kit_items` ustawia `updated_at = now()`, żeby kolumna odpowiadała ostatniej zmianie (F6).

**Contract**:

- Funkcja `public.kit_items_set_updated_at()` w `plpgsql`, `security invoker`, `set search_path = ''`, `returns trigger`, z komentarzem.
- Trigger `before update ... for each row`.
- Bez `revoke execute`: funkcji `returns trigger` nie da się wywołać wprost, a odebranie uprawnień nic nie daje.
- Migracja nie dotyka rejestru, więc nie trafia do `REGISTRY_MIGRATIONS` w `tests/db/registry-import-fixtures.ts`. Strażnik tej listy dotyczy migracji bez `auth.` / `kit_items`, a ta dotyka `kit_items`.

#### 2. Serwis apteczki

**File**: `src/lib/services/kit.ts`

**Intent**: Odczyt jednej pozycji z danymi potrzebnymi do edycji oraz update i delete zwracające informację, czy wiersz istniał.

**Contract**:

- Wspólna stała selektu i mapowanie wiersza na `KitItem`, używane przez `listKitItems` i nowe funkcje. Selekt dochodzi `registry_packages.product_id`.
- `getKitItem(supabase, id): Promise<KitItem | null>` czyta bez filtra `removed_at`. RLS ukrywa cudze wiersze.
- `updateKitItem(supabase, id, changes): Promise<KitItem | null>`: `.update(...).eq("id", id).select(<wspólny selekt>)`. Pusty wynik daje `null`.
- `deleteKitItem(supabase, id): Promise<boolean>`: `.delete().eq("id", id).select("id")`. Pusty wynik daje `false`.
- `changes` to podzbiór `{ package_id, quantity, expires_on, expiry_precision }`. Kolumny nieobecne w obiekcie nie trafiają do update.

#### 3. Typ pozycji

**File**: `src/types.ts`

**Intent**: Lista i panel edycji potrzebują produktu pozycji, żeby wczytać opakowania jej wariantu.

**Contract**: `KitItem.productId: number`, wypełniane przez `registry_packages.product_id` w selekcie `listKitItems`. Ten punkt razem z tą zmianą selektu ląduje pierwszy, osobnym commitem: od niego zależą dane testowe fazy 2. Dodać też typ odpowiedzi PATCH `{ item: KitItem }` jako DTO.

#### 4. Schemat żądania PATCH

**File**: `src/lib/kit-request.ts` (+ `src/lib/kit-request.test.ts`)

**Intent**: Walidacja częściowej zmiany z tymi samymi granicami co POST.

**Contract**:

- `kitItemUpdateRequest` jest wyprowadzony z pól `kitItemRequest` (te same granice `packageId`, `quantity`, `expiry`). Wszystkie pola opcjonalne, strict.
- Co najmniej jeden klucz, inaczej błąd walidacji.
- `packageId` nie przyjmuje `null`; `quantity` i `expiry` przyjmują `null`.
- `kitItemIdParam` waliduje parametr ścieżki: dodatnia liczba całkowita w zakresie bezpiecznym dla `bigint`, zapisana samymi cyframi.
- Testy jednostkowe: puste body, nieznany klucz, `packageId: null`, obie strony każdej granicy, kształty id (`abc`, `0`, `-1`, `1.5`, `01`, bardzo długi ciąg).

#### 5. Trasy `PATCH` i `DELETE`

**File**: `src/pages/api/kit/[id].ts`

**Intent**: Zmiana i usunięcie własnej pozycji, zgodnie z kolejnością i stylem `POST /api/kit`.

**Contract**:

- `PATCH`:
  - Kolejność: 503 `Supabase is not configured` → 401 → 415 → 400 (zły id) → 400 `Invalid JSON body` → 400 `Invalid request` z `issues` → 404 `Not found` (`getKitItem` daje `null`) → 400 biznesowe → 200 `{ item }`.
  - 415 jest przed id, żeby pasowało do `POST`. Test pilnuje kolejności 401 → 415.
  - Reguły biznesowe przy `packageId` różnym od zapisanego: opakowanie musi być aktywne (`getPackage` nie daje `null`) i musi być w `getVariantPackages(supabase, item.productId)`. Inaczej 400 `Package is not a pack of this medicine`.
  - Limit ilości wynika z opakowania docelowego (patrz Critical Implementation Details): 400 `Quantity exceeds the pack size (N)`.
  - `expiry` obiekt zapisuje `expiryToDate(month, year)` z precyzją `month`; `expiry: null` czyści obie kolumny.
  - Pusty wynik `updateKitItem` (wiersz zniknął w międzyczasie) daje 404.
- `DELETE`: 503 → 401 → 400 (zły id) → 404 (`deleteKitItem` daje `false`) → 204 bez treści.
- Oba: `Cache-Control: no-store`, `console.error` z przyczyną i ogólne 500.
- `json()` z `index.ts` przenieść do wspólnego modułu, jeśli to proste. W przeciwnym razie zostawić lokalną kopię w tym samym stylu.

#### 6. Testy HTTP

**File**: `tests/api/helpers.ts`, `tests/api/kit-input.test.ts`, `tests/api/kit-access.test.ts`

**Intent**: Pokryć nowe trasy według §6.4 `test-plan.md`: trzy asercje na przypadek nieprawidłowy, obie strony granicy i dostęp.

**Contract**:

- Pomocniki:
  - `sendJson(path, body, jar?, method = "POST")`;
  - `kitRowsById` zwraca też `expiresOn` i `expiryPrecision`;
  - `loadBoundaryData` dostaje parę opakowań jednego aktywnego wariantu o różnych liczbowych rozmiarach (na fixture'ach Smecta 10/30) opakowanie innego wariantu oraz wycofane opakowanie aktywnego produktu z liczbowym rozmiarem (na fixture'ach Liść Pokrzywy 20 sasz. albo Zoledronic acid 10 fiol.). Brak rekordu to błąd, nie pominięcie;
  - nowy `insertKitRow(email, packageId, fields)` wstawia wiersz SQL-em na koncie testowym. To jedyny zapis do bazy w `test:api`, decyzja z planowania.
- `kit-input.test.ts` (konto pliku, bez nowych rejestracji):
  - Kształt: 415, zły JSON, `{}`, nieznany klucz, `userId`, każdy zły id i nieznany id (404).
  - Granice ilości: −1/0; rozmiar+1/rozmiar; dla opakowania bez rozmiaru 100001/100000 (źródło: F1 `MAX_QUANTITY`).
  - Granice daty: miesiąc 0/1, 12/13; rok 1999/2000, 2100/2101.
  - Częściowość: `{quantity}` zostawia datę, precyzję i opakowanie; `{expiry: null}` czyści datę i precyzję; `{quantity: null}` daje ilość nieznaną.
  - Zmiana opakowania:
    - na rodzeństwo w wariancie: 200;
    - opakowanie innego wariantu: 400;
    - opakowanie wycofane: 400;
    - nieistniejące: 400;
    - ilość ponad limit nowego opakowania: 400;
    - zapisana ilość ponad limit nowego opakowania przy braku `quantity`: 400.
  - Pozycja na wycofanym opakowaniu z rozmiarem (wstawiona SQL-em): ilość równa rozmiarowi zapisanego opakowania 200, rozmiar+1 400 (obie strony granicy, żeby pominięcie limitu przy `getPackage` = `null` nie przeszło); to samo `packageId` 200.
  - `DELETE`: zły id 400, nieznany 404, własny 204 i wiersza nie ma, drugi raz 404.
  - Każdy przypadek nieprawidłowy: kod 4xx, wiersz bez zmian (porównanie `kitRowsById` przed i po) i `expectNoInternals`.
- `kit-access.test.ts` (istniejące konta A i B):
  - bez sesji `PATCH` i `DELETE` dostają 401 przed walidacją, przy dowolnym body i `Content-Type`;
  - B na wierszu A: `PATCH` 404 i `DELETE` 404, wiersz A nienaruszony;
  - `DELETE` z obcym `Origin` dostaje 403 i nic nie usuwa;
  - PATCH własnego wiersza nie zmienia właściciela.

#### 7. Testy bazy

**File**: `tests/db/kit-access.test.ts`

**Intent**: Trigger działa, a właściciel może zmienić i usunąć własny wiersz.

**Contract**:

- Nowy `describe` sprawdza, że update właściciela przesuwa `updated_at` i nie zmienia `created_at`, oraz że jawnie ustawione stare `updated_at` w update zostaje nadpisane.
- Delete właściciela usuwa wiersz.
- Strażnik `security definer` przechodzi bez zmiany `ALLOWED`.

#### 8. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Nowe trasy sprawdzone na buildzie produkcyjnym w CI.

**Contract**:

- Krok dodania zapamiętuje `id`.
- Po krokach drugiego konta, przed wylogowaniem:
  - drugie konto nie usuwa pozycji (404);
  - właściciel zmienia ilość (200, ilość w odpowiedzi);
  - właściciel usuwa pozycję (204);
  - `/apteczka` nie pokazuje już leku.
- Istniejące kroki bez zmian.

#### 9. Dokumentacja testów

**File**: `AGENTS.md`, `context/foundation/test-plan.md`

**Intent**: Opis tras i nowego wyjątku od „tylko odczyt”.

**Contract**:

- W AGENTS.md opis `npm run test:api` dostaje `PATCH`/`DELETE /api/kit/[id]`, plik `src/pages/api/kit/[id].ts` na liście „Run it after changing” i zdanie, że `DATABASE_URL` jest tylko do odczytu poza wstawieniem wierszy na własnych kontach testowych (pozycja na wycofanym opakowaniu).
- W opisie `npm run test:db` dopisać trigger `updated_at`.
- `test-plan.md` §6.4: zaktualizować „Dane graniczne z bazy (tylko odczyt)” i punkt „Dla S-05”.

### Success Criteria:

#### Automated Verification:

- Migracja wchodzi na czystą bazę: `npx supabase db reset`
- Fixture'y rejestru zaimportowane po resecie (v1, v1, v2) i `node scripts/registry-import-check.mjs` przechodzi
- Testy bazy przechodzą, w tym trigger i strażnik `security definer`: `npm run test:db`
- Testy jednostkowe schematu przechodzą: `npx vitest run --project unit`
- Testy HTTP przechodzą na lokalnym serwerze: `npm run test:api`
- Smoke przechodzi z nowymi krokami: `npm run smoke`
- Lint i typy: `npm run lint` i `npx astro check`

#### Manual Verification:

- Przed merge: migracja wypchnięta na produkcję (`npx supabase db push`), bo deploy jej nie stosuje

**Implementation Note**: Po fazie i zielonych bramkach zatrzymaj się na potwierdzenie kontroli ręcznych przez człowieka. Użytkownik decyduje, które kontrole robi sam.

---

## Phase 2: Wspólny wiersz i lista jako wyspa

Może iść równolegle z fazą 1, po wspólnym kroku `KitItem.productId` (punkt 3 fazy 1, osobny commit przed rozwidleniem).

### Overview

Lista `/apteczka` staje się wyspą React renderowaną na serwerze, a wiersz staje się wspólnym komponentem szczegółów z wynikiem sprawdzenia. Faza nie dodaje jeszcze akcji, ale lista dostaje znaczniki „przeterminowany” i „puste”.

### Changes Required:

#### 0. Zrzuty bazowe przed zmianą

**File**: brak (wynik w `.ui-shots/kit-browse-edit-before/`)

**Intent**: Kontrola 2.6 potrzebuje stanu „przed”, więc zrzuty powstają na niezmienionym kodzie, zanim ruszy `MedicineCheckResult`.

**Contract**: `BASE_URL=http://localhost:4321 npm run ui:shots -- --label kit-browse-edit-before` jako pierwszy krok fazy.

#### 1. Wspólne szczegóły pozycji

**File**: `src/components/kit/KitItemDetails.tsx`

**Intent**: Jeden opis opakowania w apteczce na obu ekranach, żeby to samo opakowanie wyglądało tak samo (F10).

**Contract**:

- Props: pozycja (pola wspólne `KitItem` i `MedicineCheckItem`), `today`, opcjonalne `substances` i opcjonalny slot, który podmienia linię ilości (używa go faza 3).
- Renderuje nazwę, moc · postać, opcjonalne substancje, etykietę opakowania, „Ilość: …”, „Ważny do: …” z „ · przeterminowany” (`isExpired`), „ · puste” przy ilości 0 i „wycofany z rejestru”.
- Tylko klasy ról.

#### 2. Wynik sprawdzenia na wspólnym wierszu

**File**: `src/components/registry/MedicineCheckResult.tsx`

**Intent**: `ItemList` renderuje `KitItemDetails` zamiast własnego markupu.

**Contract**: Istniejące asercje w `MedicineCheckResult.test.tsx` i `RegistrySearch.test.tsx` przechodzą bez edycji. Dochodzi tylko nowy przypadek „puste”.

#### 3. Data „dziś” w strefie użytkownika

**File**: `src/lib/kit-format.ts` (+ `src/lib/kit-format.test.ts`)

**Intent**: Serwer potrafi policzyć dzisiejszą datę w Polsce.

**Contract**:

- `todayIso(timeZone?: string)`. Bez argumentu zachowuje się jak dziś (data lokalna); z argumentem liczy przez `Intl.DateTimeFormat` w podanej strefie.
- Test z udawanym czasem 23:30 UTC ostatniego dnia miesiąca daje dla `Europe/Warsaw` następny dzień.

#### 4. Wyspa listy

**File**: `src/components/kit/KitList.tsx` (+ `src/components/kit/KitList.test.tsx`)

**Intent**: Lista jako komponent React, który w fazach 3 i 4 przyjmie akcje.

**Contract**:

- Props `{ items: KitItem[]; today: string }`.
- Stan `items` i `today`. `today` przelicza się w efekcie przez `todayIso()`.
- Pusty stan „Apteczka jest pusta”.
- Ten sam `ul`/`li` i klasy co dziś w `apteczka.astro`.
- Test komponentu: wiersze w kolejności z serwera, znacznik przeterminowania, „puste”, „wycofany z rejestru” i pusty stan.

#### 5. Strona apteczki

**File**: `src/pages/apteczka.astro`

**Intent**: Strona przekazuje dane wyspie zamiast renderować wiersze.

**Contract**:

- `<KitList items={items} today={todayIso("Europe/Warsaw")} client:load />` w sekcji „W apteczce”.
- Komunikaty `?dodano` i `?zaimportowano` oraz błąd wczytania zostają w Astro.
- Smoke „kit page lists the added medicine” przechodzi bez zmian, bo napis „nieznane” i nazwa są w HTML z SSR wyspy.

#### 6. Strażnik UI

**File**: `scripts/ui-scan.mjs`

**Intent**: Nowe widoki są pilnowane od pierwszego dnia.

**Contract**: `KitItemDetails.tsx` i `KitList.tsx` w `GUARDED`.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe i komponentów przechodzą, w tym niezmienione `MedicineCheckResult.test.tsx` i `RegistrySearch.test.tsx`: `npx vitest run --project unit --project component`
- `npm run ui:scan` bez trafień
- Lint, typy i build: `npm run lint`, `npx astro check`, `npm run build`
- Smoke przechodzi bez zmian w kroku listy: `npm run smoke`

#### Manual Verification:

- `http://localhost:4321/apteczka` pokazuje pozycje jak przed zmianą, a przeterminowana ma „przeterminowany”
- `ui:shots` stanów `check-*` na `/szukaj` (`BASE_URL=http://localhost:4321 npm run ui:shots -- --label kit-browse-edit-p2`) wygląda tak samo jak `.ui-shots/kit-browse-edit-before/`

**Implementation Note**: Po fazie i zielonych bramkach zatrzymaj się na potwierdzenie kontroli ręcznych przez człowieka. Użytkownik decyduje, które kontrole robi sam.

---

## Phase 3: Ilość na liście i usuwanie

Zależy od faz 1 i 2.

### Overview

Pole ilości z „Zapisz” w każdym wierszu, propozycja usunięcia pustego opakowania i usuwanie z oknem potwierdzenia.

### Changes Required:

#### 1. Wspólne pola ilości

**File**: `src/components/kit/kit-fields.tsx`, `src/lib/kit-format.ts` (+ test), `src/components/kit/KitAddForm.tsx`

**Intent**: Lista i formularz dodawania mają tę samą walidację i ten sam wygląd pola ilości.

**Contract**:

- Czysta funkcja `parseQuantityInput(text, max)` w `kit-format.ts` daje `{ value: number | null }` albo `{ error }`. Komunikaty są obecnymi z `KitAddForm`: „Podaj liczbę całkowitą, 0 lub większą” i „Ilość nie może być większa niż N”. Pusty tekst daje `null`.
- `kit-fields.tsx` eksportuje `QuantityInput` (pole z sufiksem „z N jedn.”), `InlineError` i klasy pól.
- `KitAddForm` przechodzi na te elementy, a `KitAddForm.test.tsx` przechodzi bez edycji.

#### 2. Akcje pozycji

**File**: `src/components/hooks/useKitItemActions.ts`

**Intent**: Wywołania PATCH i DELETE z polskimi komunikatami w jednym miejscu.

**Contract**:

- `save(id, changes) → { item } | { error }` i `remove(id) → { ok } | { error }`.
- Komunikaty po statusie, nigdy z `payload.error` serwera:
  - 401: „Sesja wygasła — zaloguj się ponownie”;
  - 404: „Tej pozycji nie ma już w apteczce — odśwież stronę”;
  - 400: „Nie udało się zapisać tej wartości”;
  - inne: „Nie udało się zapisać, spróbuj później”;
  - błąd sieci: „Nie udało się połączyć z serwerem, spróbuj ponownie”.
- Ta sama mapa obsługuje usuwanie, z czasownikiem „usunąć”.

#### 3. Okno potwierdzenia

**File**: `src/components/ui/alert-dialog.tsx`

**Intent**: Dostępne okno potwierdzenia z shadcn.

**Contract**: `npx shadcn@latest add alert-dialog`. Akcja „Usuń” w wariancie `destructive` przez `buttonVariants`.

#### 4. Wiersz z akcjami

**File**: `src/components/kit/KitList.tsx` (+ `KitList.test.tsx`), `tests/helpers/fetch.ts`

**Intent**: Poprawianie ilości i usuwanie bez opuszczania listy.

**Contract**:

- Linię ilości zastępuje `QuantityInput` z etykietą dostępną „Ilość: <nazwa>” i placeholderem „nieznane”.
- „Zapisz” pokazuje się tylko po zmianie wartości; Enter też zapisuje.
- Podczas zapisu pole i przycisk są zablokowane. Sukces podmienia pozycję na `item` z odpowiedzi. Błąd zostawia wpisaną wartość i pokazuje komunikat pod polem.
- Przy ilości 0 wiersz pokazuje „Opakowanie puste” z przyciskiem „Usuń”, który otwiera to samo okno.
- „Usuń” otwiera okno:
  - tytuł „Usunąć z apteczki?”;
  - opis: nazwa, moc, etykieta opakowania i „Tej operacji nie można cofnąć.”;
  - przyciski „Anuluj” / „Usuń”.
- Sukces usuwa wiersz i przenosi fokus (patrz Critical Implementation Details). Błąd zostawia wiersz z komunikatem.
- `stubRoutedFetch` dostaje opcję obsługi `PATCH`/`DELETE /api/kit/<id>`, która zapisuje żądania.
- Testy komponentu:
  - zapis ilości (żądanie z samym `quantity`, wiersz z odpowiedzi);
  - walidacja przed wysłaniem;
  - 401, 404 i błąd sieci po polsku;
  - Enter;
  - 0 → „Opakowanie puste”;
  - usunięcie przez okno (żądanie DELETE, wiersz znika, fokus);
  - „Anuluj” nic nie wysyła;
  - usunięcie ostatniej pozycji daje „Apteczka jest pusta”.
- `kit-fields.tsx` w `GUARDED` w `scripts/ui-scan.mjs`.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe i komponentów przechodzą, w tym niezmieniony `KitAddForm.test.tsx`: `npx vitest run --project unit --project component`
- `npm run ui:scan` bez trafień
- Lint, typy i build: `npm run lint`, `npx astro check`, `npm run build`

#### Manual Verification:

- Na `http://localhost:4321/apteczka` zmiana ilości i „Zapisz” (oraz Enter) zapisuje się i zostaje po odświeżeniu
- Ilość 0 pokazuje „Opakowanie puste”, a „Usuń” z okna usuwa pozycję
- Klawiatura: Tab dochodzi do pola, „Zapisz”, „Usuń”; okno łapie fokus, Esc zamyka; po usunięciu fokus nie ginie
- Telefon (390 px): wiersz z polem i przyciskami mieści się bez poziomego przewijania

**Implementation Note**: Po fazie i zielonych bramkach zatrzymaj się na potwierdzenie kontroli ręcznych przez człowieka. Użytkownik decyduje, które kontrole robi sam.

---

## Phase 4: Panel „Edytuj”

Zależy od fazy 3. PR #62 jest już zmergowany.

### Overview

Panel w wierszu z wyborem opakowania wariantu, ilością i datą ważności.

### Changes Required:

#### 1. Wspólne pola daty

**File**: `src/components/kit/kit-fields.tsx`, `src/components/kit/KitAddForm.tsx`

**Intent**: Wybór miesiąca i roku jest ten sam w dodawaniu i edycji.

**Contract**:

- `ExpirySelect` (dwa natywne selecty w `role="group"`, `MONTHS`, lata od −5 do +10). Zapisany rok spoza zakresu zostaje dołożony do opcji.
- Walidacja „Wybierz miesiąc i rok albo zostaw oba pola puste”.
- `KitAddForm.test.tsx` przechodzi bez edycji.

#### 2. Panel edycji

**File**: `src/components/kit/KitItemEdit.tsx` (+ `src/components/kit/KitItemEdit.test.tsx`)

**Intent**: Zmiana opakowania w obrębie leku, ilości i daty w jednym zapisie.

**Contract**:

- Opakowania z `useVariantPackages(item.productId)`, wybierane w `RadioGroup` jak w `KitAddForm`. Posiadacz jest pokazany, gdy w liście jest więcej niż jeden `productId`.
- Obecne opakowanie jest zaznaczone. Gdy `uniquePacks` schowało jego GTIN pod opcją tego samego produktu i tej samej etykiety, ta opcja przejmuje `packageId` pozycji, więc jej wybór znaczy „bez zmiany” (bez zdublowanej etykiety). Tylko gdy takiej opcji nie ma (opakowanie wycofane), obecne opakowanie stoi jako pierwsza opcja z dopiskiem „obecne”.
- Błąd wczytania opakowań: komunikat, a opakowanie zostaje bez zmiany (ilość i datę można zapisać).
- Ilość z `QuantityInput`, a limit idzie za wybranym opakowaniem.
- Data z `ExpirySelect` i przyciskiem „Wyczyść”.
- „Zapisz” wysyła tylko zmienione pola i jest zablokowany bez zmian. „Anuluj” zamyka bez wysyłki.
- Sukces podmienia wiersz i zamyka panel; błędy idą przez `useKitItemActions`.
- `KitList` dostaje przycisk „Edytuj” (`aria-expanded`), który rozwija panel w wierszu.
- Testy komponentu:
  - zmiana opakowania wysyła `packageId`, a limit ilości się zmienia;
  - przypięte „obecne” dla wycofanego opakowania;
  - GTIN schowany przez `uniquePacks`: jedna opcja z tą etykietą, zaznaczona, a zapis bez zmian nie wysyła `packageId`;
  - wyczyszczenie daty wysyła `expiry: null`;
  - bez zmian brak żądania;
  - błąd opakowań;
  - 401 i 400 po polsku.
- `KitItemEdit.tsx` w `GUARDED`.

#### 3. Dokumentacja testów

**File**: `AGENTS.md`

**Intent**: Lista testów komponentów w opisie `npm test` wymienia nowe pliki.

**Contract**: Zdanie o `src/components/kit/KitList.test.tsx` i `KitItemEdit.test.tsx`: tylko `fetch` podmieniony.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe i komponentów przechodzą, w tym niezmieniony `KitAddForm.test.tsx`: `npx vitest run --project unit --project component`
- `npm run ui:scan` bez trafień
- Lint, typy i build: `npm run lint`, `npx astro check`, `npm run build`
- Pełny zestaw serwerowy jeszcze raz na końcu: `npm run test:db`, `npm run test:api`, `npm run smoke`

#### Manual Verification:

- Na `http://localhost:4321/apteczka` „Edytuj” → zmiana opakowania (np. Smecta 10 → 30 sasz.) zapisuje się, a limit ilości idzie za opakowaniem
- Wyczyszczenie daty daje „Ważny do: nieznane” po zapisie i odświeżeniu
- Pozycja wycofana z rejestru pokazuje obecne opakowanie jako „obecne” i da się zmienić jej ilość
- Telefon (390 px): panel edycji czytelny i bez poziomego przewijania

**Implementation Note**: Po fazie i zielonych bramkach zatrzymaj się na potwierdzenie kontroli ręcznych przez człowieka. Użytkownik decyduje, które kontrole robi sam.

---

## Testing Strategy

### Unit Tests:

- `kitItemUpdateRequest` i `kitItemIdParam`: puste body, strict, `null` per pole, obie strony granic, kształty id.
- `todayIso(timeZone)`: przejście doby w `Europe/Warsaw`.
- `parseQuantityInput`: pusty tekst, ujemna, ułamek, limit i jego brak.

### Integration Tests:

- `test:db`: trigger `updated_at`, update i delete właściciela, strażnik `security definer`.
- `test:api`: granice i kształt PATCH, częściowość, zmiana opakowania, wycofana pozycja, DELETE, 401 przed walidacją, cudzy wiersz 404, obcy `Origin` 403.
- Smoke: zmiana ilości i usunięcie na buildzie produkcyjnym, cudze konto 404.
- Komponenty: `KitList`, `KitItemEdit`, niezmienione `MedicineCheckResult`, `RegistrySearch` i `KitAddForm`.

### Manual Testing Steps:

1. Zaloguj się na `http://localhost:4321/auth/signin`, dodaj dwa leki na `http://localhost:4321/apteczka`, w tym Smectę.
2. Zmień ilość pierwszego i zapisz Enterem; odśwież stronę.
3. Ustaw 0, potwierdź „Opakowanie puste” i usuń przez okno.
4. „Edytuj” Smectę: zmień opakowanie, ilość ponad nowy limit (komunikat), potem poprawną; wyczyść datę.
5. Sprawdź przeterminowaną pozycję na liście i w wyniku sprawdzenia na `http://localhost:4321/szukaj`: oba widoki pokazują ten sam znacznik.

## Performance Considerations

Lista jest wyspą `client:load`, więc dochodzi hydratacja całej listy. Przy apteczce domowej (kilkadziesiąt pozycji) koszt jest pomijalny. Opakowania wariantu są wczytywane dopiero po otwarciu panelu „Edytuj”, nie dla każdego wiersza.

## Migration Notes

- Migracja `20261104120000_kit_items_updated_at.sql` nie zmienia danych, tylko dodaje trigger. Istniejące `updated_at` zostają.
- Deploy nie stosuje migracji, więc przed merge trzeba ręcznie wypchnąć ją na produkcję (`npx supabase db push`). Trasy działają też bez niej, ale `updated_at` nie będzie się zmieniać.
- Wycofanie: `drop trigger` i `drop function`. Kod nie zależy od triggera.

## References

- Research: `context/changes/kit-browse-edit/research.md`
- Roadmap: `context/foundation/roadmap.md` (S-05, F4, F6, F10)
- Wzorzec trasy: `src/pages/api/kit/index.ts`
- Wzorzec testów HTTP: `context/foundation/test-plan.md` §6.4, `tests/api/kit-input.test.ts`, `tests/api/kit-access.test.ts`
- Pola formularza: `src/components/kit/KitAddForm.tsx`
- Wiersz wyniku sprawdzenia: `src/components/registry/MedicineCheckResult.tsx:30-55`
- Opakowania wariantu: `supabase/migrations/20261007120000_kit_items.sql:82-127`, `src/components/hooks/useVariantPackages.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza i API edycji oraz usuwania

#### Automated

- [x] 1.1 Migracja wchodzi na czystą bazę: `npx supabase db reset`
- [x] 1.2 Fixture'y rejestru zaimportowane po resecie (v1, v1, v2) i `node scripts/registry-import-check.mjs` przechodzi
- [x] 1.3 Testy bazy przechodzą, w tym trigger i strażnik `security definer`: `npm run test:db` — 14c3cc4
- [x] 1.4 Testy jednostkowe schematu przechodzą: `npx vitest run --project unit` — 14c3cc4
- [x] 1.5 Testy HTTP przechodzą na lokalnym serwerze: `npm run test:api`
- [x] 1.6 Smoke przechodzi z nowymi krokami: `npm run smoke` — 14c3cc4
- [x] 1.7 Lint i typy: `npm run lint` i `npx astro check` — 14c3cc4

#### Manual

- [x] 1.8 Przed merge: migracja wypchnięta na produkcję (`npx supabase db push`), bo deploy jej nie stosuje

### Phase 2: Wspólny wiersz i lista jako wyspa

#### Automated

- [x] 2.1 Testy jednostkowe i komponentów przechodzą, w tym niezmienione `MedicineCheckResult.test.tsx` i `RegistrySearch.test.tsx`: `npx vitest run --project unit --project component` — 917252f
- [x] 2.2 `npm run ui:scan` bez trafień — 917252f
- [x] 2.3 Lint, typy i build: `npm run lint`, `npx astro check`, `npm run build` — 917252f
- [x] 2.4 Smoke przechodzi bez zmian w kroku listy: `npm run smoke` — 917252f

#### Manual

- [x] 2.5 `http://localhost:4321/apteczka` pokazuje pozycje jak przed zmianą, a przeterminowana ma „przeterminowany”
- [x] 2.6 `ui:shots` stanów `check-*` na `/szukaj` (`BASE_URL=http://localhost:4321 npm run ui:shots -- --label kit-browse-edit-p2`) wygląda tak samo jak `.ui-shots/kit-browse-edit-before/`

### Phase 3: Ilość na liście i usuwanie

#### Automated

- [x] 3.1 Testy jednostkowe i komponentów przechodzą, w tym niezmieniony `KitAddForm.test.tsx`: `npx vitest run --project unit --project component` — 0dbe675
- [x] 3.2 `npm run ui:scan` bez trafień — 0dbe675
- [x] 3.3 Lint, typy i build: `npm run lint`, `npx astro check`, `npm run build` — 0dbe675

#### Manual

- [x] 3.4 Na `http://localhost:4321/apteczka` zmiana ilości i „Zapisz” (oraz Enter) zapisuje się i zostaje po odświeżeniu
- [x] 3.5 Ilość 0 pokazuje „Opakowanie puste”, a „Usuń” z okna usuwa pozycję
- [x] 3.6 Klawiatura: Tab dochodzi do pola, „Zapisz”, „Usuń”; okno łapie fokus, Esc zamyka; po usunięciu fokus nie ginie — fokus wraca na „Usuń” po Esc i „Anuluj” (9ef0611)
- [x] 3.7 Telefon (390 px): wiersz z polem i przyciskami mieści się bez poziomego przewijania

### Phase 4: Panel „Edytuj”

#### Automated

- [x] 4.1 Testy jednostkowe i komponentów przechodzą, w tym niezmieniony `KitAddForm.test.tsx`: `npx vitest run --project unit --project component` — e737b07
- [x] 4.2 `npm run ui:scan` bez trafień — e737b07
- [x] 4.3 Lint, typy i build: `npm run lint`, `npx astro check`, `npm run build` — e737b07
- [x] 4.4 Pełny zestaw serwerowy jeszcze raz na końcu: `npm run test:db`, `npm run test:api`, `npm run smoke`

#### Manual

- [x] 4.5 Na `http://localhost:4321/apteczka` „Edytuj” → zmiana opakowania (np. Smecta 10 → 30 sasz.) zapisuje się, a limit ilości idzie za opakowaniem
- [x] 4.6 Wyczyszczenie daty daje „Ważny do: nieznane” po zapisie i odświeżeniu
- [x] 4.7 Pozycja wycofana z rejestru pokazuje obecne opakowanie jako „obecne” i da się zmienić jej ilość
- [x] 4.8 Telefon (390 px): panel edycji czytelny i bez poziomego przewijania
