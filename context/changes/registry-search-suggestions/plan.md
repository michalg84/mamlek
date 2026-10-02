# S-01: Wyszukiwanie leku w rejestrze z podpowiedziami — plan implementacji

## Overview

Użytkownik po zalogowaniu wpisuje pierwsze litery i widzi podpowiedzi z Rejestru Produktów Leczniczych: nazwa produktu z mocą i postacią, z pierwszeństwem nazwy produktu przed nazwą powszechnie stosowaną i substancjami czynnymi (FR-002, US-01). Podpowiedzi działają lokalnie w przeglądarce na liście wariantów leków, którą buduje import rejestru, a przeglądarka pobiera ją raz i trzyma w cache do następnego importu. Ten sam komponent podpowiedzi posłuży potem S-02, S-03 i S-04.

## Current State Analysis

- Tabele rejestru istnieją (`supabase/migrations/20261001120000_registry_tables.sql:21-148`), są tylko do odczytu dla roli `authenticated` (`:152-175`), nie mają żadnego indeksu wyszukiwania ani rozszerzeń (`pg_trgm`, `unaccent`).
- Import (`scripts/registry-import.mjs:173-255`) działa w jednej transakcji jako właściciel tabel; ostatni krok przed `commit` to wpis do `registry_imports` (`:243-254`).
- Na produkcji dane rejestru są już zaimportowane (F-01, ok. 20 tys. aktywnych produktów). Migracje produkcyjne stosuje się ręcznie przez `npx supabase db push` (README, F-01 plan faza 3).
- Brak endpointów domenowych, `src/lib/services/`, `src/types.ts`, `src/components/hooks/` (AGENTS.md). Chronione trasy: `PROTECTED_ROUTES = ["/dashboard"]` (`src/middleware.ts:4`); `createClient` zwraca `null` bez konfiguracji (`src/lib/supabase.ts:5-7`).
- Dane (zrzut 2026-10-02, research): 20 246 produktów ludzkich, 16 165 wariantów (nazwa+moc+postać bez rozróżniania wielkości liter); 25% produktów to duplikaty wariantu, głównie import równoległy (`IR`). Lista wariantów z polami do wyszukiwania waży ok. 117–275 KB po kompresji (pomiar orientacyjny, bez nazw powszechnych i substancji w krotce).
- Brak runnera testów jednostkowych; automatyczne testy to `scripts/smoke.mjs` i `scripts/registry-import-check.mjs` w jobie `smoke` (`.github/workflows/ci.yml:36-58`).

## Desired End State

- Każdy udany import zostawia w bazie aktualną listę podpowiedzi (jeden wiersz, wersja podbijana przy każdym przebudowaniu listy), spójną z danymi tej samej transakcji. Migracja buduje listę z danych już obecnych na produkcji.
- `GET /api/registry/search-list` oddaje listę zalogowanemu użytkownikowi; przy aktualnej wersji przeglądarka trzyma ją w cache bez ponownego pobierania.
- Chroniona strona `/szukaj` (link z dashboardu): pole z podpowiedziami działającymi bez sieci po pobraniu listy, wybór pokazuje kartę wariantu (nazwa, moc, postać, nazwa powszechna, substancje czynne).
- Weryfikacja: CI (`smoke`) sprawdza listę po imporcie fixture'ów i dostęp do endpointu; ręczny pomiar na pełnym imporcie zapisany w Progress.

### Key Discoveries:

- Import = jedyny pisarz tabel rejestru (`registry_tables.sql:5-7`); budowa listy w jego transakcji nie wprowadza drugiego pisarza ani okna niespójności.
- Supabase nadaje rolom API `execute` na nowych funkcjach w `public` — trzeba odebrać, jak F-01 odebrało zapis do tabel (`registry_tables.sql:188-193`).
- Fixture'y (`scripts/fixtures/rpl-sample-v{1,2}.xml`) nie mają duplikatów wariantu — regułę zwijania trzeba sprawdzić na sztucznych wierszach.
- Plan Workers Paid (`context/foundation/infrastructure.md:15`); mimo to lista jest przechowywana jako gotowy tekst JSON, żeby Worker nie parsował i nie serializował ~1 MB przy każdym żądaniu.

## What We're NOT Doing

- Zapytań wyszukiwania do bazy przy każdym znaku, rozszerzeń `pg_trgm`/`unaccent` i indeksów tekstowych (wybrana architektura: lista w przeglądarce).
- Tolerancji literówek (`ibupom` → brak wyników). Można dołożyć później bez zmiany formatu listy.
- Pokazywania produktów usuniętych z rejestru (`removed_at IS NOT NULL`). Produkty z wygasłym pozwoleniem zostają.
- Rozwijania zwiniętego wariantu do listy importerów; wybór importera z pudełka.
- Dodawania do apteczki (S-02), sprawdzenia leku (S-03), importu CSV (S-04), poziomów dopasowania substancji (S-06).
- Wyszukiwania po `previous_name`, podmiocie odpowiedzialnym, kodach ATC.
- Daty aktualizacji rejestru na ekranie i harmonogramu importu (S-07).
- Runnera testów jednostkowych i twardego limitu rozmiaru listy w CI (fixture'y mają 12 produktów, więc próg na nich nic nie mówi).
- Pracy offline po przeładowaniu strony bez sieci (service worker) — cache HTTP przeglądarki wystarcza na S-01.

## Implementation Approach

Baza → API → przeglądarka. Funkcja SQL buduje listę wariantów z aktywnych produktów i zapisuje ją jako tekst JSON w tabeli z jednym wierszem; wywołują ją import (w swojej transakcji) i migracja (jednorazowo). Endpoint podaje tekst bez przetwarzania z nagłówkami cache zależnymi od wersji. Strona renderuje po stronie serwera tylko wersję listy; wyspa React pobiera listę asynchronicznie, buduje indeks znormalizowanych słów raz i przeszukuje go lokalnie przy każdym znaku.

### Reguła dopasowania (uzgodniona)

- Normalizacja zapytania i pól: małe litery, bez znaków diakrytycznych (rozkład NFD i usunięcie znaków łączących, plus `ł` → `l`). Słowa = ciągi `[a-z0-9]` po normalizacji.
- Zapytanie poniżej 3 znaków (po normalizacji, bez separatorów) → brak listy, tylko podpowiedź „wpisz co najmniej 3 litery" (`no spa` ma 5 znaków, więc 2-literowe słowo działa z kolejnym słowem).
- Poziom wariantu wyznacza **pierwsze** słowo zapytania (pierwszy pasujący poziom wygrywa):
  - **A** — pierwsze słowo zapytania jest początkiem pierwszego słowa nazwy produktu,
  - **B** — jest początkiem innego słowa nazwy produktu,
  - **C** — jest początkiem słowa nazwy powszechnie stosowanej,
  - **D** — jest początkiem słowa nazwy którejś substancji czynnej.
- Każde **kolejne** słowo zapytania musi być początkiem jakiegoś słowa w polu tego poziomu albo w mocy lub postaci; inaczej wariant odpada na tym poziomie (i jest sprawdzany na następnym).
- Kolejność: poziom A, B, C, D; w poziomie krótsza nazwa produktu wyżej (liczba znaków nazwy oryginalnej), potem nazwa alfabetycznie po polsku (`Intl.Collator("pl")`), potem moc tym samym collatorem, potem `id`. Kolejność w poziomie nie zależy od zapytania, więc lista jest sortowana raz przy budowie indeksu, a nie przy każdym znaku. Maksymalnie 20 wyników; gdy pasujących wariantów jest więcej, pod listą komunikat „Pokazano 20 z N — dopisz kolejne słowo, np. część nazwy" (N = liczba wszystkich pasujących wariantów).
- Przykłady oczekiwane (dane 2026-10-02): `max` → najpierw Maxon, Maxigra (A), potem m.in. Ibum Max, Entus Max (B); `zel` i `żel` → identyczny wynik, m.in. Olfen żel; `paracetamol` → Paracetamol DOZ… (A), Metafen Paracetamol (B), Apap (C, _Paracetamolum_); `ibuprom 400` → Ibuprom Max · 400 mg, Ibuprom Max Sprint · 400 mg, bez Ibuprom · 200 mg; `dla dzieci` → Ibuprom dla dzieci (B); `ibupom` → brak wyników; `ibu 400` → 53 pasujące warianty, wszystkie z „400" w mocy lub nazwie, m.in. Ibuprom Max · 400 mg; widać 20 i komunikat „Pokazano 20 z 53…"; `ibu max` → 17 wariantów (Ibum Max, Ibuprom Max, Ibuprom Max Sprint…), bez komunikatu.

### Zwijanie duplikatów (uzgodnione)

- Klucz wariantu: `lower(name)`, `lower(coalesce(strength, ''))`, `lower(coalesce(pharmaceutical_form, ''))`, tylko produkty z `removed_at IS NULL`.
- Reprezentant: najpierw produkty o `procedure_type` różnym od `'IR'` (także `NULL`), potem najniższe `id`. Podpowiedź niesie `id` reprezentanta oraz jego nazwę, moc, postać, nazwę powszechną i substancje (w kolejności `position`).
- S-03 rozpozna „ten sam lek" po kluczu wariantu liczonym w bazie, nie po `id` — reprezentant może się zmienić po imporcie, gdy pojawi się nowy oryginał.

## Critical Implementation Details

- **Kolejność w imporcie**: funkcja budująca listę potrzebuje `registry_imports.id` bieżącego importu, więc wywołanie idzie po wpisie do `registry_imports` (krok 8), przed `commit`. Błąd budowy listy wycofuje cały import — tak ma być (lista nigdy nie rozjeżdża się z danymi).
- **Prawa do funkcji**: `revoke execute … from public, anon, authenticated` — inaczej każdy zalogowany mógłby przebudowywać listę przez `rpc`. Funkcja z `set search_path = ''` i w pełni kwalifikowanymi nazwami tabel.
- **Moc w liście**: przycięta do 80 znaków z `…` (276 produktów ma dłuższą); pełna moc pozostaje w `registry_products`.

## Phase 1: Lista podpowiedzi w bazie

### Overview

Tabela z jedną bieżącą listą, funkcja budująca ją z aktywnych produktów, wywołanie z importu i z migracji, sprawdzenie w CI.

### Changes Required:

#### 1. Migracja: tabela i funkcja listy podpowiedzi

**File**: `supabase/migrations/20261002120000_registry_search_list.sql`

**Intent**: Przechowywać gotową listę wariantów dla przeglądarki i budować ją w jednym miejscu (SQL), wywoływanym przez import i jednorazowo przez migrację, żeby produkcja dostała listę bez ponownego importu.

**Contract**:

- Tabela `public.registry_search_list`: `id smallint primary key default 1 check (id = 1)`, `version bigint not null` (wersja listy dla cache przeglądarki), `import_id bigint not null references public.registry_imports (id)` (informacyjnie), `snapshot_date date not null`, `variant_count int not null`, `payload text not null`, `built_at timestamptz not null default now()`. Komentarze do tabeli i kolumn jak w migracji F-01.
- Funkcja `public.registry_refresh_search_list() returns void`, `security invoker`, `set search_path = ''`: bierze najnowszy wiersz `registry_imports` (max `id`); jeśli brak — nic nie robi; inaczej upsert wiersza `id = 1` z `import_id`, `snapshot_date`, `variant_count` i `payload`. `version` = 1 przy pierwszym wpisie, przy każdym kolejnym wywołaniu poprzednia wartość + 1 — także gdy wywołuje ją migracja zmieniająca funkcję bez nowego importu, żeby przeglądarki nie trzymały w cache (`immutable`) listy w starym kształcie.
- `payload` (tekst JSON, budowany `jsonb_build_object`/`jsonb_agg` i rzutowany na `text`): `{"version": <version>, "snapshotDate": "YYYY-MM-DD", "variants": [[id, name, strength, form, commonName, [substance, …]], …]}`; `id` jako liczba, brakujące pola jako `null`, `strength` przycięte do 80 znaków z `…`, substancje reprezentanta w kolejności `position`. Kolejność `variants` dowolna (sortuje przeglądarka).
- Zwijanie i reprezentant zgodnie z sekcją „Zwijanie duplikatów".
- RLS włączony; polityka `select to authenticated using (true)`; `grant select … to authenticated`; `revoke insert, update, delete, truncate, references, trigger … from anon, authenticated`; `revoke execute on function public.registry_refresh_search_list() from public, anon, authenticated`.
- Na końcu migracji: `select public.registry_refresh_search_list();` (na pustej bazie lokalnej no-op).

#### 2. Import wywołuje budowę listy

**File**: `scripts/registry-import.mjs`

**Intent**: Każdy udany import zostawia listę spójną ze swoimi danymi, w tej samej transakcji.

**Contract**: Nowy krok 9 po wpisie do `registry_imports` (`:243-254`), przed `commit`: `select public.registry_refresh_search_list()`. Podsumowanie importu na stdout dopisuje liczbę wariantów z `registry_search_list.variant_count`. Komentarz nagłówkowy pliku wymienia nowy krok.

#### 3. Sprawdzenie listy w CI

**File**: `scripts/registry-import-check.mjs`

**Intent**: Pilnować, że lista po imporcie fixture'ów jest aktualna i poprawna, a reguła zwijania działa także na duplikatach, których fixture'y nie mają.

**Contract**: Nowe sprawdzenia w istniejącej tablicy `checks`:

- wiersz `registry_search_list` istnieje, `import_id` = `max(registry_imports.id)`, `snapshot_date` = data ostatniego importu;
- `variant_count` = liczba różnych kluczy wariantu wśród aktywnych produktów (policzona osobnym zapytaniem) = długość `payload.variants`; `payload.version` = `version`;
- w `payload` nie ma usuniętego produktu (`CRESTOR`) ani weterynaryjnego (`VARENZIN`); nazwa `SINUPRET` jest nazwą z v2;
- jako `authenticated` (wzorzec `countAs`) widać 1 wiersz, jako `anon` 0; wywołanie `registry_refresh_search_list()` jako `authenticated` kończy się błędem uprawnień;
- test syntetyczny w transakcji wycofywanej na końcu: dwa nowe produkty o tej samej nazwie/mocy/postaci różniące się wielkością liter (niższe `id` z `procedure_type = 'IR'`, wyższe z `'NAR'`) plus trzeci tego samego wariantu z `removed_at` ustawionym; po wywołaniu funkcji wariant występuje raz, z `id` produktu `NAR`, liczba wariantów wzrosła o 1, a `version` o 1.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` stosuje obie migracje bez błędów
- Import fixture'ów v1, v1, v2 kończy się sukcesem i wypisuje liczbę wariantów
- `node scripts/registry-import-check.mjs` przechodzi, łącznie z nowymi sprawdzeniami listy
- `npm run lint` przechodzi

#### Manual Verification:

- Pełny import aktualnego RPL lokalnie: `variant_count` około 16 tys., rozmiar `payload` (`octet_length`) zanotowany w Progress
- Po `npx supabase db push` na produkcji wiersz `registry_search_list` istnieje i wskazuje ostatni import (bez ponownego importu)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Migracja produkcyjna wymaga zatwierdzenia przez człowieka (`context/foundation/infrastructure.md:84`).

---

## Phase 2: Endpoint i serwis listy

### Overview

Typy, serwis odczytu i endpoint `GET` oddający listę zalogowanemu użytkownikowi z cache zależnym od wersji.

### Changes Required:

#### 1. Typy współdzielone

**File**: `src/types.ts` (nowy)

**Intent**: Jedno źródło kształtu listy dla serwisu, endpointu, hooka i komponentu.

**Contract**: `RegistrySearchListVersion { version: number; snapshotDate: string }`; `RegistryVariantTuple = [id: number, name: string, strength: string | null, form: string | null, commonName: string | null, substances: string[]]`; `RegistrySearchListPayload { version: number; snapshotDate: string; variants: RegistryVariantTuple[] }`; `RegistryVariant { id; name; strength; form; commonName; substances }` (obiekt dekodowany z krotki).

#### 2. Serwis listy

**File**: `src/lib/services/registry-search-list.ts` (nowy)

**Intent**: Zamknąć zapytania do `registry_search_list` w jednym miejscu, używanym przez stronę i endpoint.

**Contract**: `getSearchListVersion(supabase): Promise<RegistrySearchListVersion | null>` — wybiera tylko `version`, `snapshot_date` (bez `payload`); `getSearchListPayload(supabase): Promise<{ version: number; payload: string } | null>` — zwraca `payload` jako tekst, bez parsowania. Błąd Supabase → wyjątek z komunikatem; brak wiersza → `null`.

#### 3. Endpoint listy

**File**: `src/pages/api/registry/search-list.ts` (nowy)

**Intent**: Podać listę przeglądarce tylko po zalogowaniu i pozwolić jej trzymać listę w cache do następnego importu.

**Contract**: `export const GET: APIRoute`. Parametr `v` (opcjonalny, dodatnia liczba całkowita) walidowany zod z `astro/zod`. Odpowiedzi: `createClient` zwraca `null` → 503; `locals.user` brak → 401; zły `v` → 400; brak listy → 404; inaczej 200 z treścią `payload` 1:1, `Content-Type: application/json; charset=utf-8`, `Cache-Control: private, max-age=31536000, immutable` gdy `v` równe wersji listy, w przeciwnym razie `Cache-Control: private, no-cache`. Błędy w formacie `{ error: string }`.

#### 4. Smoke test endpointu

**File**: `scripts/smoke.mjs`

**Intent**: Pilnować w CI dostępu do listy dla anonimowego i zalogowanego użytkownika.

**Contract**: `request()` zwraca dodatkowo `headers` i `body` (tekst), a oczekiwanie kroku dostaje opcjonalny predykat `check(actual)`; dotychczasowe kroki bez zmian. Nowe kroki: anonimowe `GET /api/registry/search-list` → 401 (przed zalogowaniem); po zalogowaniu → 200, treść parsuje się jako JSON z tablicą `variants` o długości > 0; `GET /api/registry/search-list?v=abc` → 400. Nagłówek `Cache-Control` z `immutable` dla `v` równego `version` z odpowiedzi.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` i `npx astro check` bez błędów
- `npm run lint` przechodzi
- `npm run build` przechodzi
- `npm run smoke` przechodzi lokalnie na `npm run preview` z zaimportowanymi fixture'ami, łącznie z nowymi krokami endpointu

#### Manual Verification:

- W przeglądarce po zalogowaniu `/api/registry/search-list?v=<wersja>` zwraca listę, a ponowne wejście korzysta z cache przeglądarki (DevTools → Network: „disk cache")
- Rozmiar odpowiedzi po kompresji na pełnym imporcie zanotowany w Progress

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Wyszukiwanie w przeglądarce i strona /szukaj

### Overview

Czysta funkcja dopasowania, hook pobierający listę, dostępny komponent podpowiedzi wielokrotnego użytku i chroniona strona z kartą wybranego wariantu.

### Changes Required:

#### 1. Dopasowanie i ranking

**File**: `src/lib/registry-search.ts` (nowy)

**Intent**: Zaimplementować uzgodnioną regułę dopasowania jako czysty kod bez zależności od Reacta, żeby S-02/S-03/S-04 używały dokładnie tej samej logiki.

**Contract**: `normalizeText(text: string): string`; `buildSearchIndex(payload: RegistrySearchListPayload): RegistrySearchIndex` — dekoduje krotki, liczy raz znormalizowane słowa nazwy, nazwy powszechnej, substancji, mocy i postaci i raz sortuje warianty według kolejności z sekcji „Reguła dopasowania"; `searchVariants(index, query, limit = 20): { results: RegistryVariant[]; total: number }` (`total` = liczba wszystkich pasujących wariantów przed obcięciem do `limit`) — jedno przejście po posortowanych wariantach, przydział poziomu A–D, zachowanie pierwszych `limit` według poziomu, bez sortowania przy każdym znaku; stałe `MIN_QUERY_LENGTH = 3`, `MAX_RESULTS = 20`.

#### 2. Hook listy

**File**: `src/components/hooks/useRegistrySearchList.ts` (nowy)

**Intent**: Pobrać listę asynchronicznie po wyrenderowaniu strony i zbudować indeks raz.

**Contract**: `useRegistrySearchList(version: number)` → `{ status: "loading" | "ready" | "unauthorized" | "error"; index: RegistrySearchIndex | null; retry(): void }`; pobiera `/api/registry/search-list?v=${version}` (przeglądarka korzysta z cache HTTP), przerywa pobieranie przy odmontowaniu. Odpowiedź 401 (sesja wygasła) → `unauthorized`; inne błędy → `error`.

#### 3. Komponent podpowiedzi

**File**: `src/components/registry/MedicineSuggest.tsx` (nowy)

**Intent**: Jedno pole z listą podpowiedzi do użycia na trzech ekranach (tu: `/szukaj`; później formularz S-02, sprawdzenie S-03, zatwierdzenie importu S-04).

**Contract**: Props `{ version: number; onSelect(variant: RegistryVariant): void; label?: string }`. Wzorzec ARIA combobox (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `role="listbox"`/`option`); klawisze ↑ ↓ Enter Esc; dotyk wybiera pozycję. Stany: ładowanie listy (pole aktywne, komunikat „Wczytywanie listy leków…"), mniej niż 3 znaki (podpowiedź), brak wyników („Brak leku o takiej nazwie w rejestrze"), lista obcięta (`total` > 20: pod listą „Pokazano 20 z {total} — dopisz kolejne słowo, np. część nazwy", ogłaszane też czytnikowi ekranu), błąd pobrania (komunikat i przycisk „Spróbuj ponownie"), sesja wygasła (`unauthorized`: „Sesja wygasła — zaloguj się ponownie" z linkiem do `/auth/signin`, bez przycisku ponawiania). Wiersz podpowiedzi: nazwa pogrubiona, w drugiej linii moc · postać; długie teksty zawijane/przycinane bez poziomego przewijania. Klasy przez `cn()`; bez dyrektyw Next.

#### 4. Strona wyszukiwania

**Files**: `src/pages/szukaj.astro` (nowy), `src/components/registry/RegistrySearch.tsx` (nowy), `src/middleware.ts`, `src/pages/dashboard.astro`

**Intent**: Dać S-01 widoczny, sprawdzalny na telefonie ekran, który S-03 rozbuduje o wynik sprawdzenia.

**Contract**: `/szukaj` dopisane do `PROTECTED_ROUTES`. Strona pobiera wersję przez `getSearchListVersion`; brak listy → komunikat „Rejestr leków nie jest jeszcze wczytany"; wyjątek przy odczycie (np. aplikacja wdrożona przed `db push` migracji) → komunikat „Nie udało się wczytać rejestru leków, spróbuj później" zamiast strony błędu 500; inaczej wyspa `RegistrySearch` (`client:load`) z `MedicineSuggest` i kartą wybranego wariantu: nazwa, moc z listy (do 80 znaków z „…" — 276 produktów, np. Botox, Multimel; pełną moc pokaże S-03 z bazy), postać, nazwa powszechnie stosowana, lista substancji czynnych. Dashboard dostaje link „Szukaj leku" do `/szukaj`. Układ mobilny: bez powiększania i poziomego przewijania (NFR).

#### 5. Smoke test strony

**File**: `scripts/smoke.mjs`

**Intent**: Pilnować ochrony i renderowania nowej trasy.

**Contract**: `/szukaj` anonimowo → 302 do `/auth/signin`; po zalogowaniu → 200.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` i `npx astro check` bez błędów
- `npm run lint` przechodzi
- `npm run build` przechodzi
- `npm run smoke` przechodzi, łącznie z krokami `/szukaj`

#### Manual Verification:

- Na pełnym imporcie przykłady z sekcji „Reguła dopasowania" dają opisane wyniki (`max`, `zel`/`żel`, `paracetamol`, `ibuprom 400`, `dla dzieci`, `ibupom`)
- „Sortis 20 · 20 mg · tabletki powlekane" pojawia się jako jedna podpowiedź, a karta wskazuje produkt nie-IR
- Obsługa klawiaturą (↑ ↓ Enter Esc) i dotykiem działa; czytnik ekranu ogłasza liczbę/aktywną podpowiedź
- Chrome DevTools (Slow 4G, CPU 6x slowdown): czas od wejścia na `/szukaj` do gotowości listy oraz opóźnienie podpowiedzi po znaku zanotowane w Progress; wpisywanie pozostaje płynne
- Na telefonie: lista ładuje się, podpowiedzi działają po wyłączeniu sieci (po pobraniu listy), brak poziomego przewijania
- `ibu 400` pokazuje 20 podpowiedzi i komunikat „Pokazano 20 z 53…"; po dopisaniu `max` komunikat znika, a lista zawiera Ibuprom Max · 400 mg

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Brak runnera testów jednostkowych w projekcie (świadomie poza zakresem). Reguła dopasowania jest sprawdzana ręcznie na przykładach z sekcji „Reguła dopasowania" na pełnym imporcie.

### Integration Tests:

- `scripts/registry-import-check.mjs`: lista po imporcie fixture'ów, wykluczenia, uprawnienia, zwijanie na danych syntetycznych.
- `scripts/smoke.mjs`: endpoint (401/400/200, cache) i strona (302/200).

### Manual Testing Steps:

1. `npx supabase db reset`, pełny import aktualnego RPL (`npm run registry:import`), zanotować `variant_count` i rozmiar `payload`.
2. Zalogować się, wejść na `/szukaj`, sprawdzić przykłady dopasowania i Sortis 20.
3. DevTools: Slow 4G + CPU 6x — czas gotowości listy i płynność wpisywania; drugie wejście z cache.
4. Telefon: ładowanie, wyłączenie sieci po pobraniu listy, wpisywanie, brak poziomego przewijania.

## Performance Considerations

- Lista pobierana raz na wersję importu; cache przeglądarki `immutable` przy zgodnej wersji. Rozmiar po kompresji do zmierzenia (oczekiwany rząd 150–300 KB); Cloudflare kompresuje odpowiedzi JSON.
- Indeks znormalizowanych słów i kolejność wariantów budowane raz po pobraniu; wyszukiwanie przy każdym znaku to liniowe przejście po ok. 16 tys. wariantów z wczesnym odrzuceniem, bez sortowania — bez debounce, chyba że pomiar na CPU 6x pokaże zacinanie.
- Endpoint nie parsuje JSON (tekst z bazy 1:1).

## Migration Notes

- Migracja jest addytywna (nowa tabela i funkcja); na produkcji buduje listę z istniejących danych w trakcie `db push`. Rollback: `drop table public.registry_search_list; drop function public.registry_refresh_search_list();` oraz cofnięcie kroku 9 w imporcie (import bez funkcji by się wywrócił — kolejność wdrożenia: migracja przed nowym importem).
- Workflow produkcyjnego importu (`.github/workflows/registry-import.yml`) nie wymaga zmian — używa `scripts/registry-import.mjs` z repo.

## References

- Research: `context/changes/registry-search-suggestions/research.md`
- Roadmapa: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md:142` (FR-002), `:188-198` (NFR)
- Migracja F-01: `supabase/migrations/20261001120000_registry_tables.sql`
- Import: `scripts/registry-import.mjs:173-255`
- Wzorzec sprawdzeń: `scripts/registry-import-check.mjs`, `scripts/smoke.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Lista podpowiedzi w bazie

#### Automated

- [x] 1.1 `npx supabase db reset` stosuje obie migracje bez błędów
- [x] 1.2 Import fixture'ów v1, v1, v2 kończy się sukcesem i wypisuje liczbę wariantów
- [x] 1.3 `node scripts/registry-import-check.mjs` przechodzi, łącznie z nowymi sprawdzeniami listy
- [x] 1.4 `npm run lint` przechodzi

#### Manual

- [x] 1.5 Pełny import aktualnego RPL lokalnie: `variant_count` około 16 tys., rozmiar `payload` zanotowany w Progress
  - Pomiar (zrzut 2026-10-02, import 23 s): `variant_count` 16 165 (= liczba różnych kluczy wariantu aktywnych produktów, 1 050 kluczy zwiniętych z duplikatów); `payload` 2 052 156 B (2,0 MB) surowo, 340 KB gzip -6, 209 KB brotli; 273 mocy przyciętych z „…". Brotli mieści się w oczekiwanych 150–300 KB, gzip ok. 13% powyżej — realny rozmiar odpowiedzi do zmierzenia w fazie 2 (2.6).
- [x] 1.6 Po `npx supabase db push` na produkcji wiersz `registry_search_list` istnieje i wskazuje ostatni import

### Phase 2: Endpoint i serwis listy

#### Automated

- [ ] 2.1 `npx astro sync` i `npx astro check` bez błędów
- [ ] 2.2 `npm run lint` przechodzi
- [ ] 2.3 `npm run build` przechodzi
- [ ] 2.4 `npm run smoke` przechodzi lokalnie, łącznie z nowymi krokami endpointu

#### Manual

- [ ] 2.5 Po zalogowaniu endpoint zwraca listę, a ponowne wejście korzysta z cache przeglądarki
- [ ] 2.6 Rozmiar odpowiedzi po kompresji na pełnym imporcie zanotowany w Progress

### Phase 3: Wyszukiwanie w przeglądarce i strona /szukaj

#### Automated

- [ ] 3.1 `npx astro sync` i `npx astro check` bez błędów
- [ ] 3.2 `npm run lint` przechodzi
- [ ] 3.3 `npm run build` przechodzi
- [ ] 3.4 `npm run smoke` przechodzi, łącznie z krokami `/szukaj`

#### Manual

- [ ] 3.5 Przykłady dopasowania dają opisane wyniki na pełnym imporcie
- [ ] 3.6 Sortis 20 jako jedna podpowiedź, karta wskazuje produkt nie-IR
- [ ] 3.7 Obsługa klawiaturą, dotykiem i czytnikiem ekranu działa
- [ ] 3.8 Pomiar w DevTools (Slow 4G, CPU 6x) zanotowany, wpisywanie płynne
- [ ] 3.9 Na telefonie: podpowiedzi działają bez sieci po pobraniu listy, brak poziomego przewijania
- [ ] 3.10 Komunikat o obciętej liście dla `ibu 400` znika po dopisaniu kolejnego słowa
