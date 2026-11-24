---
date: 2026-11-19T19:00:03+01:00
researcher: Claude (Sonnet 5.5)
git_commit: c34e134
branch: main
repository: mamlek
topic: "S-17 substance-medicine-links: co dziś jest w kodzie pod przejścia substancja ↔ lek i dodanie leku z wyszukiwania"
tags: [research, codebase, szukaj, apteczka, RegistrySearch, KitAddForm, KitItemDetails, MedicineCheckResult]
status: complete
last_updated: 2026-11-19
last_updated_by: Claude (Sonnet 5.5)
---

# Research: S-17 substance-medicine-links

**Date**: 2026-11-19T19:00:03+01:00
**Researcher**: Claude (Sonnet 5.5)
**Git Commit**: c34e134 (working tree: `context/foundation/roadmap.md` zmieniony, bez zmian w `src/`)
**Branch**: main
**Repository**: mamlek

## Research Question

Roadmap S-17 (`context/foundation/roadmap.md:324-337`): użytkownik klika substancję czynną (karta wybranego leku na `/szukaj`, lista apteczki, wynik sprawdzenia), widzi na `/szukaj` leki z tą substancją, wybiera lek, widzi kartę i wynik sprawdzenia, a „Dodaj do apteczki” prowadzi do formularza dodawania na `/apteczka` z tym lekiem już wybranym. Co dziś istnieje w kodzie i w dotychczasowych decyzjach, na czym ten wycinek może się oprzeć, a czego brakuje?

## Summary

Wycinek jest czystym połączeniem istniejących ekranów, ale w kodzie brakują cztery elementy: (1) żaden ekran nie ma wejścia z zewnątrz (brak stanu URL na `/szukaj`, brak parametru wyboru leku na `/apteczka`); (2) substancje są wszędzie zwykłym tekstem; (3) lista apteczki w ogóle nie ma substancji (serwer ich nie ładuje); (4) wyszukiwanie nie ma trybu „tylko ta substancja”, a limit 20 wyników zamrożono wcześniejszą decyzją. Trzy niewiadome z roadmapu są nadal nierozstrzygnięte i żadna wcześniejsza decyzja ich nie przesądza.

Dla `/10x-plan` — ustalone fakty:

- Substancje to surowe łacińskie nazwy rejestru (`string[]`, w kolejności `position`), np. „Ibuprofenum”; osobne pole `commonName` ma postać „A + B” (`src/types.ts:12-20`, `RegistrySearch.tsx:35-44`).
- Wyszukiwanie już dziś znajduje substancję (poziom D, prefiks słowa), ale po nazwie, nazwie powszechnej i dopiero na końcu po substancji (`src/lib/registry-search.ts:262-286`).
- Identyfikator wariantu na obu ekranach to `id` reprezentanta wariantu (produkt rejestru); `/api/kit/check` i `/api/registry/packages` przyjmują `?product=<id>`.
- `KitAddForm` nie ma wejścia na wybrany lek; najtańszy szew to opcjonalny prop wariantu plus początkowe zapytanie w `MedicineSuggest`.

Rzeczywiste wybory do podjęcia (nie fakty): sposób wyświetlania popularnej substancji (limit 20), tryb „tylko ta substancja”, historia przeglądarki, nośnik wyboru leku do `/apteczka` (id w URL rozwiązywane na serwerze czy pola wariantu w URL), obsługa powrotu po logowaniu.

## Detailed Findings

### `/szukaj`: dane i dopasowanie

- Wpis listy to krotka `[id, name, strength, form, commonName, substances[], withdrawn?]` (`src/types.ts:12-20`), dekodowana do `RegistryVariant` (`src/types.ts:30-39`, `src/lib/registry-search.ts:219-226`). Lista pochodzi z tabeli `registry_search_list`, budowanej przez `registry_refresh_search_list()` (`supabase/migrations/20261117120000_variant_key_btrim.sql:29-128`, krotka `:83-109`); moc obcięta do 80 znaków (`:87`).
- Dopasowanie: normalizacja (małe litery, bez diakrytyków), słowa jako ciągi `[a-z0-9]`, min. 3 znaki (`registry-search.ts:41-55`, `:74`). Poziomy A–D: pierwsze słowo nazwy, dalsze słowo nazwy, nazwa powszechna, substancje (`:262-286`). Słowa wszystkich substancji są spłaszczone w jedną pulę (`:222`), więc zapytanie „Ibuprofenum” znajduje też leki złożone, a trybu „tylko substancja X” nie ma.
- Limit: `MAX_RESULTS = 20` (`registry-search.ts:6`, cięcie `:317-322`), komunikat „Pokazano X z Y — dopisz kolejne słowo, np. część nazwy” w `MedicineSuggest.tsx:136-137`. `searchVariants` przyjmuje parametr `limit`, ale worker zawsze przekazuje `MAX_RESULTS` (`registry-search.worker.ts:59`). Protokół workera ma tylko wiadomości `load`, `search`, `match` (`src/types.ts:194-207`).
- Poziom dopasowania (exact/all/any) wpływa tylko na sprawdzenie (`useMedicineCheck.ts:36`), nie na podpowiedzi; zapis w `localStorage` pod `mamlek:match-level` (`useMatchLevel.ts:5`), domyślnie `exact` (`src/lib/match-level.ts:10`).

### `/szukaj`: karta, wynik, stan

- Karta `VariantCard` (`RegistrySearch.tsx:27-48`): substancje jako `<ul><li>` zwykłego tekstu, po jednej na pozycję — każda daje się osobno uczynić klikalną. Nazwa powszechna to osobne pole tekstowe.
- Wynik sprawdzenia: `MedicineCheckResult.tsx:34-44` renderuje pozycje przez `KitItemDetails` z `substances={item.substances}`; `KitItemDetails.tsx:31-33` drukuje je jako jeden akapit `substances.join(", ")`. Komponent jest współdzielony z listą apteczki (`KitList.tsx:218`). Linia werdyktu „ta sama substancja” wymienia nazwy pozycji, nie substancje (`medicine-check-verdict.ts:144-153`).
- Stan: `selected` i `searched` w stanie React (`RegistrySearch.tsx:84-86`); tekst zapytania to lokalny `useState("")` w `MedicineSuggest.tsx:28`, bez propa na zapytanie początkowe lub sterowane; `onEdit` czyści wybór (`RegistrySearch.tsx:96-98`).
- URL: `szukaj.astro` nie czyta `Astro.url.searchParams`; w `src/` nie ma `pushState`/`replaceState`/`popstate` (przeszukane przez dwóch workerów). `/szukaj?substancja=X` byłoby dziś po cichu ignorowane. Czytanie `window.location` w renderze rozjechałoby hydratację; dotychczasowy wzorzec to `useSyncExternalStore` ze snapshotem serwera (`useMatchLevel.ts:46-57`) albo odczyt w `.astro` i przekazanie propa.
- Na `/szukaj` nie ma przycisku „Dodaj do apteczki” ani linku do `/apteczka` poza nawigacją (`src/components/Topbar.astro:19`).

### `/apteczka`: formularz dodawania

- Wybór leku: `useState<RegistryVariant | null>` w `KitAddForm.tsx:293`, wartość tylko z `onSelect` w `MedicineSuggest` (`:298-305`); `PackForm` z `key={variant.id}` (`:307`) pobiera opakowania z `/api/registry/packages?product=<id>` (`useVariantPackages.ts:38`, route `packages.ts:6,24`). `PackForm` potrzebuje z wariantu tylko `id`, `name`, `strength`, `form`, `withdrawn` (`KitAddForm.tsx:143,229-233`).
- `KitAddForm` przyjmuje tylko `version` (`:20-23`). Wstępny wybór wymaga propa `initialVariant` i początkowego zapytania w `MedicineSuggest` (inaczej pole tekstowe jest puste przy widocznym formularzu opakowania).
- Worker nie ma wyszukiwania po id; `apteczka.astro` musiałby rozwiązać id po stronie serwera (np. `registry_products`, odczyt dla `authenticated`: `20261001120000_registry_tables.sql:153-157`) albo nieść pola wariantu w URL. Wzorzec „sprawdź i zignoruj” już istnieje: `?dodano=<id>` (`apteczka.astro:41-48`), `?zaimportowano` (`:23-30`).
- Układ: formularz zawsze otwarty nad listą; kotwice `#add-heading` i `#list-heading` (`apteczka.astro:99-121`).
- Wycofane: wariant wycofany można dodać; `WithdrawnVariantNote` przy „Wybrano” (`KitAddForm.tsx:232`); serwer przyjmuje wycofane opakowania (`api/kit/index.ts:47-52`). Link z wariantu musi nieść poprawne `withdrawn` (= wszystkie produkty klucza wycofane); dla id reprezentanta wystarcza `removed_at` (ranking stawia aktywne pierwsze, `20261117120000:58-72`), dla innego id produktu — nie.

### `/apteczka`: lista i substancje

- `KitList` nie przekazuje `substances` do `KitItemDetails` (`KitList.tsx:218-232`); `KitItem` nie ma pola substancji (`src/types.ts:63-80`); `KIT_ITEM_SELECT` łączy `registry_packages` → `registry_products(name, strength, pharmaceutical_form, marketing_authorization_holder, removed_at)` bez substancji (`src/lib/services/kit.ts:175-196`) i ten sam select obsługuje listę, pojedynczy odczyt i odpowiedź PATCH (`:199,215,236`).
- Substancje są w `registry_product_substances(product_id, position, name, …)` (`20261001120000_registry_tables.sql:65-75`, odczyt `authenticated` `:158-162`). Zagnieżdżony select to wniosek, nieprzetestowany.
- `KitItem.productId` to produkt tego opakowania, niekoniecznie reprezentant wariantu używany na `/szukaj` (`kit.ts:184`); opakowania działają dla dowolnego id wariantu, wyszukiwanie po id na liście nie.

### Auth

- `PROTECTED_ROUTES = ["/szukaj", "/apteczka"]` (`src/middleware.ts:5`, `:43-46`). Niezalogowany trafia na `/auth/signin` bez adresu powrotnego; po zalogowaniu zawsze `/szukaj` (`src/pages/api/auth/signin.ts:23`). Głęboki link z parametrem po drodze przez logowanie traci parametr; zachowanie go to nowa praca z kontrolą open redirect.

### Testowe szwy

- `RegistrySearch.test.tsx`: `stubRoutedFetch`, `stubSearchWorker` (prawdziwy `buildSearchIndex`/`searchVariants`), `answerCheck`, fixture `tests/fixtures/registry-search-list.ts`; żaden test nie ustawia `window.location`. `KitAddForm.test.tsx:38-101` renderuje `<KitAddForm version>` z pakietami po id produktu. `KitList.test.tsx` ma fabrykę `kitItem()`, którą trzeba by uzupełnić o `substances`.

## Code References

- `src/components/registry/RegistrySearch.tsx:27-48` — karta wybranego leku, substancje jako zwykły `<li>`
- `src/components/registry/RegistrySearch.tsx:84-98` — stan `selected`/`searched`, `onEdit`
- `src/components/registry/MedicineSuggest.tsx:28,53-58,136-137` — lokalne zapytanie, `select()`, komunikat limitu
- `src/components/registry/MedicineCheckResult.tsx:34-44` — wynik sprawdzenia, `KitItemDetails` z substancjami
- `src/components/kit/KitItemDetails.tsx:17,31-33` — substancje jako jeden akapit; współdzielony z `KitList.tsx:218`
- `src/components/kit/KitAddForm.tsx:20-23,293-307` — brak wejścia na wybrany lek
- `src/lib/registry-search.ts:6,222,262-286,317-322` — limit 20, pula substancji, poziomy A–D
- `src/lib/registry-search.worker.ts:59` — worker zawsze z `MAX_RESULTS`
- `src/lib/services/kit.ts:175-196` — select apteczki bez substancji
- `src/pages/apteczka.astro:23-48,99-121` — parametry URL i układ strony
- `src/middleware.ts:5,43-46`, `src/pages/api/auth/signin.ts:23` — ochrona tras, brak adresu powrotnego
- `supabase/migrations/20261117120000_variant_key_btrim.sql:29-128` — budowa listy wyszukiwania

## Architecture Insights

- Stan `/szukaj` to wyłącznie stan React; poziom dopasowania świadomie zapisano w `localStorage`, bez URL-a (`context/archive/2026-11-17-substance-match-level/plan.md:12,33`). Pierwszy stan URL na `/szukaj` byłby odejściem od tego precedensu (nie zakazem: dotyczył poziomu dopasowania).
- Zapytanie i wybór są rozdzielone: `MedicineSuggest` trzyma tekst, rodzic wybór. Każde sterowanie z zewnątrz (klik substancji, preselekcja) wymaga nowego propa/szwu w tym komponencie, wspólnym dla `/szukaj` i `KitAddForm`.
- Wzorzec parametru URL w `.astro` (cyfry, sprawdzenie, ignorowanie błędnych) już istnieje i nadaje się do `/apteczka`.
- Zmiana select-u apteczki dotyka też PATCH i testów `KitList`; zmiana listy wyszukiwania/workera dotyka budżetu wydajności.

## Historical Context (from prior changes)

- `context/archive/2026-10-02-registry-search-suggestions/plan.md:46-57,206,222` — poziomy A–D, `MAX_RESULTS = 20`, `MIN_QUERY_LENGTH = 3`, komunikat „dopisz kolejne słowo” (ustalone). Research tej zmiany notował rozważaną, nieprzyjętą „osobną małą listę substancji” (34–40 KB, `research.md:87`) i 4 258 unikalnych nazw substancji (`:45`).
- `context/archive/2026-10-06-registry-search-performance/plan.md:48` — zmiana reguły dopasowania, limitu 20 i komunikatów była poza zakresem (zamrożone; zmiana limitu to nowa decyzja). Lista ok. 16 165 wariantów, 2,0 MB surowo / 337 kB skompresowane (`:11,16`); cele: 3 s (Fast 4G, CPU 4x) i 5 s (Slow 4G, CPU 6x), INP < 200 ms (`:30`); zapas na wolnym profilu ok. 350 ms (`:567`) — wzrost listy lub pracy workera wymaga ponownego pomiaru. S-13 dołożył ok. 6,9% do payloadu (`context/foundation/test-plan.md:153`).
- `context/archive/2026-11-17-substance-match-level/plan.md:12,33,202` — brak stanu URL na `/szukaj`, poziom w `localStorage` `mamlek:match-level`.
- `context/archive/2026-10-09-medicine-check/plan.md:13,65,108` — substancje to wolny tekst bez normalizacji, normalizacja check = trim + lowercase + zwinięcie spacji, do wyświetlenia surowa pisownia. Normalizacja wyszukiwania (bez diakrytyków, prefiks słowa) różni się od normalizacji sprawdzenia.
- `context/archive/2026-10-10-testing-check-verdict-correctness/placeholder-measurement.md:117` — separatory inne niż „+” (118 nazw, 210 produktów) to znane ograniczenie, decyzja autora z 2026-10-13: nic nie robimy.
- PRD: FR-002 (`prd.md:145`, limit 20, 3 znaki), FR-003 (`:152`), FR-005 (`:157`), FR-011 (`:177`), FR-016 (`:182`); Non-Goals (`:315-345`) nie wspominają o linkach ani nawigacji. Poza `roadmap.md:324-336` żaden dokument nie wspomina o klikalnych substancjach, URL-u `/szukaj` ani historii przeglądarki (przeszukane: PRD, shape-notes, test-plan, 11 wymienionych archiwów).

## Related Research

Brak osobnych dokumentów research dla S-17. Pokrewne: `context/archive/2026-10-02-registry-search-suggestions/research.md`, `context/archive/2026-11-17-substance-match-level/` (plan).

## Open Questions

Niewiadome z roadmapu (wszystkie „Owner: autor, Block: no”, `roadmap.md:333-335`) — dane z kodu do decyzji:

1. **Popularna substancja i limit 20.** Dziś kliknięcie zapytania „Ibuprofenum” trafia w limit 20 (poziom D jest na końcu rankingu, po dopasowaniach nazwy). Nie zmierzono liczby wariantów dla konkretnych substancji (jedyny punkt odniesienia: `ibu 400` = 53, `registry-search-suggestions/plan.md:56`). Opcje wymagają: (a) dłuższej listy — nowy limit w workerze/UI, nowy pomiar wydajności; (b) dopisania mocy — bez zmian w kodzie; (c) zostawienia limitu.
2. **Pisownia i „tylko ta substancja”.** Rejestr daje łacinę, a zapytanie „Ibuprofenum” już pasuje. „Tylko ta substancja” (np. nie leki złożone) wymaga nowego trybu filtra po równości znormalizowanej substancji — nowy kod w `registry-search.ts` i nowa wiadomość workera. Prawdziwe pisownie rejestru poza fixture’ami (sole, ekstrakty z przecinkami) nie były sprawdzane.
3. **Historia przeglądarki.** Brak jakiegokolwiek stanu URL na `/szukaj`; wybór „wstecz wraca do poprzedniego leku” oznacza wprowadzenie historii/URL-a od zera, „tylko podmiana zapytania” nie wymaga URL-a, ale też nie pozwala linkować z `/apteczka` (to wymaga parametru URL na `/szukaj`).

Dodatkowe luki odkryte w badaniu (nie ma ich w roadmapie):

4. Nośnik przejścia z `/apteczka` na `/szukaj` (kliknięcie substancji na liście) — wymaga parametru URL na `/szukaj` i dołożenia substancji do selectu apteczki.
5. Nośnik wyboru leku `/szukaj` → `/apteczka` (id rozwiązywane na serwerze czy pola wariantu w URL; id reprezentanta vs id produktu opakowania).
6. Powrót po logowaniu z głębokim linkiem (dziś tracony).
7. Czy kliknięcie substancji ma ustawiać poziom dopasowania (np. `any`); dziś poziom jest zapisywany w `localStorage` i przestawienie go zmieniłoby ustawienie użytkownika.

Niesprawdzone: `useKitItemActions.ts`, reszta `kit-format.ts`, `apteczka/import.astro` (poza grepem), `WithdrawnVariantNote.tsx`, `useRegistryMatch.ts`; czy `/api/kit/check` przyjmuje dowolne id wariantu (wnioskowane z użycia reprezentanta, nie zweryfikowane w SQL).
