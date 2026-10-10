# S-03 Sprawdzenie leku przeciwko apteczce — plan implementacji

## Overview

Po wybraniu leku z podpowiedzi na `/szukaj` użytkownik widzi jeden z werdyktów: „masz ten lek”, „masz lek z tą samą substancją czynną” albo „nie masz”. Obok werdyktu są te same pola po obu stronach: substancje czynne, moc, postać, ilość i data ważności. Przy wyniku z tą samą substancją pojawia się zastrzeżenie o konsultacji z farmaceutą lub lekarzem (FR-010, FR-011, FR-012, US-01). `/szukaj` staje się stroną startową i celem przekierowania po zalogowaniu (D4).

## Current State Analysis

- **„Ten sam lek” jest już zdefiniowany.** Decyduje klucz wariantu: `lower(name)`, `lower(coalesce(strength,''))`, `lower(coalesce(pharmaceutical_form,''))`.
  - Liczy go `registry_variant_packages` (`supabase/migrations/20261007120000_kit_items.sql:89-127`).
  - Ta funkcja pomija wycofane produkty i opakowania (`:118-119`), a D3 wymaga, żeby się liczyły. Dlatego S-03 potrzebuje własnego zapytania.
- **Pozycja apteczki wskazuje opakowanie.** Droga do substancji: `kit_items.package_id → registry_packages.product_id → registry_product_substances` (`kit_items.sql:18`, `20261001120000_registry_tables.sql:65-75`).
  - Substancje i NPS to wolny tekst bez normalizacji (`scripts/lib/rpl-parser.mjs:92-105`).
- **`listKitItems` nie zwraca substancji, `product_id` ani NPS** (`src/lib/services/kit.ts:117-146`). `/api/kit` ma tylko `POST` (`src/pages/api/kit/index.ts:27`).
- **Podpowiedź ma za mało danych do porównania w przeglądarce.** Emituje `RegistryVariant` z `id` reprezentanta i jego substancjami (`src/types.ts:25-32`), a moc w liście jest ucięta do 80 znaków (`20261002130000_registry_search_list_version.sql:66`). Porównanie musi się więc odbyć w bazie.
- **`/szukaj` dziś tylko pokazuje kartę wybranego leku** (`src/components/registry/RegistrySearch.tsx:19-54`).
- **Logowanie przekierowuje na `/`** (`src/pages/api/auth/signin.ts:19`).
  - `/` to wciąż ekran startera `Welcome.astro` z `bg-cosmic`.
  - `/dashboard` jest chroniony (`src/middleware.ts:4`), ale nieosiągalny z UI.
  - Smoke sprawdza oba (`scripts/smoke.mjs:124-125,143,223`).
- **Brak tokenów sukcesu i ostrzeżenia** (`src/styles/global.css:7-40`). `palette.md` jest już w archiwum (`context/archive/2026-10-07-search-view-tokens/palette.md`), a `AGENTS.md` wciąż odsyła do starej ścieżki.

## Desired End State

**Werdykty na `/szukaj`.** Zalogowany użytkownik wybiera podpowiedź i po jednym zapytaniu widzi wynik:

- **„Masz ten lek”:**
  - pozycje tego samego wariantu, łącznie z importami równoległymi (D2) i wycofanymi opakowaniami z etykietą „wycofany z rejestru” (D3);
  - pod nimi sekcja „Także z tą samą substancją czynną” z zastrzeżeniem, jeśli takie pozycje istnieją.
- **„Masz lek z tą samą substancją czynną”:** pozycje dopasowane regułą D1, z zastrzeżeniem przy wyniku.
- **„Nie masz tego leku”:** gdy rejestr nie podaje porównywalnego składu szukanego leku, dochodzi uwaga, że nie dało się sprawdzić leków z tą samą substancją.

**Szczegóły wyniku:**

- W każdej sekcji pozycje są posortowane po najbliższej dacie ważności (przeterminowane też), bez daty na końcu, potem od najnowszych.
- Szukany lek pokazuje pełną moc (nieuciętą), postać i substancje.
- Werdykty są wyróżnione nowymi tokenami `success` / `warning` (wariant B z makiety), a werdykt „nie masz” używa `muted`.

**Wejście do aplikacji:**

- `/` przekierowuje zalogowanego na `/szukaj`, a niezalogowanego na `/auth/signin`.
- Logowanie prowadzi na `/szukaj`.
- `/dashboard` i `Welcome.astro` nie istnieją.

**Weryfikacja:**

- `medicine-check-check.mjs` i rozszerzony smoke przechodzą w CI.
- `ui:shots` pokazuje nowe stany wyniku.

### Key Discoveries:

- `registry_variant_packages` czyta klucz z `p_product_id` bez filtra `removed_at`, bo reprezentant może zostać wycofany między załadowaniem strony a wyborem (`kit_items.sql:82-88`). Nowe RPC robi to samo.
- Wzorzec endpointu do skopiowania to `src/pages/api/registry/packages.ts`: zod `productParam`, 503/401/400/500, `Cache-Control: no-store`.
- Wzorzec hooka to `src/components/hooks/useVariantPackages.ts`: klucz żądania, `AbortController`, `retry`, stan `unauthorized`.
- Wiersz pozycji apteczki i formatowanie: `src/pages/apteczka.astro:91-106` oraz `src/lib/kit-format.ts` (`packLabel`, `formatQuantity`, `formatExpiry`).
- Wzorzec skryptu sprawdzającego bazę w CI: `scripts/registry-import-check.mjs` (`pg`, `DATABASE_URL`, rola API przez `set local role`). Krok uruchamia `.github/workflows/ci.yml:47-54`.
- `ui:shots` ma stan `result` (`scripts/ui-shots.mjs:156-164`). Stany po stronie przeglądarki wymusza `context.route(...)`, np. `route.fulfill` dla 401 w `:186-195`.
- Pomiar z researchu (sekcja „Pomiar”, `research.md:48-59`) pokazuje rozjazd NPS i substancji w obie strony, stąd reguła „jedno albo drugie” w D1.

## What We're NOT Doing

- Poziomy dopasowania „zawiera wszystkie” i „zawiera jeden” (S-06). Reguła jest na stałe „precyzyjna”, ale funkcja porównania zestawów ma być wydzielona tak, żeby S-06 mógł dodać parametr poziomu.
- Ostrzeżenie o zbliżającym się końcu ważności (S-08). Pokazujemy tylko datę i oznaczenie „przeterminowany”, które wynika z FR-011.
- Sprawdzanie kilku leków naraz (FR-015, zaparkowane).
- Normalizacja pisowni substancji poza trim + lowercase + zwinięcie spacji, słownik soli i zasad, zmiany w parserze lub imporcie.
- Zmiany w liście wyszukiwania (`registry_search_list`). Nie podbijamy `version`, a `search:check` nie musi się zmieniać.
- Przebudowa `/apteczka` i wspólny komponent wiersza dla Astro i React (S-05). Wynik ma własny komponent React, który używa tych samych formatterów.
- Nowa strona powitalna dla niezalogowanych.
- Pomiar odsetka fałszywych wskazań D1 w całym rejestrze. Zostaje jako ryzyko, z ręcznym sprawdzeniem na przykładach.

## Implementation Approach

Reguła żyje w bazie, jako jedno RPC `security invoker`: RLS apteczki zawęża pozycje do właściciela, a rejestr jest czytelny dla `authenticated`. Jedno zapytanie po wyborze daje jedną podróż do bazy, co odpowiada pre-mortem z `infrastructure.md:69`. RPC zwraca jeden obiekt JSON z szukanym lekiem, flagą porównywalności i posortowanymi pozycjami z typem dopasowania. Endpoint jest cienką warstwą: walidacja, 401/404 i mapowanie na typy. Hook i komponent odpowiadają wzorcom z S-02.

Kolejność faz: najpierw reguła sprawdzona skryptem na syntetycznych danych, potem UI, na końcu przekierowania, bo zmieniają ścieżki, na których opiera się smoke.

## Critical Implementation Details

- **Ogólniki po obu stronach.** NPS-ogólnik nie daje dopasowania po NPS, a zestaw substancji zawierający ogólnik (np. substancja „Preparat złożony” w Sinupret) jest traktowany jak pusty. Inaczej dwa różne preparaty złożone z tym samym placeholderem dałyby „ta sama substancja”, a fałszywe wskazanie jest gorsze niż brak odpowiedzi (`prd.md:73-75`).
- **Pierwszeństwo kategorii.** Pozycja pasująca kluczem wariantu nigdy nie trafia do sekcji „ta sama substancja”.
- **Szukany lek.** Zestawy liczymy z produktu `p_product_id` (reprezentanta), a nie z rodzeństwa wariantu. Taki jest kontrakt S-01: lista niesie substancje reprezentanta.

## Faza 1: Reguła sprawdzenia w bazie

### Overview

Migracja z funkcjami normalizującymi i RPC `medicine_check` oraz skrypt, który sprawdza regułę D1–D3 na syntetycznych danych w CI.

### Changes Required:

#### 1. Migracja `medicine_check`

**File**: `supabase/migrations/20261010120000_medicine_check.sql`

**Intent**: Wydzielić normalizację (nazwa, zestaw części NPS, zestaw substancji, lista ogólników) i na niej zbudować RPC zwracające wynik sprawdzenia dla zalogowanego konta. Funkcje pomocnicze są osobne, żeby S-06 i FR-015 mogły ich użyć ponownie.

**Contract**:

- **Funkcje pomocnicze:**
  - `public.medicine_check_normalize(text) returns text`: `immutable`, trim + lowercase + zwinięcie białych znaków.
  - `public.medicine_check_is_generic(text) returns boolean`: `immutable`, porównuje znormalizowaną wartość z listą ogólników z `research.md:43,54`: „produkt złożony”, „preparat złożony”, „homeopatyczny produkt leczniczy”, „preparat homeopatyczny”, „preparat ziołowy”, „produkt ziołowy”, „produkt homeopatyczny”.
  - `public.medicine_check_common_name_set(text) returns text[]`: NPS rozbita po „+”, znormalizowana, bez pustych części, posortowana i unikalna. Pusta tablica, gdy NPS jest null albo któraś część jest ogólnikiem.
  - `public.medicine_check_substance_set(bigint) returns text[]`: `stable`, substancje produktu znormalizowane, posortowane i unikalne. Pusta tablica, gdy produkt nie ma substancji albo któraś jest ogólnikiem.
- **`public.medicine_check(p_product_id bigint) returns jsonb`:**
  - Atrybuty: `language sql stable security invoker set search_path = ''`.
  - Gdy produkt nie istnieje, zwraca `null`. Produkt nie jest filtrowany po `removed_at`.
  - Kształt wyniku:
    - `searched`: `{ id, name, strength, form, commonName, substances[] }`. Moc jest pełna, substancje są w kolejności `position` i w surowej pisowni do wyświetlenia.
    - `comparable`: boolean, czyli czy szukany lek ma niepusty zestaw NPS lub niepusty zestaw substancji.
    - `items`: tablica pozycji apteczki wywołującego, które pasują. Każda pozycja to `{ id, packageId, match: 'variant' | 'substance', matchedBy: 'common_name' | 'substances' | null, name, strength, form, holder, commonName, substances[], units, quantity, expiresOn, expiryPrecision, withdrawn, createdAt }`.
  - Reguła dopasowania pozycji:
    - **`variant`:** klucz wariantu pozycji równy kluczowi szukanego. Wycofane produkty i opakowania liczą się (D3).
    - **`substance`:** nie `variant`, a zestaw NPS lub zestaw substancji pozycji jest niepusty i równy odpowiedniemu zestawowi szukanego (D1). `matchedBy` zapisuje, które porównanie zadziałało: NPS albo substancje.
  - Sortowanie `items`: `match` (`variant` najpierw), `expires_on asc nulls last`, `created_at desc`, `id desc`.
- **Granty:**
  - Wszystkie funkcje: `revoke execute ... from public, anon`, `grant execute ... to authenticated`.
  - Komentarze `comment on function` po angielsku, jak w istniejących migracjach.

#### 2. Skrypt sprawdzający regułę

**File**: `scripts/medicine-check-check.mjs`

**Intent**: Bez runnera testów jednostkowych reguła D1–D3 potrzebuje wykonywalnego sprawdzenia. Skrypt wstawia syntetyczne produkty, substancje, opakowania, użytkownika i pozycje apteczki w jednej transakcji, wywołuje RPC jako `authenticated` i porównuje wyniki. Na końcu robi `rollback`, więc nie zostawia danych.

**Contract**:

- Wywołanie: `DATABASE_URL=... node scripts/medicine-check-check.mjs`. Exit 0, gdy wszystko przeszło, 1 przy błędzie albo niezgodności. Wypisuje `PASS/FAIL <przypadek>` jak smoke.
- Rola API: `set local role authenticated` i `set local request.jwt.claims` z `sub` syntetycznego użytkownika, którego wiersz jest wstawiony do `auth.users` w tej samej transakcji.
- Przypadki (nazwy z przykładów w `research.md:58`):

  | Przypadek                                                                         | Wynik                                 |
  | --------------------------------------------------------------------------------- | ------------------------------------- |
  | ten sam produkt                                                                   | `variant`                             |
  | import równoległy: inny `id`, ta sama nazwa, moc i postać w innej wielkości liter | `variant`                             |
  | wycofane opakowanie i wycofany produkt w apteczce                                 | `variant`, `withdrawn: true`          |
  | Sortis vs Atoris: ta sama NPS, różne sole w substancjach                          | `substance`, `matchedBy: common_name` |
  | Metafen vs Lizymax: różna NPS, te same substancje                                 | `substance`, `matchedBy: substances`  |
  | Smecta bez substancji vs Smecta z „Diosmectitum”                                  | `substance` po NPS                    |
  | dwa preparaty z NPS „Preparat złożony” i różnymi substancjami                     | brak dopasowania                      |
  | dwa produkty z jedyną substancją „Preparat złożony” i NPS-ogólnikiem              | brak dopasowania                      |
  | inny lek                                                                          | brak dopasowania                      |
  | szukany bez substancji i z NPS-ogólnikiem                                         | `comparable: false`                   |
  | nieznane `id`                                                                     | `null`                                |
  | pozycja innego użytkownika pasująca kluczem wariantu                              | nie wraca (RLS)                       |
  | kolejność: przeterminowana data, późniejsza data, brak daty                       | dokładnie w tej kolejności            |

- Syntetyczne `id` są poza zakresem fixture'ów, np. `9_000_000_000+`.

#### 3. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Sprawdzać regułę przy każdym PR, na tej samej lokalnej bazie co `registry-import-check`.

**Contract**: W kroku „Import registry fixtures (v1, v1, v2) and check the result” (`:47-54`), po `node scripts/registry-import-check.mjs`, dodać `node scripts/medicine-check-check.mjs` z tym samym `DATABASE_URL`.

#### 4. Dokumentacja poleceń

**File**: `AGENTS.md`

**Intent**: Dopisać tripwire dla nowego skryptu, żeby kolejny agent wiedział, kiedy go uruchomić.

**Contract**: Punkt pod „Command tripwires”: `node scripts/medicine-check-check.mjs`. Co sprawdza, że wymaga zresetowanej lokalnej bazy z migracjami, że CI uruchamia go w jobie `smoke` i że trzeba go uruchomić po zmianie migracji `medicine_check` albo tabel `registry_*` lub `kit_items`.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się na czystej bazie: `npx supabase db reset`
- Skrypt reguły przechodzi lokalnie: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node scripts/medicine-check-check.mjs`
- Import i jego sprawdzenie nadal przechodzą: fixtures v1, v1, v2 oraz `node scripts/registry-import-check.mjs`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Na lokalnej bazie z pełnym rejestrem `select public.medicine_check(<id>)` jako zalogowany użytkownik, z kilkoma pozycjami w apteczce, daje oczekiwane werdykty dla par z `research.md:58` (Sortis/Atoris, Asbima/Dafiro, Neo-Angin/Neo-Angin Spray, Metafen/Lizymax, Afronis/Aroma-Activ)
- Czas wywołania RPC na pełnym rejestrze z apteczką ok. 20 pozycji jest pomijalny (`explain analyze`, rząd kilkudziesięciu ms)

**Implementation Note**: Po fazie i przejściu automatycznych kroków zatrzymaj się i zapytaj, czy ręczne sprawdzenia robi użytkownik, czy agent (`lessons.md`: „Flag manual tests and let the user decide which they run”).

---

## Faza 2: Wynik sprawdzenia na `/szukaj`

### Overview

Endpoint, typy, hook i komponent wyniku. Nowe tokeny `success` / `warning`. `/szukaj` po wyborze pokazuje werdykt. Rozszerzone `ui:shots`, `ui:scan` i smoke.

### Changes Required:

#### 1. Typy

**File**: `src/types.ts`

**Intent**: Wspólny kształt odpowiedzi endpointu dla hooka i komponentu.

**Contract**:

- `MedicineCheckItem`: pola pozycji z RPC w camelCase. `match: "variant" | "substance"`, `matchedBy: "common_name" | "substances" | null`, `units: RegistryPackageUnit[]`, `withdrawn: boolean`.
- `MedicineCheckResponse`: `{ searched: { id; name; strength; form; commonName; substances: string[] }, comparable: boolean, items: MedicineCheckItem[] }`.

#### 2. Usługa

**File**: `src/lib/services/medicine-check.ts`

**Intent**: Owinąć RPC jak `getVariantPackages`: rzucać `Error` przy błędzie, zwracać `null` dla nieznanego produktu.

**Contract**: `getMedicineCheck(supabase, productId): Promise<MedicineCheckResponse | null>`.

#### 3. Endpoint

**File**: `src/pages/api/kit/check.ts`

**Intent**: `GET /api/kit/check?product=<id>` jako cienka warstwa nad usługą, według wzorca `src/pages/api/registry/packages.ts`.

**Contract**:

- 503: Supabase nie jest skonfigurowany.
- 401: brak użytkownika.
- 400: `product` nie jest dodatnią liczbą całkowitą.
- 404: `{ error: "Medicine not found" }`, gdy RPC zwróci `null`.
- 200: `MedicineCheckResponse`.
- 500: ogólny komunikat i `console.error`.
- Nagłówek `Cache-Control: no-store`.

#### 4. Hook

**File**: `src/components/hooks/useMedicineCheck.ts`

**Intent**: Ładowanie wyniku dla wybranego `productId`: nowy wybór przerywa poprzednie żądanie, a nieudane można ponowić.

**Contract**:

- `useMedicineCheck(productId: number)` zwraca `{ status: "loading" | "ready" | "unauthorized" | "error", result: MedicineCheckResponse | null, retry }`.
- 404 i inne błędy dają `error`.
- Klucz żądania i `AbortController` jak w `useVariantPackages`.

#### 5. Tokeny werdyktów

**File**: `src/styles/global.css`

**Intent**: Wariant B z makiety (https://claude.ai/artifact/FcSTDsHvLitZw4DWBHnRUr): „masz” na `success`, „ta sama substancja” i zastrzeżenie na `warning`, „nie masz” na `muted`.

**Contract**:

- `--success`, `--success-foreground`, `--warning`, `--warning-foreground` w `:root` i `.dark`.
- Mapowanie `--color-success*` i `--color-warning*` w `@theme inline`, żeby działały klasy `bg-success`, `text-success-foreground` itd.
- Wartości startowe z makiety:
  - jasne: success `oklch(0.95 0.05 155)` / `oklch(0.34 0.09 155)`, warning `oklch(0.96 0.07 88)` / `oklch(0.38 0.09 65)`;
  - ciemne: success `oklch(0.3 0.06 155)` / `oklch(0.9 0.08 155)`, warning `oklch(0.32 0.06 80)` / `oklch(0.92 0.09 88)`.
- Kontrast tekstu do tła co najmniej 4.5:1. Sprawdzić i w razie potrzeby skorygować jasność foregroundu.

#### 6. Komponent wyniku

**File**: `src/components/registry/MedicineCheckResult.tsx`

**Intent**: Pokazać werdykt, sekcje pozycji, zastrzeżenie i uwagę zgodnie z makietą B oraz decyzjami z planowania.

**Contract**:

- Props: `{ productId: number }`. Komponent sam używa `useMedicineCheck`.
- **Werdykt** (blok `role="status"`, ikona lucide i tekst; kolor tylko wzmacnia tekst):
  - są pozycje `variant`: „Masz ten lek” i liczba opakowań, `bg-success text-success-foreground`;
  - nie ma pozycji `variant`, ale są `substance`: „Masz lek z tą samą substancją czynną” i nazwy, `bg-warning text-warning-foreground`;
  - brak pozycji: „Nie masz tego leku”, `bg-muted`. Podtekst „Ani leku z tą samą substancją czynną” tylko przy `comparable: true`.
- **Sekcje:**
  - „W apteczce” z pozycjami pierwszej kategorii;
  - przy werdykcie „masz ten lek” i istniejących pozycjach `substance` druga sekcja „Także z tą samą substancją czynną”.
- **Zastrzeżenie** (FR-012) przy każdej sekcji lub werdykcie z pozycjami `substance`: „Ten sam skład czynny nie oznacza, że leki można zamieniać. Zapytaj farmaceutę lub lekarza.”
- **Uwaga o braku składu** przy `comparable: false`: „Rejestr nie podaje substancji czynnych tego leku, więc nie dało się sprawdzić leków z tą samą substancją.”
- **Wiersz pozycji:** nazwa, moc i postać, substancje, `packLabel`, „Ilość: …”, „Ważny do: …” (`formatExpiry`).
  - „przeterminowany” w `text-destructive`, gdy data jest wcześniejsza niż dziś: dla precyzji miesiąca liczy się koniec miesiąca, czyli `expiresOn < today`.
  - „wycofany z rejestru” w `text-muted-foreground`.
- **Stany pomocnicze:**
  - loading: „Sprawdzam apteczkę…”;
  - error: komunikat i przycisk „Spróbuj ponownie” (`retry`);
  - unauthorized: „Sesja wygasła” z linkiem do `/auth/signin`, jak w `MedicineSuggest`.
- Tylko klasy ról (`ui:scan`) i `cn()` do łączenia klas.

#### 7. Integracja z `/szukaj`

**File**: `src/components/registry/RegistrySearch.tsx`

**Intent**: Po wyborze karta szukanego leku zostaje, a pod nią pojawia się `MedicineCheckResult`. Karta pokazuje dane z wyniku (pełna moc), a do czasu odpowiedzi dane z podpowiedzi.

**Contract**:

- `<MedicineCheckResult key={selected.id} productId={selected.id} />` pod `VariantCard`.
- `VariantCard` dostaje opcjonalnie pełne dane `searched`, gdy wynik jest gotowy. Wystarczy przekazać je w górę callbackiem albo przenieść hook do `RegistrySearch`; implementujący wybiera prostsze rozwiązanie.
- Komunikat `sr-only` ogłasza werdykt, gdy jest gotowy.

#### 8. Strażnicy UI

**File**: `scripts/ui-scan.mjs`, `scripts/ui-shots.mjs`

**Intent**: Nowy widok objęty skanem literalnych kolorów. Nowe stany wyniku do zrzutów.

**Contract**:

- `GUARDED` += `src/components/registry/MedicineCheckResult.tsx`.
- W `ui-shots.mjs` nowe stany przez `context.route("**/api/kit/check**", route => route.fulfill({ json }))` ze stałymi odpowiedziami:
  - `check-have`: variant + substance;
  - `check-same`;
  - `check-none`;
  - `check-none-uncomparable`;
  - `check-error` (500);
  - `check-loading`: żądanie bez odpowiedzi.
- Istniejący stan `result` czeka dodatkowo na werdykt.

#### 9. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Pokryć endpoint i izolację kont na prawdziwej ścieżce.

**Contract**:

- `requestPacksOfFirstVariant` zapamiętuje także `id` wariantu (`kit.productId`).
- Nowe kroki:
  - „medicine check rejects anonymous user”: 401;
  - „medicine check rejects invalid product”: 400;
  - „medicine check reports an unknown product”: 404;
  - „medicine check finds the added medicine” (po dodaniu do apteczki): 200, pierwsza pozycja ma `match: "variant"` i `packageId === kit.packageId`;
  - „medicine check hides the medicine from another account” (`jar2`): 200 bez pozycji o tym `packageId`.

### Success Criteria:

#### Automated Verification:

- Type check przechodzi: `npx astro sync && npx astro check`
- Lint i skan UI przechodzą: `npm run lint && npm run ui:scan`
- Build przechodzi: `npm run build`
- Smoke przechodzi na lokalnej bazie z fixture'ami: `npm run smoke`
- Zrzuty stanów powstają bez błędu: `BASE_URL=http://localhost:4321 npm run ui:shots -- --label medicine-check`

#### Manual Verification:

- Na http://localhost:4321/szukaj z pełnym rejestrem i kilkoma lekami w apteczce (np. Ibuprom 400 z dwiema datami, Nurofen) widać trzy werdykty, dwie sekcje, zastrzeżenie, sortowanie po dacie i oznaczenie „przeterminowany”
- Werdykty są czytelne w szerokości 390 px i w trybie ciemnym; kontrast nowych tokenów wystarcza
- Wynik pojawia się bez odczuwalnego opóźnienia po wyborze podpowiedzi, a ładowanie listy (`npm run perf -- --profile slow`) nie pogarsza się względem ostatniego pomiaru
- Czytnik ekranu ogłasza werdykt po wyborze leku

**Implementation Note**: Po fazie i przejściu automatycznych kroków zatrzymaj się i zapytaj, czy ręczne sprawdzenia robi użytkownik, czy agent.

---

## Faza 3: Strona startowa i przekierowania

### Overview

`/szukaj` staje się wejściem do aplikacji (D4). Usunięcie ekranu startera i `/dashboard`.

### Changes Required:

#### 1. Middleware

**File**: `src/middleware.ts`

**Intent**: `/` nie ma własnej treści. Zalogowany trafia na `/szukaj`, niezalogowany na `/auth/signin`.

**Contract**:

- `PROTECTED_ROUTES = ["/szukaj", "/apteczka"]`.
- Dla `pathname === "/"` przekierowanie 302 według `locals.user`.
- Gdy Supabase nie jest skonfigurowany (`locals.user` zawsze `null`), `/` prowadzi na `/auth/signin`. Tam zostaje baner konfiguracji.

#### 2. Logowanie

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Po udanym logowaniu od razu `/szukaj`.

**Contract**: `context.redirect("/szukaj")` w miejscu `context.redirect("/")` (`:19`). Wylogowanie zostaje na `/` (`signout.ts:9`), a middleware przekierowuje dalej na logowanie.

#### 3. Usunięcie startera

**File**: `src/pages/dashboard.astro`, `src/components/Welcome.astro`, `src/pages/index.astro`

**Intent**: Usunąć martwy kod startera i `bg-cosmic` z drogi wejścia.

**Contract**:

- Usunięte: `dashboard.astro` i `Welcome.astro`.
- `index.astro` usunięty albo pusty. Middleware odpowiada wcześniej, więc wystarczy usunięcie, o ile Astro nie zwróci 404 przed middleware. Implementujący sprawdza to na buildzie.
- Jeśli `bg-cosmic` nie ma już użyć, usunąć `@utility bg-cosmic` z `global.css`, a regułę w `AGENTS.md` zostawić jako zakaz.

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Dostosować kroki do nowych ścieżek.

**Contract**:

- „home renders” → „home redirects anonymous user” (302 → `/auth/signin`).
- Usunąć kroki `/dashboard` (`:125`, `:143`, `:223`).
- „signin accepts correct password” oczekuje `location: "/szukaj"`, tak samo dla drugiego konta.
- Nowy krok „home redirects signed-in user” (302 → `/szukaj`).
- Po wylogowaniu „search page redirects after signout” (302 → `/auth/signin`).

#### 5. Dokumentacja

**File**: `AGENTS.md`, `README.md`

**Intent**: Usunąć odniesienia do `/dashboard` i do nieaktualnej ścieżki palety.

**Contract**:

- `AGENTS.md`:
  - „Protected page example: `src/pages/szukaj.astro`”;
  - linia o tokenach odsyła do `src/styles/global.css` (paleta w `context/archive/2026-10-07-search-view-tokens/palette.md`) i wymienia tokeny `success` / `warning`.
- `README.md:14`: status opisuje działające funkcje (wyszukiwanie, apteczka, sprawdzenie) zamiast „scaffold z `/dashboard`”.

### Success Criteria:

#### Automated Verification:

- Type check, lint i skan UI przechodzą: `npx astro sync && npx astro check && npm run lint && npm run ui:scan`
- Build przechodzi: `npm run build`
- Smoke przechodzi: `npm run smoke`
- W `src/` nie ma odniesień do `/dashboard` ani `Welcome`: `grep -rn "dashboard\|Welcome" src` zwraca pusto

#### Manual Verification:

- Wejście na http://localhost:4321/ bez sesji prowadzi na logowanie, a po zalogowaniu na `/szukaj`
- Wylogowanie z `/szukaj` kończy się na ekranie logowania, bez ekranu „10x Astro Starter”

**Implementation Note**: Po fazie zatrzymaj się na ręczne sprawdzenia jak wyżej. Po zamknięciu wszystkich faz uruchom `npm run roadmap:sync`.

---

## Testing Strategy

### Unit Tests:

- Brak runnera. Regułę D1–D3 pokrywa `scripts/medicine-check-check.mjs`: przypadki z Fazy 1, w tym ogólniki po obu stronach, pusty zestaw, D2, D3, RLS i sortowanie.

### Integration Tests:

- Smoke: 401, 400, 404, „masz” po dodaniu leku, brak cudzych pozycji, nowe przekierowania.
- `ui:shots`: stany wyniku wymuszone stałymi odpowiedziami.

### Manual Testing Steps:

1. Zaimportuj pełny rejestr lokalnie i dodaj do apteczki Ibuprom 400 (dwa opakowania, jedno z datą 03/2026), Nurofen 400 i Sortis.
2. Na `/szukaj` sprawdź Ibuprom 400: werdykt „masz”, opakowanie przeterminowane na górze, Nurofen w sekcji „także”, z zastrzeżeniem.
3. Sprawdź Atoris: „ta sama substancja” (Sortis) z zastrzeżeniem.
4. Sprawdź Apap: „nie masz” z podtekstem. Sprawdź Sinupret: „nie masz” z uwagą o braku składu.
5. Powtórz w 390 px i w trybie ciemnym.

## Performance Considerations

- Sprawdzenie to jedno zapytanie po wyborze, poza ścieżką ładowania listy. Zapas profilu slow z S-09 to ok. 350 ms, więc nic nie dochodzi do `/api/registry/search-list`.
- RPC porównuje szukany lek tylko z pozycjami apteczki jednego konta (dziesiątki wierszy). Zestawy substancji liczone są per pozycja, bez skanu całego rejestru. Klucz wariantu działa przez join po `kit_items → registry_packages → registry_products`, więc nowy indeks nie jest potrzebny.

## Migration Notes

- Migracja tylko dodaje funkcje, bez zmian w tabelach i danych. Wdrożenie kodu przed migracją daje błąd RPC, a endpoint odpowiada wtedy 500 i UI pokazuje błąd z ponowieniem.
- Usunięcie `/dashboard`: zakładki użytkowników na `/dashboard` dadzą 404. Akceptowalne, bo strona była nieosiągalna z UI.

## References

- Research: `context/changes/medicine-check/research.md` (D1–D4, pomiar)
- Makieta wyglądu werdyktów: https://claude.ai/artifact/FcSTDsHvLitZw4DWBHnRUr (wybrany wariant B)
- Klucz wariantu: `supabase/migrations/20261007120000_kit_items.sql:89-127`, `context/archive/2026-10-02-registry-search-suggestions/plan.md:61-63`
- Wzorce: `src/pages/api/registry/packages.ts`, `src/components/hooks/useVariantPackages.ts`, `scripts/registry-import-check.mjs`, `src/pages/apteczka.astro:91-106`
- PRD: `context/foundation/prd.md:84-90,165-170`; roadmapa: `context/foundation/roadmap.md:123-134`

## Addenda

Zmiany poza kontraktem faz, dopisane po implementacji (impl-review 2026-10-10).

- **Czyszczenie wyniku po zmianie tekstu (commit `3c974ae`).** `MedicineSuggest` dostał opcjonalny prop `onEdit`, wywoływany przy każdej zmianie tekstu przez użytkownika (wybór podpowiedzi go nie wywołuje). `RegistrySearch` czyści wtedy wybrany lek, więc karta i werdykt znikają, zamiast zostać pod inną wpisaną nazwą. `ui:shots` ma na to stan `edited-after-pick`.
- **Ogólniki po prefiksie (F1).** `medicine_check_is_generic` uznaje za ogólnik także każdą wartość zaczynającą się od „produkt ” lub „preparat ”, obok listy z kontraktu Fazy 1. Powód: w pełnym rejestrze są NPS spoza listy („Preparat witaminowy”, „Produkt witaminowy”, „Produkt odżywczy”, „Produkt immunostymulujący”), przez które Cernevit i Soluvit N dawały „ta sama substancja” mimo różnych składów. Prefiks trafia w rejestrze wyłącznie w nazwy klas (13 wartości NPS, 2 wartości substancji). Skrypt reguły ma na to osobny przypadek.
- **Ogłoszenie werdyktu (F2, F6).** Komunikat `sr-only` jest w `MedicineCheckResult`, a nie w `RegistrySearch`, i zawiera też zastrzeżenie oraz uwagę o braku składu. Widoczny blok werdyktu nie ma `role="status"` (ma `data-verdict`), żeby czytnik nie czytał werdyktu dwa razy.
- **Skrypt reguły tylko lokalnie (F3).** `medicine-check-check.mjs` kończy się kodem 2, gdy `DATABASE_URL` nie wskazuje lokalnej bazy.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguła sprawdzenia w bazie

#### Automated

- [x] 1.1 Migracja aplikuje się na czystej bazie — 6a60ade
- [x] 1.2 Skrypt reguły przechodzi lokalnie — 6a60ade
- [x] 1.3 Import i jego sprawdzenie nadal przechodzą — 6a60ade
- [x] 1.4 Lint przechodzi — 6a60ade

#### Manual

- [x] 1.5 Werdykty RPC dla par z researchu na pełnym rejestrze — 6a60ade
- [x] 1.6 Czas wywołania RPC na pełnym rejestrze pomijalny — 6a60ade

### Phase 2: Wynik sprawdzenia na /szukaj

#### Automated

- [x] 2.1 Type check przechodzi — 4e5da56
- [x] 2.2 Lint i skan UI przechodzą — 4e5da56
- [x] 2.3 Build przechodzi — 4e5da56
- [x] 2.4 Smoke przechodzi na lokalnej bazie z fixture'ami — 4e5da56
- [x] 2.5 Zrzuty stanów powstają bez błędu — 4e5da56

#### Manual

- [x] 2.6 Trzy werdykty, sekcje, zastrzeżenie i sortowanie na /szukaj — 4e5da56
- [x] 2.7 Czytelność w 390 px i w trybie ciemnym — 4e5da56
- [x] 2.8 Brak odczuwalnego opóźnienia i regresji ładowania listy — 4e5da56
- [x] 2.9 Czytnik ekranu ogłasza werdykt — 4e5da56

### Phase 3: Strona startowa i przekierowania

#### Automated

- [x] 3.1 Type check, lint i skan UI przechodzą — 6ceb587
- [x] 3.2 Build przechodzi — 6ceb587
- [x] 3.3 Smoke przechodzi — 6ceb587
- [x] 3.4 Brak odniesień do /dashboard i Welcome w src — 6ceb587

#### Manual

- [x] 3.5 Wejście na / prowadzi na logowanie lub /szukaj — 6ceb587
- [x] 3.6 Wylogowanie kończy się na ekranie logowania — 6ceb587
