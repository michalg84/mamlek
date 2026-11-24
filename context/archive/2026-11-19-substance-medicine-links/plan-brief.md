# Przejścia substancja ↔ lek i dodanie leku z wyszukiwania — Plan Brief

## What & Why

Wycinek S-17 łączy istniejące ekrany. Substancja czynna jest linkiem na karcie leku na `/szukaj`, w wyniku sprawdzenia i na liście apteczki. Link prowadzi do listy leków z tą substancją. Z karty leku przycisk „Dodaj do apteczki” prowadzi do formularza dodawania z tym lekiem już wybranym. Dziś użytkownik musi przepisywać nazwy ręcznie, choć w PRD (FR-002, FR-003, FR-005, FR-011) te ścieżki są wspólną drogą do jednej decyzji.

## Starting Point

- Wyszukiwanie działa w Web Workerze (`searchVariants`: prefiksy słów, 20 wyników). Nie ma w nim filtra „zawiera substancję” ani lookupu po id.
- Każdy hook listy tworzy własny Worker, a z nim osobny `JSON.parse` 2 MB i osobną budowę indeksu.
- Stan `/szukaj` jest tylko w pamięci (brak `pushState`).
- `KitAddForm` przyjmuje tylko `version`.
- Lista apteczki nie pobiera substancji (`KIT_ITEM_SELECT`); wynik sprawdzenia je ma, ale jako zwykły tekst.

## Desired End State

- Klik substancji pokazuje na `/szukaj?substancja=X` leki z tą substancją: najpierw jednoskładnikowe, po 20, z „Pokaż więcej”.
- Wybór leku daje `/szukaj?lek=<id>` z kartą i wynikiem sprawdzenia. „Wstecz” i odświeżenie odtwarzają stan.
- „Dodaj do apteczki” otwiera `/apteczka?lek=<id>` z wybranym lekiem i opakowaniami.
- Na liście apteczki substancje są linkami.
- Każda strona ma dokładnie jeden Worker.

## Key Decisions

| Decyzja                                | Wybór                                                                                                                    | Source              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Co pokazuje klik substancji            | Filtr „wariant zawiera tę substancję” (cała nazwa po normalizacji), nie zwykłe wyszukiwanie tekstem                      | Plan                |
| Kolejność listy substancji             | Jednoskładnikowe przed złożonymi, w grupie kolejność indeksu (aktywne przed wycofanymi)                                  | Plan                |
| Liczba pozycji                         | 20 + „Pokaż więcej” po 20; zwykłe podpowiedzi bez zmian                                                                  | Plan                |
| Historia                               | Stan w URL (`?substancja`, `?lek`), `pushState` na każdy klik, `popstate` dla „Wstecz”; `lek` wygrywa, gdy są oba        | Plan                |
| Przekazanie leku do apteczki           | `/apteczka?lek=<id reprezentanta>`, lookup w workerze, nieznane id ignorowane                                            | Plan                |
| Powrót po logowaniu z głębokim linkiem | Poza zakresem                                                                                                            | Plan                |
| Poziom dopasowania                     | Klik go nie zmienia, zostaje w `localStorage`                                                                            | Plan                |
| Liczba Workerów                        | Jeden wspólny uchwyt (`RegistryListHandle`) z subskrypcją, id żądań z licznika modułu; import CSV bez zmian              | Plan                |
| Linki w komponentach współdzielonych   | Zwykłe `<a href>`, przechwytywane na `/szukaj` delegowanym listenerem (z pominięciem Ctrl/⌘/Shift/środkowego klika)      | Plan                |
| Dane substancji dla apteczki           | Zagnieżdżony select `registry_product_substances` w `KIT_ITEM_SELECT`, sortowanie po `position` w mapperze, bez migracji | Research            |
| Dodawanie                              | Zostaje na `/apteczka`, bez formularza na `/szukaj`                                                                      | Research (roadmapa) |

## Scope

**W zakresie:** filtr substancji i lookup w workerze, wspólny Worker, stan `/szukaj` w URL-u, lista leków z substancją, linki substancji (karta, wynik sprawdzenia, lista apteczki), przycisk „Dodaj do apteczki”, preselekcja w `KitAddForm`, testy unit, component i API, dopiski w AGENTS.md i PRD.

**Poza zakresem:** powrót po logowaniu, poziom dopasowania w URL-u, zmiany `medicine_check` i migracje, linki z nazwy leku, formularz dodawania na `/szukaj`, wspólny Worker dla wierszy importu CSV, tłumaczenie nazw łacińskich.

## Architecture

```
szukaj.astro ── parseSearchState(Astro.url) ──► RegistrySearch(initialVariantId, initialSubstance)
                                                 │  useRegistryListWorker(version) → handle (1 Worker)
                                                 ├─ MedicineSuggest(list, pickedName)   → search
                                                 ├─ useRegistryLookup(list, id)        → lookup
                                                 ├─ useSubstanceVariants(list, s, n)   → substance
                                                 ├─ VariantCard + SubstanceLink + „Dodaj do apteczki”
                                                 └─ MedicineCheckResult → KitItemDetails → SubstanceLink
                                                 pushState / replaceState / popstate ◄─ delegowany click
apteczka.astro ── ?lek ──► KitAddForm(initialVariantId) ── handle → MedicineSuggest + useRegistryLookup
             └─ KitList → KitItemDetails(substances) ◄─ KIT_ITEM_SELECT + registry_product_substances
```

## Phases at a Glance

| #   | Faza                                                                  | Wynik                                                              |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | Filtr substancji, lookup po id i wspólny worker                       | Logika i protokół gotowe, jeden Worker na stronę, ekrany bez zmian |
| 2   | `/szukaj`: stan w URL-u, lista substancji, linki, „Dodaj do apteczki” | Cała ścieżka substancja → lek → przycisk dodania na `/szukaj`      |
| 3   | `/apteczka?lek=<id>`: lek wybrany w formularzu (równolegle z 4)       | Przycisk dodania kończy się gotowym formularzem                    |
| 4   | Substancje na liście apteczki (równolegle z 3)                        | Linki substancji na liście, `substances` w `KitItem` i w `PATCH`   |
| 5   | Dokumentacja                                                          | AGENTS.md i PRD opisują nowe zachowanie i testy                    |

**Prerequisites:** lokalny Supabase (Docker) z zaimportowanymi fixture do `test:api` i `test:db` (faza 3 i 4); pełny rejestr lokalnie do `search:check` (faza 1, opcjonalnie); `npx playwright install chromium` do `ui:shots`/`perf` (faza 2).

**Effort:** średni-duży. Najwięcej pracy w fazach 1 i 2 (refaktor hooków workera i stan historii); fazy 3–5 są małe.

## Open Risks

- **Refaktor uchwytu workera** dotyka wszystkich konsumentów listy (`/szukaj`, `/apteczka`, import CSV). Ryzyko łagodzą istniejące testy component bez zmian asercji (bramka 1.2) i test liczby Workerów.
- **Synchronizacja historii** (`pushState`/`replaceState`/`popstate`, liczba pozycji w `history.state`) łatwo daje pętle albo zgubione stany. Każde przejście ma scenariusz component.
- **Wydajność:** leniwe klucze nie zmieniają `buildMs`, ale potwierdzi to dopiero `npm run perf` na wolnym profilu (zapas ok. 350 ms).
- **Nazwy substancji w rejestrze** mają różne zapisy (np. sól vs. zasada). Filtr po całej nazwie pokaże tylko dokładnie tę samą nazwę; to świadome ograniczenie, nie błąd.
- **Liczby wariantów** dla popularnych substancji nie zostały policzone (Docker nie działał w czasie researchu). „Pokaż więcej” obsługuje każdą liczbę, ale UX długich list trzeba ocenić ręcznie.

## Success Criteria

- Testy unit filtra, lookupu i parsera URL-a oraz testy component ekranów `/szukaj`, `/apteczka` (formularz, lista) i regresji importu przechodzą w CI.
- `npm run test:api` potwierdza `substances` w odpowiedzi `PATCH`; `test:db` bez zmian.
- Jeden Worker na stronę (test component).
- Ręcznie: pełna ścieżka substancja → lek → „Dodaj do apteczki” → dodanie, „Wstecz” i odświeżenie odtwarzają stan, a czas do gotowej listy nie pogarsza się na wolnym profilu.
