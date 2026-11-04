<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-04 Import apteczki z CSV z ekranem zatwierdzenia

- **Plan**: context/changes/csv-kit-import/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-03
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 6 observations

Zakres kodu: scalenie ee29413 (PR #60), commity f8439b3, 5e67a3e, 5c05ba6, 4e927f3, acd128b.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Sprawdzenia automatyczne

| Polecenie                                                                                  | Wynik                                                                                                                                                      |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                                             | PASS (0 błędów, 107 plików)                                                                                                                                |
| `npx astro check`                                                                          | PASS                                                                                                                                                       |
| `npx vitest run --project unit --project component --project registry`                     | FAIL za pierwszym razem: 2 z 483 testów (przekroczony limit 5 s w `KitImport.test.tsx:223`, drugi błąd jako skutek); osobno 3 razy PASS (13/13) — patrz F3 |
| `npm run test:api`, `npm run smoke`, `npm run test:db`, `npm run ui:scan`, `npm run build` | PASS w CI: zadania `ci` i `smoke` zielone dla PR #60 i dla scalenia do `main` (przebieg 41660419369); lokalnie nie uruchamiane                             |

Kroki ręczne: 2.4, 3.4, 4.6, 4.7, 4.8 odhaczone przez użytkownika; 4.5 (telefon, prawdziwy CSV z czatu) otwarte — przeniesione do osobnego wycinka o prompcie dla czatu (commit 048c8b9).

Drobne odstępstwa od planu, uzasadnione testem ręcznym (acd128b), uznane za zgodne: pola daty i ilości zawsze widoczne (plan: tylko przy złej wartości), etykiety „Wyczyść datę (nieznana)” / „Wyczyść ilość (nieznana)”, przewinięcie i fokus na nagłówku nowej strony, `plural()` w komunikacie „Dodano N leków z importu”.

## Findings

### F1 — Po „Przywróć” pole ilości pokazuje wartość z CSV, a zapisywana jest inna

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/kit/KitImportRow.tsx:292
- **Detail**: `RowQuantity` ustawia początkowy tekst pola z `row.parsed.quantity` (oryginał z CSV), a nie z `row.quantity` (bieżąca wartość, która idzie do zapisu). Usunięty wiersz odmontowuje pola, „Przywróć” montuje je od nowa. Przykład: użytkownik czyści „20” → usuwa wiersz → przywraca: pole znów pokazuje „20”, a zapisane zostanie `null`. Albo poprawia „abc” na „5”: po przywróceniu widzi „abc” bez błędu, a zapisze się 5. `RowExpiry` (:179) robi to dobrze, bo czyta `row.expiry`. Brak testu na usuń → przywróć edytowanego wiersza.
- **Fix**: Startować z `row.quantity` (tekst z `row.parsed.quantity` tylko dla wartości `invalid`) i dodać test komponentu „popraw → usuń → przywróć”.
- **Decision**: FIXED — `RowQuantity` startuje z `row.quantity`; test „keeps the edited quantity when a removed row is restored” (czerwony bez poprawki, zielony z nią).

### F2 — `uniquePacks` scala opakowania różnych podmiotów, także w ręcznym formularzu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/lib/kit-format.ts:40, src/components/hooks/useVariantPackages.ts:47
- **Detail**: Poprawka po teście ręcznym (acd128b, poza planem) zwija opakowania o tej samej etykiecie (`packLabel`) do pierwszego. `registry_variant_packages` celowo zwraca też opakowania produktów-rodzeństwa, np. importów równoległych od innych podmiotów (`supabase/migrations/20261007120000_kit_items.sql:82-84`), a `KitAddForm.tsx:79` i `KitImportRow.tsx:135` pokazują wtedy podmiot (`showHolder`). Teraz dwa „30 tabl.” od różnych podmiotów stają się jednym, linia z podmiotem znika, a przy jednym pozostałym opakowaniu wybór dzieje się sam — może to nie być pudełko, które użytkownik ma. Zmiana dotyka też istniejącego ręcznego dodawania (S-03). Testy pokrywają tylko duplikaty GTIN tego samego produktu.
- **Fix A ⭐ Recommended**: Scalać po `(productId, packLabel)` — duplikaty GTIN jednego produktu (Rennie) dalej się zwijają, różne podmioty zostają osobno; test z dwoma podmiotami.
  - Strength: Zachowuje cel poprawki (przypadek Rennie, jeden produkt) i przywraca wybór podmiotu, który migracja i `showHolder` zakładają.
  - Tradeoff: Przy imporcie równoległym użytkownik znów zobaczy kilka „30 tabl.” — ale z podpisem podmiotu, więc da się je odróżnić.
  - Confidence: HIGH — klucz wariantu i `showHolder` już rozróżniają produkty.
  - Blind spot: Nie sprawdzono, czy w rejestrze są duplikaty etykiet w obrębie jednego produktu z różnym podmiotem.
- **Fix B**: Zostawić scalanie po etykiecie i dopisać decyzję do planu (addendum: „podmiot nie jest wyborem użytkownika”).
  - Strength: Najprostszy wybór dla użytkownika; zero zmian w kodzie.
  - Tradeoff: Apteczka zapisuje `package_id` reprezentanta, nie faktycznego pudełka; dotyczy też ręcznego dodawania.
  - Confidence: MED — zależy, czy podmiot jest istotny dla późniejszych funkcji (sprawdzenie leku, wycofania).
  - Blind spot: Wpływ na wycofania konkretnego podmiotu nie zbadany.
- **Decision**: FIXED via Fix A — `uniquePacks` scala po `(productId, packLabel)`; test z dwoma produktami w `kit-format.test.ts`. `astro check` czysty.

### F3 — Niestabilny test komponentu zapisu strony (limit 5 s)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/components/kit/KitImport.test.tsx:223
- **Detail**: „saves only the kept rows of the page, moves to the next page and counts what was saved” trwa sam ok. 3 s, a projekt `component` ma domyślny limit 5 s (`vitest.config.ts` ustawia `testTimeout` tylko dla `hooks`). Przy równoległym lincie i `astro check` zajął 6,2 s i padł, a niezakończony test pociągnął następny („marks the row the server rejected…”) i błąd `act(...)`. Osobno 3 × PASS. Ten sam zestaw uruchamia hook Stop i pre-commit, więc fałszywe czerwienie będą wracać.
- **Fix**: Dać temu testowi własny limit (np. `it(..., 15_000)`) albo przyspieszyć go (mniej niż 28 wierszy „nieznanych”, gdy wystarczy przekroczyć 30 innym sposobem).
- **Decision**: FIXED — własny limit 15 s dla tego testu.

### F4 — Ręczne kontrolki zamiast komponentów z `src/components/ui/`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/kit/KitImport.tsx:46, :196; src/components/kit/KitImportRow.tsx:408
- **Detail**: Pole wklejania to własny `<textarea>` z klasami skopiowanymi z `Input` (`TEXTAREA_CLASS`, „Same look as `Input`”). AGENTS.md każe najpierw sprawdzić `src/components/ui/`, a brakujące dodać przez `npx shadcn@latest add <name>`; `textarea.tsx` nie ma. Propozycje dopasowania to surowe `<button>` z ręcznymi klasami hover/focus zamiast `Button variant="outline"`. Kolory to klasy ról, więc `ui:scan` jest czysty.
- **Fix**: `npx shadcn@latest add textarea` i użyć `Textarea`; propozycje przez `Button`.
- **Decision**: FIXED — dodany `src/components/ui/textarea.tsx` (shadcn wstawił import `cn` z pakietu npm `cn`; poprawione na `@/lib/utils`, `package.json` i lockfile cofnięte), `KitImport` używa `Textarea`, propozycje dopasowania to `Button variant="outline"`. Lint, prettier, `ui:scan`, `astro check` i testy unit + component czyste; wygląd nie sprawdzony w przeglądarce.

### F5 — Średnik na końcu linii psuje nagłówek i wiersze

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/kit-import-csv.ts:175
- **Detail**: Nagłówek `nazwa;moc;postac;waznosc;ilosc;` daje puste pole → `unknown-column` z pustą nazwą, ekran pokazuje „Nieznana kolumna „””. Ten sam średnik w wierszach danych robi z każdego wiersza `malformed`. Czaty czasem tak zwracają CSV.
- **Fix**: Odcinać jedno puste pole na końcu linii (nagłówka i wierszy) przed porównaniem liczby pól; test na oba przypadki.
- **Decision**: FIXED — `withoutTrailingEmpty` w `kit-import-csv.ts`: nagłówek traci jedno puste pole na końcu, wiersz tylko gdy ma o jedno pole więcej niż kolumn; drugi pusty koniec dalej jest błędem. 3 nowe testy (2 czerwone przed poprawką).

### F6 — Późny błąd workera listy zamyka przegląd i pozwala zapisać strony drugi raz

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/kit/KitImport.tsx:520; src/components/hooks/useRegistryListWorker.ts:86
- **Detail**: `onerror` workera woła `finish("error")` także po stanie „ready”. Wtedy `KitImport` odmontowuje `ImportReview` — znikają decyzje i `savedPages`; „Spróbuj ponownie” zaczyna od strony 1 bez oznaczenia zapisanych stron, więc można je zapisać jeszcze raz (duplikaty). Mało prawdopodobne, ale skutek to dane w apteczce.
- **Fix**: Gdy dopasowania już przyszły, ignorować późniejsze błędy listy (albo trzymać `ImportReview` zamontowany).
- **Decision**: FIXED — `KitImport` trzyma pierwsze `initialRows` dla danego tekstu (stan `kept`), więc późny błąd workera nie odmontowuje przeglądu; hook `useRegistryMatch` bez zmian (współdzielony z wyszukiwarką). Test „keeps the review and its decisions when the list worker fails…” (czerwony bez poprawki).

### F7 — Wiersze i „Zakończ import” aktywne w trakcie zapisu strony

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/kit/KitImport.tsx:312, :386, :493
- **Detail**: `saving` wyłącza tylko przycisk zapisu. W trakcie żądania można usunąć wiersz albo zmienić opakowanie/ilość — żądanie ma stary stan, a po 201 `savedItems += items.length` liczy też wiersz usunięty w międzyczasie (podsumowanie: zapisany i „usunięty” naraz). Kliknięcie „Zakończ import” w trakcie daje `?zaimportowano=N` bez tej strony.
- **Fix**: Przekazać `saving` do wierszy i linku „Zakończ import” (`disabled` / `aria-disabled`).
- **Decision**: FIXED — lista wierszy w `<fieldset disabled={saving}>`, link „Zakończ import” z `aria-disabled` i `preventDefault` na czas zapisu. Test sprawdza `:disabled` kontrolek wiersza i blokadę linku (kliknięcie wiersza nie jest testowane: jsdom omija blokadę z fieldset, przeglądarka jej przestrzega). Układ z `fieldset` nie sprawdzony wizualnie.

### F8 — Wygasła sesja przy wczytywaniu listy pokazana jako ogólny błąd

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/hooks/useRegistryMatch.ts:61
- **Detail**: Hook zamienia każdy stan inny niż „ready” na `error`, więc 401 daje „Nie udało się wczytać listy leków” z „Spróbuj ponownie”, które nie pomoże. `MedicineSuggest.tsx:112`, `RowPack` i zapis strony w tym samym ekranie pokazują „Zaloguj się”. Zgodne z kontraktem hooka w planie, ale niespójne.
- **Fix**: Przepuścić stan `unauthorized` z hooka i pokazać link do logowania.
- **Decision**: FIXED — `useRegistryMatch` zwraca `unauthorized` (osobny stan), `KitImport` pokazuje „Sesja wygasła — zaloguj się ponownie.” z linkiem do logowania, bez „Spróbuj ponownie”. Test hooka zmieniony świadomie (kontrakt 401: `error` → `unauthorized`), nowy test ekranu.

### F9 — Decyzja „dodaj jako osobne” zdejmuje oba oznaczenia naraz

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/kit-import.ts:191
- **Detail**: Jedna decyzja `duplicateDecision: "add"` gasi i „już masz”, i „powtórzony w imporcie”. Gdy wiersz przyjął „już masz”, a potem wcześniejszy wiersz dostaje ten sam wariant, oznaczenie „powtórzony” się nie pojawia. Plan mówi tylko o kasowaniu decyzji przy zmianie wariantu tego wiersza, więc to luka, nie odstępstwo.
- **Fix**: Kasować `duplicateDecision` wierszy, których powody blokady zmieniły się po przypisaniu innego wiersza — albo przyjąć jako świadomie akceptowane.
- **Decision**: FIXED — `duplicateDecision` przechowuje listę zaakceptowanych powodów (`DuplicateIssue[]`, helper `acceptDuplicates`), a `rowIssues` zdejmuje tylko te powody; nowy powód po decyzji blokuje wiersz ponownie. 2 nowe testy w `kit-import.test.ts`; istniejące testy zmienione tylko co do kształtu danych.

### F10 — Kolejność zwracanych `ids` opiera się na założeniu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/kit.ts:164
- **Detail**: Plan obiecuje `201 { ids }` w kolejności pozycji. `addKitItems` sortuje `ids` rosnąco, zakładając, że identity w jednym insercie PostgREST rośnie w kolejności wejścia — w praktyce prawda, ale bez gwarancji. Klient nie używa `ids`; test API złapałby zamianę.
- **Fix**: Zostawić, ale nie opierać na `ids` niczego w kliencie (komentarz już to opisuje) — albo usunąć obietnicę kolejności z kontraktu.
- **Decision**: SKIPPED — komentarz w kodzie opisuje założenie, klient nie używa `ids`, test API pilnuje kolejności.
