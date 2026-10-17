---
date: 2026-10-17T08:52:38+02:00
researcher: michalg84 (z Claude Code)
git_commit: 7975dda79948e19f1a32f055b9c6a5e79fd55f11
branch: test/kit-access-and-input-boundaries
repository: mamlek
topic: "Faza 3 wdrażania testów: czego muszą dowieść testy dla ryzyka #4 (izolacja apteczki między kontami) i ryzyka #6 (granice danych wejściowych endpointów apteczki)"
tags: [research, testing, kit, rls, api, validation, supabase]
status: complete
last_updated: 2026-10-17
last_updated_by: michalg84 (z Claude Code)
---

# Research: Faza 3 wdrażania testów — dostęp do apteczki i granice danych wejściowych (ryzyka #4, #6)

**Date**: 2026-10-17T08:52:38+02:00
**Researcher**: michalg84 (z Claude Code)
**Git Commit**: 7975dda79948e19f1a32f055b9c6a5e79fd55f11 (zmiany w `test-plan.md` §3 i folder zmiany niescommitowane)
**Branch**: test/kit-access-and-input-boundaries
**Repository**: mamlek

## Research Question

Czego muszą dowieść testy dla ryzyk #4 i #6 z Fazy 3 w `context/foundation/test-plan.md` (`:44`, `:46`, wskazówki `:61`, `:63`)?

- **#4**: którymi ścieżkami czyta się i zapisuje dane apteczki, na czym stoi izolacja kont i dostęp anonimowy, co już jest sprawdzone.
- **#6**: gdzie są granice walidacji, skąd biorą się wartości graniczne (PRD, limity bazy), czy jakieś dane wejściowe dają 500, co już jest sprawdzone.
- Jaka jest najtańsza warstwa testów, która daje prawdziwy sygnał (bez mockowania Supabase), i co wymaga decyzji w planie.

## Summary

- **Powierzchnia jest mała.** W `src/` (szukane: `kit_items`, `medicine_check`, `/api/kit`, wywołania serwisów z `src/lib/services/kit.ts`) danych apteczki dotykają te ścieżki aplikacji: `POST /api/kit` (`src/pages/api/kit/index.ts:27-81`), `GET /api/kit/check` (`src/pages/api/kit/check.ts:15-40`, RPC `medicine_check`) i strona `/apteczka` (`src/pages/apteczka.astro:19-29`: `listKitItems`, `countKitItemsWithPackage`). `GET /api/registry/packages` czyta tylko rejestr (`src/pages/api/registry/packages.ts:30`). **Edycji ani usuwania w API aplikacji nie ma** — wchodzą z S-05 (status proposed, `context/foundation/roadmap.md:153-166`). Zmiana i usuwanie wierszy są dziś możliwe wyłącznie przez API danych (PostgREST), bo `authenticated` ma `update, delete` (`supabase/migrations/20261007120000_kit_items.sql:74`).
- **Izolacja (#4) stoi na bazie, nie na API.** Cztery polityki RLS per operacja `user_id = (select auth.uid())` (`kit_items.sql:44-67`), `user_id default auth.uid()` (`:17`), brak polityk i grantów dla `anon` (`:69`, `:75`), `medicine_check` i `registry_variant_packages` jako `security invoker` (`20261010120000_medicine_check.sql:113`, `kit_items.sql:100`) z odebranym `execute` dla `public, anon` (`medicine_check.sql:234-238`, `kit_items.sql:126`). API aplikacji nie przyjmuje właściciela: ciało `POST` jest `.strict()` bez pola użytkownika (`index.ts:8-18`), a `addKitItem` nie podaje `user_id` (`src/lib/services/kit.ts:100-109`). Założenie „zalogowany znaczy uprawniony” jest więc na ścieżce API aplikacji prawdziwe tylko dlatego, że RLS wybiera wiersze — test musi to sprawdzić na danych dwóch kont, nie na kodzie trasy.
- **„RLS tabeli obejmuje też funkcję” jest prawdą warunkowo**: tylko dopóki `medicine_check` jest `security invoker` (`medicine_check.sql:13`, `:113`). Funkcja `security definer` ominęłaby RLS. Ochronę daje jeden istniejący przypadek (`tests/db/medicine-check.test.ts:593-599`, „other user's variant item stays hidden (RLS)”).
- **Spora część #4 jest już pokryta przez `npm run smoke`** (czarna skrzynka HTTP na podglądzie produkcyjnym, w CI): anonim dostaje 401 na `POST /api/kit` i `GET /api/kit/check` oraz 302 na `/apteczka`, drugie konto nie widzi leku pierwszego ani na `/apteczka`, ani w sprawdzeniu (`scripts/smoke.mjs:181-257`). **Nie jest pokryte**: bezpośrednie `select/insert/update/delete` na `kit_items` jako inne konto, `insert` z cudzym `user_id`, `update` zmieniający `user_id`, rola `anon` na tabeli i funkcjach (G21 odłożone do Fazy 3: `context/archive/2026-10-10-testing-check-verdict-correctness/plan.md:51`).
- **#6: zbadana ścieżka nie ujawniła danych wejściowych dających 500.** Walidacja przed bazą: `Content-Type` → 415 (`index.ts:36-38`), zły JSON → 400 (`:40-45`), schemat zod → 400 (`:46-55`), brak lub wycofane opakowanie → 400 (`:59-62`), ilość ponad rozmiar opakowania → 400 (`:63-66`). Zod 4.6.2 (re-eksport `astro/zod`) traktuje `.int()` jako bezpieczną liczbę całkowitą — sprawdzone uruchomieniem: `2^53` i `1e20` odrzucone, parametr `99999999999999999999` odrzucony, więc id spoza `bigint` nie dochodzą do bazy. Przepełnienie `integer` przy ilości naprawiono wcześniej (`MAX_QUANTITY = 100000`, `src/lib/kit-format.ts:8`; impl-review F1). Wartość testów to ochrona przed regresją, nie wykrycie znanego defektu.
- **Niezmienniki #6 obowiązują tylko w API aplikacji — to przyjęta, zaparkowana luka.** Przez API danych właściciel może zapisać do **własnych** wierszy ilość ponad opakowanie, dowolną datę, `expiry_precision = 'day'` czy wycofane opakowanie (`context/archive/2026-10-07-add-medicine-to-kit/reviews/impl-review.md:37-54`, F2 przyjęte; `roadmap.md:301` Parked). W bazie zostają tylko: `quantity >= 0` (`kit_items.sql:19`), enum precyzji (`:21`), para data/precyzja (`:24`), klucz obcy do opakowania (`:18`). Test, który wymagałby limitu opakowania w bazie, padnie z założenia — to negatywna przestrzeń, nie test.
- **Najtańsze warstwy:** #4 na poziomie danych — nowe przypadki w istniejącej uprzęży `tests/db` (przełączenie roli i `request.jwt.claims`, transakcja wycofywana; `tests/db/medicine-check-fixtures.ts:144-167`), bez nowej infrastruktury, w CI. #4 i #6 na poziomie API aplikacji — czarna skrzynka HTTP z sesją z ciasteczek jak w smoke; wywołanie handlera wprost w Vitest jest drogie i pomija middleware (szczegóły niżej). Wybór „rozszerzyć `smoke.mjs`” vs „nowy projekt Vitest z wydzielonymi helperami” to decyzja dla planu.
- **Korekty do backportu w §2 planu testów** — zob. „Corrections to test-plan §2” niżej (źródło „RLS nigdy nie sprawdzone na danych”, brak edycji/usuwania w API, zakres #6 względem API danych).

## Detailed Findings

### Ścieżki do danych apteczki (#4)

| Ścieżka                 | Operacja na `kit_items`                             | Kto ogranicza wiersze                   | Kotwica                                                          |
| ----------------------- | --------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| `POST /api/kit`         | insert (`user_id` z defaultu)                       | RLS insert `with check`                 | `index.ts:68-73`, `kit.ts:100-109`, `kit_items.sql:17`, `:50-54` |
| `GET /api/kit/check`    | select w RPC `medicine_check`                       | RLS select (funkcja `security invoker`) | `check.ts:30`, `medicine_check.sql:110-148`                      |
| `/apteczka`             | select listy i licznik duplikatów                   | RLS select                              | `apteczka.astro:21-27`, `kit.ts:117-158`                         |
| `/apteczka?dodano=<id>` | brak zapytania — szuka w już przefiltrowanej liście | RLS select (pośrednio)                  | `apteczka.astro:22-28`                                           |
| API danych (PostgREST)  | select/insert/update/delete                         | RLS per operacja, granty                | `kit_items.sql:42-76`                                            |

- Middleware rozpoznaje użytkownika przez `auth.getUser()` (`src/middleware.ts:10-13`). `/api/kit*` **nie** jest w `PROTECTED_ROUTES` (`middleware.ts:4`), więc anonim dochodzi do trasy i dostaje z niej 401 (`index.ts:32-34`, `check.ts:20-22`); `/apteczka` jest chroniona i przekierowuje (302).
- Kolejność w trasach: 503 przy braku klienta → 401 → walidacja (`check.ts:16-27`, `index.ts:28-55`). Anonim nigdy nie dostaje więc 400, które zdradzałoby walidację.
- `update` w polityce ma i `using`, i `with check` (`kit_items.sql:56-61`) — przeniesienie własnego wiersza na cudze konto przez zmianę `user_id` powinno być odrzucone. Nieprzetestowane.
- `TRUNCATE/REFERENCES/TRIGGER` odebrane `authenticated` (`kit_items.sql:76`), bo omijają RLS. Nieprzetestowane.
- Brak klienta przeglądarkowego Supabase w `src/` (szukane: `createBrowserClient`, `PUBLIC_SUPABASE`), a `SUPABASE_KEY` jest sekretem serwera (`astro:env/server`, `src/lib/supabase.ts:3`). API danych nie jest więc używane przez aplikację z przeglądarki, ale klucz anon jest z założenia publikowalny — ścieżka bezpośrednia jest realną powierzchnią i plan testów słusznie ją wymienia (`test-plan.md:61`).
- Sesja: ciasteczka `@supabase/ssr` 0.12 (`src/lib/supabase.ts:9-20`). Format nazw nie był sprawdzany w źródle biblioteki; test czarnej skrzynki (jak smoke) nie musi go znać.

### Istniejące pokrycie #4

- `scripts/smoke.mjs` (CI, job `smoke`, `.github/workflows/ci.yml:62-66`):
  - `"kit page redirects anonymous user"` 302 (`:181-185`), `"kit add rejects anonymous user"` 401 (`:186-190`), `"medicine check rejects anonymous user"` 401 (`:192`);
  - drugie konto (`jar2`): `"kit page hides the medicine from another account"` (`:241-245`), `"medicine check hides the medicine from another account"` — 200 i `items.length === 0` (`:246-257`).
  - Helpery: `cookieHeader`, `storeCookies` (`:9-21`), `request(path, {method, form, json, jar})` z `redirect: "manual"` i `Origin` (`:24-43`); sesja przez `POST /api/auth/signup` + `/api/auth/signin` (`:138-152`).
- `tests/db/medicine-check.test.ts`: jeden przypadek izolacji na RPC (`:593-599`); w `tests/db` nie ma słowa `anon` ani bezpośrednich operacji na `kit_items` jako `authenticated` innego konta.
- Uprzęż: syntetyczni użytkownicy wstawiani wprost do `auth.users (id)` (`medicine-check-fixtures.ts:92-97`, `:144`), wiersze apteczki jako właściciel tabeli z jawnym `user_id` (`:145-153`), potem `set local role authenticated` (`:154`) i `request.jwt.claims = {sub, role}` przed wywołaniem (`:159-167`); jedna transakcja wycofywana, savepoint per test.

### Granice danych wejściowych (#6)

Kontrakt `POST /api/kit` (`index.ts:8-18`; uzgodniony w `context/archive/2026-10-07-add-medicine-to-kit/plan.md:146`):

| Pole / warunek                                                   | Granica                                                    | Źródło wartości granicznej                                                               | Odpowiedź                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------- |
| `Content-Type`                                                   | musi zaczynać się od `application/json`                    | impl-review F7 (`add-medicine-to-kit/reviews/impl-review.md:100-108`)                    | 415 (`index.ts:36-38`)                 |
| ciało                                                            | poprawny JSON                                              | —                                                                                        | 400 (`:40-45`)                         |
| nieznane klucze (np. `userId`)                                   | odrzucone (`.strict()`)                                    | plan `:146`                                                                              | 400 (`:46-55`)                         |
| `packageId`                                                      | int > 0, bezpieczna liczba całkowita                       | kolumna `bigint` (`kit_items.sql:18`)                                                    | 400                                    |
| `packageId` nieistniejące lub wycofane (opakowanie albo produkt) | `getPackage` → null                                        | PRD (lek z rejestru), plan `:146`                                                        | 400 (`index.ts:59-62`, `kit.ts:64-79`) |
| `quantity`                                                       | null/brak albo int 0…100000                                | `integer` w bazie (`kit_items.sql:19`), F1 (`impl-review.md:27-35`), `kit-format.ts:7-8` | 400                                    |
| `quantity` > rozmiar opakowania                                  | tylko gdy opakowanie ma jeden wpis z liczbową ilością      | plan `:47-48`, `kit-format.ts:39-53`                                                     | 400 (`index.ts:63-66`)                 |
| `expiry`                                                         | null/brak albo `{month 1–12, year 2000–2100}`, `.strict()` | plan `:146` (formularz węższy: −5…+10 lat, plan `:201`)                                  | 400                                    |

`GET /api/kit/check`: `product` musi pasować do `^\d+$` i być bezpieczną dodatnią liczbą całkowitą (`check.ts:6`, `:24-27`) → 400; nieznany produkt → 404 (`:31-33`).

- PRD nie podaje limitów liczbowych: data i ilość opcjonalne, brak = „nieznane” (`context/foundation/prd.md:130`, `:147`). Wartości graniczne pochodzą więc z kontraktu planu S-04 i limitów bazy — zgodnie z antywzorcem w `test-plan.md:63` test nie powinien kopiować schematu zod, tylko brać granice z tych źródeł.
- „Nie ujawnia szczegółów wewnętrznych”: 500 zwraca stały komunikat, szczegół tylko w `console.error` (`index.ts:76-80`, `check.ts:35-39`). 400 ze schematu zwraca `issues` ze ścieżką pola i komunikatem zod (`index.ts:48-54`) — to szczegóły żądania, nie serwera; czy to dopuszczalne, zob. Open Questions.
- „Nic nie zapisuje”: wszystkie odrzucenia na zbadanej ścieżce wracają przed `addKitItem` (`index.ts:36-66` vs `:68`). Test powinien to potwierdzić na danych (liczba wierszy / widok `/apteczka` bez zmian), nie na kodzie.
- Istniejące pokrycie w smoke: ujemna ilość 400 (`smoke.mjs:205-209`), nieznane opakowanie 400 (`:210-214`), `product=abc` 400 (`:193`), nieznany produkt 404 (`:194`). **Brak**: wycofane opakowanie, ilość ponad rozmiar opakowania, ilość > 100000, typy nieliczbowe, `expiry` poza zakresem lub z dodatkowym kluczem, nieznany klucz (np. `userId`), zły JSON, zły `Content-Type`, brak `product`, sprawdzenie „nic nie zapisano”.
- Dane do przypadku „wycofane opakowanie” istnieją w CI: po imporcie `rpl-sample-v1.xml` ×2 i `v2` opakowanie `4` jest wycofane przy aktywnym produkcie, a produkt Crestor `100434824` jest wycofany (`scripts/registry-import-check.mjs:8`, `:11`, `:92-118`). Opakowanie z jednym wpisem i liczbową ilością (do przypadku „ponad rozmiar”) nie było szukane w fixture'ach.

### Najtańsza warstwa i uprząż

- **Dane (#4, a także ograniczenia bazy dla #6):** przypadki w `tests/db` z przełączaniem roli (`authenticated` z `request.jwt.claims` innego konta; `anon`). Wnioskowanie (niezweryfikowane w dokumentacji w tej sesji): PostgREST obsługuje żądanie przez te same mechanizmy (rola z JWT i ustawienie `request.jwt.claims`), więc przypadek SQL sprawdza tę samą politykę, którą sprawdziłoby żądanie HTTP. Test przez prawdziwe PostgREST z JWT (supabase-js `signInWithPassword` + klucz anon) dodałby sygnał o ekspozycji przez HTTP, ale wymaga eksportu `API_URL`/`ANON_KEY` do kroku `test:db` (dziś tylko `DATABASE_URL`, `ci.yml:46-55`) i zostawia prawdziwych użytkowników w bazie (brak klucza service role w CI).
- **API aplikacji (#4, #6):** czarna skrzynka HTTP na uruchomionym serwerze. Wywołanie `GET`/`POST` wprost w Vitest wymagałoby podmiany `astro:env/server` (żadna konfiguracja Vitest tego nie robi: `vitest.config.ts:56-57`, `vitest.db.config.ts`), sztucznego kontekstu i pominęłoby middleware — mniej realistyczne i i tak wymaga żywego Supabase. Job `smoke` w CI ma już podgląd produkcyjny z lokalnym Supabase i zaimportowanymi fixture'ami (`ci.yml:45-66`); limit `sign_in_sign_ups = 30` na 5 min (`supabase/config.toml:190`) i `enable_confirmations = false` (`:209`) pozwalają na kilka dodatkowych kont.

## Code References

- `src/pages/api/kit/index.ts:8-18` — schemat `POST /api/kit` (`.strict()`, granice)
- `src/pages/api/kit/index.ts:28-80` — kolejność 503 → 401 → 415 → 400 → 201/500
- `src/pages/api/kit/check.ts:6`, `:15-40` — parametr `product`, 401/400/404/500
- `src/lib/services/kit.ts:64-88` — `getPackage`: null dla brakującego lub wycofanego opakowania/produktu
- `src/lib/services/kit.ts:91-114` — `addKitItem` bez `user_id`
- `src/lib/kit-format.ts:8`, `:39-53` — `MAX_QUANTITY`, `packQuantity`
- `src/middleware.ts:4`, `:10-28` — `getUser`, chronione strony (bez `/api/*`)
- `src/pages/apteczka.astro:19-29` — odczyt listy i `?dodano`
- `supabase/migrations/20261007120000_kit_items.sql:15-25` — kolumny i ograniczenia
- `supabase/migrations/20261007120000_kit_items.sql:42-76` — RLS per operacja, granty
- `supabase/migrations/20261007120000_kit_items.sql:89-127` — `registry_variant_packages` (invoker, bez `anon`)
- `supabase/migrations/20261010120000_medicine_check.sql:110-148`, `:234-238` — RPC invoker, odebrane `execute`
- `scripts/smoke.mjs:9-43`, `:181-257` — helpery HTTP i istniejące kroki apteczki
- `tests/db/medicine-check-fixtures.ts:92-97`, `:144-167` — syntetyczni użytkownicy, role
- `tests/db/medicine-check.test.ts:593-599` — jedyny przypadek RLS
- `scripts/registry-import-check.mjs:8`, `:11` — wycofany produkt i opakowanie w fixture'ach
- `.github/workflows/ci.yml:45-66` — kolejność kroków joba `smoke`

## Architecture Insights

- Własność wiersza wyznacza baza (`default auth.uid()` + `with check`), a nie API. Każdy nowy zapis (S-05: edycja, usuwanie) przez klienta z sesją użytkownika dziedziczy izolację; nowa funkcja `security definer` albo klucz service role by ją zgubiły — to warto zapisać w książce kucharskiej §6.2 jako regułę dla przyszłych testów.
- Niezmienniki danych są dwupoziomowe: twarde ograniczenia w bazie (nieujemna ilość, para data/precyzja, enum, FK) i miękkie w API (limit opakowania, wycofane opakowanie, zakres lat, precyzja tylko `month`). Testy #6 muszą trzymać ten podział: API aplikacji odrzuca 4xx, baza egzekwuje tylko swoje ograniczenia.
- Trasy sprawdzają uwierzytelnienie przed walidacją, więc testy #6 muszą działać z sesją, a testy anonimowe zawsze oczekują 401 niezależnie od treści.

## Historical Context (from prior changes)

- `context/archive/2026-10-07-add-medicine-to-kit/plan.md:68-73`, `:81` — decyzja: RLS per operacja, brak polityk `anon`, limit ilości tylko w API; `registry_variant_packages` jako invoker.
- `context/archive/2026-10-07-add-medicine-to-kit/plan.md:146`, `:47-48`, `:201` — kontrakt `POST /api/kit`, reguła limitu opakowania, zakres lat formularza.
- `context/archive/2026-10-07-add-medicine-to-kit/reviews/impl-review.md:27-35` (F1, naprawione: przepełnienie `integer` → 500), `:37-54` (F2, przyjęte: niezmienniki tylko w API), `:100-108` (F7, naprawione: 415).
- `context/archive/2026-10-09-medicine-check/plan.md:73`, `:105`, `:116`, `:144` — RPC `security invoker`, `execute` odebrany `anon`, przypadek RLS.
- `context/archive/2026-10-10-testing-check-verdict-correctness/research.md:89`, `:192` (G21: grant `anon` niesprawdzony) i `plan.md:51` — izolacja poza istniejącym przypadkiem i `anon` odłożone „do Fazy 3”.
- `context/archive/2026-10-01-registry-copy-load/reviews/plan-review.md:27-39` — F1 „RLS nigdzie nie jest sprawdzany na danych” (tabele rejestru; naprawione sprawdzeniem roli na danych). To właściwe źródło sformułowania cytowanego w `test-plan.md:44`.
- `context/foundation/roadmap.md:301` — Parked: „Zapis apteczki tylko przez aplikację (twarda granica w bazie)”.

## Corrections to test-plan §2 (przeniesione do `test-plan.md` 2026-10-17)

1. **Źródło ryzyka #4** (`test-plan.md:44`): „przegląd w archiwum `2026-10-02-registry-search-suggestions` (RLS nigdy nie sprawdzone na danych)” — w tym folderze nie ma tego zdania; pochodzi z `2026-10-01-registry-copy-load` (plan-review F1) i dotyczyło tabel rejestru. Wspierającym źródłem dla apteczki jest odłożony G21 z Fazy 1 (`testing-check-verdict-correctness/plan.md:51`).
2. **Wskazówka #4** (`test-plan.md:61`): „edytować ani usunąć … przez API aplikacji” — API aplikacji nie ma dziś edycji ani usuwania (S-05 proposed). Do czasu S-05 te operacje da się dowieść tylko na poziomie danych.
3. **Wskazówka #6** (`test-plan.md:63`): czyste 4xx dotyczą API aplikacji; przez API danych właściciel może zapisać do własnych wierszy wartości łamiące niezmienniki API (F2 przyjęte, `roadmap.md:301`). Na poziomie danych testowalne są tylko ograniczenia bazy.

## Related Research

- `context/archive/2026-10-10-testing-check-verdict-correctness/research.md` — Faza 1, izolacja RPC i G21.
- `context/archive/2026-10-13-testing-result-state-and-search/research.md` — Faza 2 (bez związku z dostępem; książka kucharska §6.1, §6.3).

## Open Questions

1. **Gdzie testy API aplikacji?** Rozszerzyć `scripts/smoke.mjs` (zero zależności, już w CI) czy przenieść helpery do `scripts/lib/` i dodać projekt Vitest uruchamiany na `BASE_URL` w tym samym kroku CI? Decyzja dla planu.
2. **Czy potrzebny jest test przez prawdziwe PostgREST z JWT**, czy wystarczy uprząż SQL z przełączaniem roli? Pierwsze wymaga zmian w CI i sprzątania kont.
3. **Czy `issues` z komunikatami zod w odpowiedzi 400 łamią „nie ujawnia szczegółów wewnętrznych”?** Kod pokazuje ścieżki pól i komunikaty biblioteki, nie stan serwera; to decyzja produktowa.
4. **Które opakowanie z fixture'ów ma jeden wpis z liczbową ilością** (przypadek „ilość ponad rozmiar opakowania”) — niesprawdzone; alternatywą jest odczyt `units` przez `GET /api/registry/packages` w trakcie testu.
5. **Czy zamknąć lukę F2 (twarda granica w bazie)?** Poza zakresem Fazy 3 (zmiana produktu, Parked); test fazy może tylko udokumentować obecny podział.
