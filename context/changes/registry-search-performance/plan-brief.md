# S-09: Wydajność wyszukiwania leków na słabym telefonie — Plan Brief

> Full plan: `context/changes/registry-search-performance/plan.md`

## What & Why

Na słabym telefonie (Slow 4G + CPU 6x) strona `/szukaj` potrzebuje ok. 11 s, zanim podpowiedzi zaczną działać, a pisanie w trakcie wczytywania zacina się do 1,36 s. Komponent podpowiedzi obsłuży jeszcze S-02, S-03 i S-04, więc jego opóźnienia przeszłyby na trzy kolejne ekrany. Plan skraca czas do gotowości listy i usuwa zacinanie przy pisaniu bez zmiany wyników wyszukiwania.

## Starting Point

- Lista (337 kB zstd, 2 MB surowo) zaczyna się pobierać dopiero po hydratacji wyspy React.
- Parsowanie JSON i budowa indeksu 16 tys. wariantów zajmują ok. 2,5 s jednym blokiem na głównym wątku.
- Wyszukiwanie i render są synchroniczne przy każdym znaku (najdłuższa interakcja 336 ms).
- Brak skryptu pomiarowego i testów reguły dopasowania.

## Desired End State

- Pole wyszukiwania reaguje od pierwszej chwili. Tekst wpisany przed gotowością listy zostaje, a wyniki pojawiają się same.
- Na produkcji lista jest gotowa w < 3 s na zwykłym telefonie i w ≤ 5 s na słabym, a pisanie na słabym nie przekracza 200 ms na interakcję.
- `npm run perf` i `npm run search:check` pozwalają powtórzyć pomiar i sprawdzić regułę przy kolejnych zmianach komponentu.

## Key Decisions Made

| Decision            | Choice                                                                                                       | Why (1 sentence)                                                                      | Source |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------ |
| Cele                | Fast 4G + CPU 4x: lista < 3 s; Slow 4G + CPU 6x: lista ≤ 5 s, INP < 200 ms, brak zadań > 200 ms przy pisaniu | Odwzorowuje PRD: czas na zwykłym telefonie, używalność na starym.                     | Plan   |
| Narzędzie pomiaru   | Skrypt Playwright w repo (liczby) + `chrome-devtools-mcp` (diagnoza trace'ów)                                | Powtarzalna liczba przed i po każdym kroku oraz analiza tego, gdzie idzie czas.       | Plan   |
| Środowisko          | Iteracja lokalnie, liczby docelowe na produkcji (baseline i po wdrożeniu)                                    | Lokalny preview nie kompresuje listy, więc zawyża czasy sieci.                        | Plan   |
| Zakres              | Kroki kolejno, stop po osiągnięciu celów; fazy 5–6 warunkowe po bramce na produkcji                          | Nie robimy pracy, której pomiar nie uzasadnia.                                        | Plan   |
| Indeks              | Web Worker trzyma indeks i wyszukuje; strona pobiera bajty i przekazuje je bez kopiowania                    | Główny wątek nie dotyka 2 MB danych, a preload zostaje przejęty przez `fetch` strony. | Plan   |
| Ochrona reguły      | Skrypt porównawczy ze wzorcem ok. 29 zapytań na pełnej liście, bez runnera testów                            | Wychwytuje każdą zmianę wyników i kolejności, bez wprowadzania strategii testowej.    | Plan   |
| Pomiary produkcyjne | Uruchamia użytkownik z własnym kontem (`PERF_EMAIL`/`PERF_PASSWORD`)                                         | Agent nie wpisuje prawdziwych danych logowania.                                       | Plan   |

## Scope

**In scope:**

- skrypt `npm run perf` (oba profile, gotowość listy, pisanie w trakcie i po wczytaniu);
- skrypt `npm run search:check`;
- `chrome-devtools-mcp`;
- preload listy;
- Web Worker z indeksem i nowy hook;
- bramka na produkcji;
- warunkowo: render przy pisaniu i rozmiar JS.

**Out of scope:**

- zmiana formatu i rozmiaru listy w bazie;
- wyszukiwanie po stronie serwera;
- service worker, offline i cache indeksu (IndexedDB);
- runner testów i pomiary w CI;
- zmiany reguły dopasowania i komunikatów.

## Architecture / Approach

1. HTML strony `/szukaj` niesie `<link rel="preload">` listy, więc pobieranie rusza razem z JS.
2. Hook `useRegistrySearch(version, query)` przejmuje tę odpowiedź, bierze surowe bajty i przekazuje je Web Workerowi.
3. Worker parsuje listę, buduje indeks tą samą funkcją co dziś i odpowiada na zapytania (≤ 20 wyników z numerem zapytania). Stare odpowiedzi są odrzucane.
4. `MedicineSuggest` tylko rysuje wyniki.
5. Pomiar: Playwright z dławieniem sieci i CPU przez CDP, także w workerze, oraz znacznik `performance.mark` gotowości listy.

## Phases at a Glance

| Phase                              | What it delivers                                                              | Key risk                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1. Pomiar i wzorzec                | `npm run perf`, `npm run search:check`, DevTools MCP, baseline lokalny i prod | Dławienie CPU przez CDP może nie obejmować workera (sprawdzane w fazie 3) |
| 2. Preload listy                   | Pobieranie listy równolegle z JS strony                                       | Niezgodność preloadu z `fetch` = podwójne pobieranie                      |
| 3. Indeks w Web Workerze           | Płynne pisanie od pierwszej chwili, asynchroniczne wyniki                     | Miganie lub nieaktualne wyniki przy szybkim pisaniu                       |
| 4. Pomiar na produkcji (bramka)    | Liczby docelowe i decyzja o fazach 5–6                                        | Wymaga merge'a i wdrożenia                                                |
| 5. Render przy pisaniu (warunkowa) | INP < 200 ms na profilu słabym                                                | Zysk zależy od wyniku trace'u                                             |
| 6. Rozmiar JS (warunkowa)          | Szybsza gotowość listy                                                        | Transfer listy może zostać wąskim gardłem poza zakresem                   |

**Prerequisites:**

- pełny import rejestru w lokalnej bazie;
- `npx playwright install chromium`;
- restart sesji Claude Code po dodaniu `chrome-devtools-mcp`;
- konto na produkcji do pomiarów użytkownika.

**Estimated effort:** ~3–4 sesje dla faz 1–4, po ~1 sesji na każdą z faz warunkowych.

## Open Risks & Assumptions

- Zakładamy, że 6 s „reszty” w baseline to w dużej części wtyczki Brave. Pierwszy pomiar w czystym Chromium (faza 1) to potwierdzi albo obali.
- Jeśli dławienie CDP nie obejmie workera, liczby gotowości listy będą zaniżone. Skrypt musi to wykryć i zgłosić.
- Przy ok. 2,5 s samego transferu listy na Slow 4G cel 5 s zostawia mały zapas. Jeśli nie wystarczy, kolejnym krokiem jest zmniejszenie listy w bazie (osobny wycinek).

## Success Criteria (Summary)

- Na produkcji, w czystym Chromium, cele obu profili są spełnione i zanotowane obok baseline'u.
- `npm run search:check` potwierdza identyczne wyniki i kolejność podpowiedzi jak w S-01.
- Użytkownik może pisać od razu po wejściu na `/szukaj`, bez zacinania, a wyniki pojawiają się same po wczytaniu listy.
