---
date: 2026-11-04T17:02:28+01:00
researcher: michalg84 (z Claude Code)
git_commit: ee2941312d6d5416c07757e5c398834396fe5b3e
branch: main
repository: mamlek
topic: "S-05 kit-browse-edit: co istnieje i czego potrzeba, żeby przeglądać apteczkę, zmieniać i usuwać pozycje oraz poprawiać ilość wprost na liście"
tags: [research, kit, apteczka, api, rls, migration, ui, testing]
status: complete
last_updated: 2026-11-04
last_updated_by: michalg84 (z Claude Code)
---

# Research: S-05 kit-browse-edit — przegląd i edycja apteczki

**Date**: 2026-11-04T17:02:28+01:00
**Researcher**: michalg84 (z Claude Code)
**Git Commit**: ee2941312d6d5416c07757e5c398834396fe5b3e (main; kotwice `file:line` w `src/`, `tests/`, `scripts/` dotyczą tego commita)
**Branch**: main
**Repository**: mamlek

## Research Question

Wycinek S-05 (`context/foundation/roadmap.md:155-168`, FR-005 w `context/foundation/prd.md:150`): użytkownik przegląda całą apteczkę na jednym ekranie, zmienia i usuwa pozycje oraz poprawia pozostałą ilość bezpośrednio na liście. Co już jest w kodzie, jakie decyzje z wcześniejszych zmian obowiązują, jakie wzorce (API, RLS, testy, UI) nowa praca musi powtórzyć i co zostaje do rozstrzygnięcia w planie?

## Summary

- **Dwie sprawy produktowe przed planem.** (1) S-12 `kit-quantity-semantics` ma niewiadomą z `Block: yes` o znaczeniu kolumny `quantity` (`roadmap.md:264`), a Stream G mówi „najlepiej przed `S-05` (edycja ilości na liście)” (`roadmap.md:70`). Edycja ilości na liście odziedziczy to znaczenie. (2) Ilość 0 („pusta paczka liczy się jako »masz«”) czeka na „Decyzja dla S-05” (`context/archive/2026-10-10-testing-check-verdict-correctness/plan.md:50`), a niewiadomych S-05 w roadmapie tego punktu nie ma.
- **Dziś lista jest tylko do odczytu.** `/apteczka` renderuje listę w Astro po stronie serwera (`src/pages/apteczka.astro:110-138`), bez znacznika przeterminowania. Grep `src/` z 2026-11-04 nie znalazł żadnego `.update(`, `.delete(` ani `.upsert(` (0 trafień). `src/pages/api/kit/` ma tylko `index.ts` (POST), `import.ts` (POST) i `check.ts` (GET).
- **Baza jest gotowa na edycję i usuwanie.** RLS ma osobne polityki `update` (`using` + `with check`) i `delete` dla właściciela, a `authenticated` ma uprawnienia DML (`supabase/migrations/20261007120000_kit_items.sql:56-76`). Brakuje triggera `updated_at`. Recenzja S-02 przekazała go do migracji S-05 (`context/archive/2026-10-07-add-medicine-to-kit/reviews/impl-review.md:96-98`, F6).
- **Granice zapisu sprawdza tylko API.** Limit ilości opakowania i precyzję daty pilnuje API, nie baza. To przyjęta luka F2 (`impl-review.md:37-54`, przypięta testami `tests/db/kit-access.test.ts:204-230`). Trasa edycji musi więc sama sprawdzić `0…MAX_QUANTITY`, limit `packQuantity` i zakres daty, najlepiej tym samym schematem zod co POST (`src/lib/kit-request.ts:5-19`).
- **Testy mają gotowy wzorzec.** `test-plan.md:187` wprost przypisuje S-05 dopisanie tras edycji i usuwania do `tests/api/kit-input.test.ts` (granice) oraz `tests/api/kit-access.test.ts` (cudzy wiersz: 404/403, wiersz właściciela nienaruszony). Na poziomie bazy UPDATE i DELETE z drugiego konta są już pokryte (`tests/db/kit-access.test.ts:78-94`).
- **Pozostałe niewiadome S-05 z roadmapy:** znacznik przeterminowania przez `isExpired` (`roadmap.md:164`), brak limitu listy (`roadmap.md:165`), trigger `updated_at` (`roadmap.md:166`). Wszystkie mają rozstrzygnięcie albo wskazówkę opisaną niżej.

## Detailed Findings

### 1. Strona `/apteczka` i odczyt listy

- `apteczka.astro:32-52`: po stronie serwera równolegle `getSearchListVersion` i `listKitItems`. Błąd daje komunikat „Nie udało się wczytać apteczki, spróbuj później” (`:73-77`) i `console.error` (`:47-51`).
- Lista (`:110-138`): `ul.divide-border divide-y rounded-lg border`, wiersz z nazwą, mocą · postacią, `packLabel`, „Ilość: …” (`formatQuantity`), „Ważny do: …” (`formatExpiry`) i „wycofany z rejestru”. Pusta lista pokazuje „Apteczka jest pusta” (`:114-115`). Na liście nie ma znacznika przeterminowania.
- Komunikaty `?dodano=<id>` (`:36-43`, liczone na serwerowym `items`) i `?zaimportowano=<n>` (`:17-25`) zależą od listy wczytanej na serwerze.
- `listKitItems` (`src/lib/services/kit.ts:174-203`) czyta wszystkie wiersze konta (RLS), od najnowszych (`created_at desc, id desc`), bez limitu. Złączenie `registry_packages!inner(...registry_products!inner)` nie filtruje `removed_at`, więc pozycje wycofane zostają na liście z `withdrawn: true` (`:199`).
- Smoke czyta HTML `/apteczka` i sprawdza „nieznane” oraz nazwę leku (`scripts/smoke.mjs:215-219`). Przeniesienie listy do wyspy `client:only` zepsułoby ten krok. Wyspa `client:load` z renderowaniem na serwerze go zachowuje.
- Middleware: `PROTECTED_ROUTES = ["/szukaj", "/apteczka"]` (`src/middleware.ts:4`). Strona bez sesji daje 302 do `/auth/signin`. Trasy `/api/kit*` nie są na liście i każda sama zwraca 401 JSON.

### 2. Model danych i RLS (`kit_items`)

- Kolumny (`20261007120000_kit_items.sql:15-25`): `quantity integer check (>= 0)`, `expires_on date`, `expiry_precision in ('month','day')`, para data/precyzja (`kit_items_expiry_pair_check`), `updated_at default now()` bez triggera. Grep `supabase/migrations` nie znajduje `create trigger` ani `moddatetime`.
- Polityki (`:44-67`): select, insert, update (`using` + `with check` na `user_id = auth.uid()`), delete. Uprawnienia (`:74-76`): `select, insert, update, delete` dla `authenticated`, `anon` nic.
- `expiry_precision = 'day'` nie zapisuje żadna z dwóch istniejących tras zapisu: `src/pages/api/kit/index.ts:60` i `src/pages/api/kit/import.ts:75` zapisują `"month"`. Grep `src/` po `expiryPrecision`/`expiry_precision` nie znalazł innego zapisu. W przeszukanych `src/` i `tests/db/` wartość `'day'` pojawia się tylko w danych testowych: w teście przyjętej luki (`tests/db/kit-access.test.ts:230`) i w fiksturze kolejności sprawdzenia (`tests/db/medicine-check.test.ts:217`). Plan S-02 odsunął precyzję dnia „po S-05” (`context/archive/2026-10-07-add-medicine-to-kit/plan.md:32`). Pozycji w roadmapie na to nie ma.
- `medicine_check` czyta `kit_items` (`quantity`, `expires_on`, `expiry_precision`, `created_at`) jako `security invoker` (`supabase/migrations/20261010120000_medicine_check.sql:13`, `:129-148`) i nie filtruje po ilości. Edycja i usunięcie od razu zmieniają więc wynik sprawdzenia na `/szukaj`. „Już masz” w imporcie CSV liczy się w przeglądarce z `listKitItems` (`context/changes/csv-kit-import/plan.md:54`).

### 3. Trasy zapisu: wzorzec do powtórzenia

- Kolejność w `POST /api/kit` (`src/pages/api/kit/index.ts:15-68`): 503 (brak klienta) → 401 (`!locals.user`) → 415 (Content-Type nie `application/json`) → 400 (zły JSON) → 400 z `issues` zod → 400 reguły biznesowe → zapis. Błąd daje `console.error` i ogólny 500. Pomocnik `json()` z `Cache-Control: no-store` jest kopiowany w każdym pliku (`:8-13`).
- Schemat pozycji `kitItemRequest` (`src/lib/kit-request.ts:9-19`, `.strict()`): `quantity` 0…`MAX_QUANTITY` lub null, `expiry {month 1-12, year 2000-2100}` lub null. Obie trasy POST używają tego samego schematu, „so their boundaries cannot drift apart” (`:5-6`). Edycja potrzebuje wariantu bez `packageId` (z identyfikatorem pozycji w ścieżce lub w body). To decyzja planu.
- Limit opakowania: `packQuantity(units).max` (`src/lib/kit-format.ts:56-70`), sprawdzany w `index.ts:51-54` i `import.ts:62-66`. **Pułapka dla edycji:** `getPackage`/`getPackages` zwracają `null` dla opakowania lub produktu wycofanego (`src/lib/services/kit.ts:63-88`, `:94-127`). Gdyby trasa edycji wzięła limit z `getPackage`, nie dałoby się poprawić ilości pozycji wycofanej, a lista takie pozycje pokazuje (`apteczka.astro:133`). `units` pozycji trzeba czytać ze złączenia `kit_items → registry_packages` bez filtra `removed_at`, tak jak robi to `listKitItems`.
- Ochrona przed CSRF: `astro.config.mjs` nie ustawia `security`, więc obowiązuje domyślne `checkOrigin: true` (`node_modules/astro/dist/core/config/schemas/defaults.js:44`, Astro 7.3.2). W `node_modules/astro/dist/core/app/origin-check.js:8-22` metody spoza GET/HEAD/OPTIONS z Content-Type typu formularz i inny Origin dostają 403. **Bez Content-Type każdy inny Origin, także brak nagłówka, dostaje 403** (`:16-21`) przed middleware aplikacji. Skutek: `DELETE` bez body i bez `Origin` (curl, test) zwraca 403, nie 401. Pomocnik testów `send()` zawsze wysyła `Origin: BASE_URL` (`tests/api/helpers.ts:50`), więc testy dochodzą do trasy. `fetch` z tej samej domeny w przeglądarce przechodzi.
- `checkOrigin` przepuszcza `application/json` z dowolnego Origin, bo to nie jest typ formularza (`origin-check.js:2-6`, `:17-19`). Przed zapytaniem JSON z innej domeny chroni więc wymóg 415 dla typów innych niż `application/json` razem z preflightem CORS przeglądarki, a nie `checkOrigin`. Nowa trasa PATCH musi zachować 415 przed walidacją i nigdy nie przyjmować typów formularza. `DELETE` bez body chroni `checkOrigin`.

### 4. UI: co można użyć ponownie

- `src/components/ui/`: `button`, `card`, `input`, `label`, `radio-group`, `LibBadge.astro`. Brak `dialog`/`alert-dialog`/`select`/`badge`. Pakiety Radix: tylko label, radio-group i slot (`package.json:33-35`). Potwierdzenie usunięcia w oknie wymagałoby `npx shadcn@latest add alert-dialog`.
- Pola ilości i daty istnieją w dwóch kopiach, bez wspólnego komponentu ani hooka:
  - `KitAddForm.tsx`: ilość `:244-271` (`Input type="number"`, sufiks „z {max} {unit}”), walidacja `:85-110` („Podaj liczbę całkowitą, 0 lub większą”, „Ilość nie może być większa niż …”), data jako dwa natywne `<select>` w `role="group"` (`:273-326`), błąd formularza `role="alert"` (`:330-335`), reset stanu `saving` po bfcache `pageshow` (`:55-66`).
  - `KitImportRow.tsx`: `RowQuantity` `:281-345` (`type="text" inputMode="numeric"` + `parseQuantity`), `RowExpiry` `:178-278` z przyciskiem „Wyczyść datę (nieznana)”, miękkie „Usuń z importu” / „Przywróć” (`:462-470`, tylko stan lokalny).
  - Wspólne stałe skopiowane w obu plikach: `SELECT_CLASS`, `FIELD_LABEL_CLASS`, `InlineError`, `YEARS_BACK/AHEAD`, `MONTHS` (`KitAddForm.tsx:19-42`, `KitImportRow.tsx:16-65`).
- Przeterminowanie w wyniku sprawdzenia (`src/components/registry/MedicineCheckResult.tsx:35`, `:45-48`): `isExpired(item.expiresOn, todayIso())` i `<span className="text-destructive font-medium"> · przeterminowany</span>`. Wiersz ma ten sam układ co lista apteczki (`:37-50`) plus linię substancji. Plan S-03 przekazał S-05 „wspólny komponent wiersza dla Astro i React” (`context/archive/2026-10-09-medicine-check/plan.md:67`). `isExpired` porównuje tekst: data z precyzją miesiąca jest ważna do końca miesiąca, `null` nigdy nie jest przeterminowany (`kit-format.ts:93-99`).
- `KitAddForm.tsx:141-142` pokazuje użytkownikowi `payload?.error`, czyli angielski tekst serwera (np. „Quantity exceeds the pack size (N)”, `index.ts:53`). Nowy zapis na liście nie powinien powtarzać tego wzorca.
- Oba sprawdzone zapisy z przeglądarki (`KitAddForm`, `KitImport`) są pesymistyczne: `fetch`, potem pełna nawigacja (`KitAddForm`) albo krok w stanie lokalnym (`KitImport.tsx:312-355`). Grep `src/` nie znalazł aktualizacji optymistycznej, `confirm(` ani okna potwierdzenia.
- Tokeny (`src/styles/global.css:7-45`): między innymi `destructive` (bez `--destructive-foreground`), `success`/`warning` z `-foreground`, `accent` (komunikaty `role="status"` na `/apteczka`, `apteczka.astro:81-92`).
- Strażnicy UI: `scripts/ui-scan.mjs:19-30` (`GUARDED`) obejmuje między innymi `src/pages/apteczka.astro`, `KitAddForm.tsx`, `KitImportRow.tsx`. Nowy plik komponentu trzeba dopisać ręcznie. `scripts/ui-shots.mjs` obejmuje tylko `/szukaj` (`:66`, `STATES` od `:188`), więc `/apteczka` nie ma zrzutów.

### 5. Testy: gdzie i jak

- **API (`npm run test:api`, `vitest.api.config.ts:11-16`, pliki po kolei).** `test-plan.md:187`: granice do `kit-input.test.ts`, cudzy wiersz do `kit-access.test.ts`, przypadki bazy, jeśli zmieni się migracja. Reguły §6.4 (`test-plan.md:181-189`): czarna skrzynka HTTP, każdy odrzucony przypadek sprawdza 4xx (nigdy 500), brak zapisu i `expectNoInternals`, obie strony każdej granicy, źródło granicy w komentarzu (nie importować stałej), 401 przed walidacją.
  - Pomocniki do rozszerzenia (`tests/api/helpers.ts`): `send()` przyjmuje dowolną metodę (`:48-63`), ale `sendJson` ma na sztywno POST (`:66-73`). `kitRowCount` (`:188-194`) wystarcza dla DELETE. `kitRowsById` (`:204-215`) nie zwraca `expires_on`/`expiry_precision`, więc „wiersz nienaruszony” po PATCH wymaga rozszerzenia. `expectRejected` (`kit-input.test.ts:43-50`) porównuje tylko liczbę wierszy.
  - Wzorzec bez sesji: 401 dla poprawnego body, złego body i złego Content-Type (`kit-access.test.ts:33-71`).
  - Limit logowań: każdy przebieg zakłada 4 konta z 30 na 5 minut. Nowe konta w `beforeAll` zużywają ten budżet.
- **Baza (`npm run test:db`).** `tests/db/kit-access.test.ts` już sprawdza: B robi UPDATE i DELETE na wierszu A, 0 wierszy, wiersz bez zmian (`:78-94`); A nie przekaże wiersza B (`:117-124`, 42501); `anon` nic (`:138-148`); ograniczenia kolumn tylko dla INSERT (`:169-202`); przyjęta luka F2 (`:204-230`); strażnik „żadnej funkcji `security definer` w `public`” (`:236-255`). Nie ma pozytywnego „właściciel zmienia lub usuwa swój wiersz” ani ograniczeń na ścieżce UPDATE. Sam trigger `updated_at` nie odwraca testów F2. Zrobiłyby to dopiero CHECK-i, a wtedy `test-plan.md:164` każe je odwrócić, nie usuwać.
- **Komponenty (`npm test`, projekt `component`).** Plik obok komponentu `src/components/kit/<Name>.test.tsx`. Wzorzec nieaktualnego stanu §6.3 (`test-plan.md:167-177`, wzór `src/components/registry/RegistrySearch.test.tsx`). `stubRoutedFetch` (`tests/helpers/fetch.ts:59-119`) zna tylko trasy wyszukiwania, sprawdzenia, opakowań i importu, a resztę odrzuca (`:100`), więc trzeba dodać trasy edycji i usuwania albo użyć `stubFetch`.
- **E2E (poza CI).** `tests/e2e/helpers/kit-db.ts:1-2`: „the app has no route that removes a kit item until S-05”. Sprzątanie przez bazę można potem zastąpić trasą usuwania (opcjonalnie).

## Code References

- `src/pages/apteczka.astro:32-52` — serwerowe wczytanie listy i `?dodano`
- `src/pages/apteczka.astro:110-138` — dzisiejsza lista (bez przeterminowania, bez akcji)
- `src/lib/services/kit.ts:174-203` — `listKitItems` (bez limitu, wycofane zostają)
- `src/lib/services/kit.ts:63-127` — `getPackage`/`getPackages` (null dla wycofanych, pułapka dla edycji)
- `src/lib/kit-request.ts:9-19` — wspólny schemat zod pozycji
- `src/lib/kit-format.ts:56-70`, `:93-111` — `packQuantity`, `isExpired`, `formatQuantity`
- `src/pages/api/kit/index.ts:15-68` — wzorzec trasy zapisu
- `supabase/migrations/20261007120000_kit_items.sql:15-76` — tabela, polityki, uprawnienia
- `src/components/registry/MedicineCheckResult.tsx:35-48` — znacznik „przeterminowany”
- `src/components/kit/KitAddForm.tsx:85-110`, `:244-326` — pola ilości i daty
- `src/components/kit/KitImportRow.tsx:178-345` — pola z „Wyczyść”
- `tests/api/helpers.ts:48-73`, `:188-215` — `send`, `sendJson`, `kitRowCount`, `kitRowsById`
- `tests/db/kit-access.test.ts:78-94`, `:204-230` — UPDATE/DELETE cudzego wiersza, luka F2
- `node_modules/astro/dist/core/app/origin-check.js:8-22` — 403 dla zapytań bez Content-Type z innym Origin lub bez niego
- `scripts/smoke.mjs:215-219` — smoke czyta listę z HTML

## Architecture Insights

- Zapis apteczki idzie przez klienta sesji (RLS). Recenzja Fazy 3 przypomina, że nowa funkcja `security definer` albo klucz service role zgubiłyby izolację (`context/archive/2026-10-17-testing-kit-access-and-input-boundaries/research.md:119`), a strażnik w `tests/db/kit-access.test.ts:236-255` to wychwyci. Edycja i usuwanie przez `supabase.from("kit_items").update/delete` z filtrem po `id` dziedziczą izolację. Cudzy `id` daje 0 wierszy, a trasa musi to zamienić na 404 (`test-plan.md:187` dopuszcza 404/403). Do sprawdzenia w planie (niezweryfikowane tu w dokumentacji supabase-js): samo `.update()`/`.delete()` bez `.select("id")` albo `{ count: "exact" }` może zwrócić sukces bez informacji, czy zmieniono jakiś wiersz, i wtedy trasa odpowiedziałaby 2xx na cudzy wiersz.
- Granice wejścia mieszkają w API i są współdzielone przez schemat zod. Edycja powinna je brać z tego samego miejsca (`kit-request.ts:5-6`).
- Właściciel nigdy nie przychodzi z body (`context/archive/2026-10-07-add-medicine-to-kit/plan.md:50`). Schemat `.strict()` odrzuca `userId`/`user_id` (`tests/api/kit-access.test.ts:75-82`).
- Nowa migracja `kit_items` (trigger) nie trafia do `REGISTRY_MIGRATIONS` (to lista tylko dla migracji rejestru, AGENTS.md, `test:db`). Migracje produkcyjne trzeba wypchnąć ręcznie (`db push`), zanim wdroży się kod, który ich potrzebuje.

## Historical Context (from prior changes)

- `context/archive/2026-10-07-add-medicine-to-kit/reviews/impl-review.md`:
  - **F2** (`:37-54`): niezmienniki tylko w API. ACCEPTED, odłożone w `roadmap.md:321` („Zapis apteczki tylko przez aplikację”). Blind spot: „S-05 edit paths that would need the same limits” (`:53`).
  - **F1**: górna granica `MAX_QUANTITY = 100000`. FIXED, obowiązuje też edycję.
  - **F4** (`:70-78`): brak limitu listy, „Household sizes are small and a user can only slow their own page”. SKIPPED, przekazane S-05.
  - **F6** (`:90-98`): brak triggera `updated_at`. SKIPPED, „add the update trigger in S-05's migration when the first update path lands”.
  - **F7**/**F8**: 415 przed walidacją; nawigacja po 201 i reset `saving` po bfcache.
- `context/archive/2026-10-07-add-medicine-to-kit/plan.md`: `:31` edycja, usuwanie i ilość na liście to S-05; `:37` ilość to całe jednostki opakowania; `:47` reguła limitu; `:48` miesiąc zapisany jako ostatni dzień, wyświetlanie według precyzji; `:32` precyzja dnia po S-05.
- `context/archive/2026-10-09-medicine-check/reviews/impl-review.md` **F10** (`:151-159`): `isExpired`/`todayIso` przeniesione do `kit-format.ts`, użycie na `/apteczka` przekazane S-05 (`roadmap.md:164`). **F4** (wszystkie pasujące opakowania przeterminowane, a werdykt zielony) dotyczy S-08, nie S-05.
- `context/archive/2026-10-10-testing-check-verdict-correctness/plan.md:50`: ilość 0 nadal liczy się jako „masz” (G13). „Decyzja dla S-05.”
- `context/archive/2026-10-29-kit-add-form-reset-on-edit/plan.md:113`: nieaktualny wybór po edycji tekstu zdarzył się dwa razy, dlatego `onEdit` w `MedicineSuggest` jest wymagane. Ważne, jeśli edycja ma zmieniać lek lub opakowanie przez `MedicineSuggest`.
- `context/changes/csv-kit-import/`: na `main` status `implementing`. Archiwizacja i poprawki z recenzji F1–F9 (commit `f6c1c0d`, w tym `uniquePacks` po `(productId, packLabel)` i blokada wierszy `<fieldset disabled={saving}>`) są tylko na gałęzi `chore/archive-csv-kit-import` (sprawdzone `git branch -a --contains f6c1c0d` 2026-11-04). Kotwice `kit-format.ts` i `KitImportRow.tsx` w tym dokumencie dotyczą `main`@ee29413, sprzed tych poprawek. Pole ilości w imporcie jest zawsze edytowalne (commit `acd128b`).
- S-12 nie ma folderu zmiany ani gałęzi. Istnieje tylko wpis w roadmapie (`roadmap.md:255-267`).

## Related Research

- `context/archive/2026-10-17-testing-kit-access-and-input-boundaries/research.md` — izolacja apteczki i granice wejścia (podstawa §6.2/§6.4 test-planu)
- `context/archive/2026-10-10-testing-check-verdict-correctness/research.md` — reguła sprawdzenia, G13 (ilość 0)

## Open Questions

1. **Kolejność S-12 i S-05.** Czy najpierw rozstrzygnąć znaczenie `quantity` (S-12, `Block: yes`, `roadmap.md:264`), czy zrobić S-05 na dzisiejszej regule `packQuantity` i dostosować ją w S-12? Od tego zależy limit i opis ilości w polu na liście.
2. **Ilość 0** (`testing-check-verdict-correctness/plan.md:50`): czy „0” na liście jest dozwolone i nadal liczy się jako „masz”, czy proponuje usunięcie pozycji, czy sprawdzenie ma je pomijać? Dotyka `medicine_check` (bez filtra ilości, `20261010120000_medicine_check.sql:129-148`) i „już masz” w imporcie.
3. **Zakres edycji:** tylko ilość i data, czy też zmiana opakowania lub leku (wtedy `MedicineSuggest` z `onEdit` i wybór opakowania jak w `KitAddForm`)? Precyzja dnia jest poza zakresem według planu S-02 (`plan.md:32`).
4. **Usuwanie:** okno potwierdzenia (nowy komponent `alert-dialog`), czy cofnięcie po fakcie? W `src/` nie ma żadnego z tych wzorców.
5. **Zapis ilości na liście:** osobny przycisk, zapis po wyjściu z pola, czy przyciski −/+? Odświeżenie przez nawigację (jak `KitAddForm`) czy aktualizacja na miejscu? Do tego obsługa błędu po polsku (nie `payload.error`).
6. **Limit listy (F4):** dane wskazują, że limit nie jest potrzebny (mała apteczka, spowolnienie tylko własnej strony). Potwierdzić w planie albo ustalić górną granicę.
7. **Wspólny komponent wiersza** dla listy i wyniku sprawdzenia (`medicine-check/plan.md:67`): robić teraz czy zostawić dwa wiersze ze wspólnym znacznikiem `isExpired`?
8. **Merge archiwizacji S-04:** PR #62 z gałęzi `chore/archive-csv-kit-import` jest otwarty (`gh pr list`, 2026-11-04). Czy trafi na `main` przed implementacją S-05? Zmienia `kit-format.ts` (`uniquePacks`) i `KitImportRow.tsx`, czyli pliki, które S-05 może współdzielić.
