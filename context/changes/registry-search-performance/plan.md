# S-09: Wydajność wyszukiwania leków na słabym telefonie — plan implementacji

## Overview

Na słabym telefonie strona `/szukaj` potrzebuje dziś ok. 11 s, zanim podpowiedzi zaczną działać, a pisanie w trakcie wczytywania zacina się nawet na 1,36 s (FR-002, NFR czas odpowiedzi). Plan zaczyna od powtarzalnego pomiaru i wzorca wyników reguły dopasowania. Potem pobieranie listy rusza od razu z HTML-em (preload), a parsowanie, budowa indeksu i wyszukiwanie przechodzą do Web Workera. Dalsze kroki (render przy pisaniu, rozmiar JS) wykonujemy tylko wtedy, gdy pomiar na produkcji pokaże, że cele nie są spełnione. Komponent podpowiedzi obsłuży S-02, S-03 i S-04, więc zysk przejdzie na trzy kolejne ekrany.

## Current State Analysis

- **Baseline** (roadmapa S-09, 2026-10-02, produkcja, Brave z wtyczkami, Slow 4G + CPU 6x):
  - od wejścia do działających podpowiedzi 11,11 s;
  - pobranie listy 2,46 s (337 kB zstd z 2,0 MB);
  - `JSON.parse` i budowa indeksu 2,47 s jednym zadaniem na głównym wątku;
  - ok. 6 s reszty (HTML, JS, start Reacta, wtyczki);
  - najdłuższa interakcja przy pisaniu po załadowaniu 250–336 ms, a w trakcie budowy indeksu ok. 1,36 s.
- **Lista zaczyna się pobierać dopiero po hydratacji wyspy.** `szukaj.astro:37` (`client:load`) → `useEffect` w `src/components/hooks/useRegistrySearchList.ts:29-69` → `fetch`. Przeglądarka nie zna adresu listy, dopóki nie pobierze i nie uruchomi JS strony.
- **Parsowanie i budowa indeksu blokują główny wątek.** Hook wywołuje `response.json()` i `buildSearchIndex(data)` (`useRegistrySearchList.ts:53-58`). `buildSearchIndex` (`src/lib/registry-search.ts:74-92`) normalizuje słowa 16 165 wariantów i sortuje je collatorem `pl`. Benchmark syntetyczny z przeglądu S-01: 88–120 ms bez dławienia, czyli ok. 0,5–0,7 s przy CPU 6x, plus parsowanie.
- **Wyszukiwanie przy pisaniu jest synchroniczne.** `MedicineSuggest.tsx:35-38` (`useMemo` → `searchVariants`) liczy wynik przy każdym znaku. Samo `searchVariants` to ok. 25 ms przy CPU 6x, więc większość 336 ms to prawdopodobnie render i layout. Nikt tego nie sprofilował (przegląd S-01, F3/F5).
- **Layout nie ma miejsca na znaczniki w `<head>`** (`src/layouts/Layout.astro:14-19`).
- **Narzędzia:** brak Playwrighta, Lighthouse'a i runnera testów jednostkowych. Wtyczka Claude in Chrome działa w profilu użytkownika z wtyczkami i nie umie włączyć dławienia CPU ani sieci. Node 22.14 lokalnie i w CI. `registry-import-check.mjs` łączy się z bazą przez wymagane `DATABASE_URL` (`:13-19`).
- **Lokalny `npm run preview` nie kompresuje listy** (2 MB, 12,11 s przy Slow 4G w S-01 3.8). Na produkcji Cloudflare kompresuje ją do 337 kB.
- **PRD** (`context/foundation/prd.md:188-198`): poniżej 3 s ma być wynik sprawdzenia na telefonie z aktualną przeglądarką. Na telefonie do 8 lat starym wymagana jest używalność, nie czas.

## Desired End State

**Cele** (mediana z 5 przebiegów `npm run perf` na produkcji, zimny cache):

| Profil                           | Lista gotowa od wejścia na `/szukaj` | Pisanie (`ibu 400`, po gotowości i w trakcie wczytywania)    |
| -------------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| Zwykły telefon: Fast 4G + CPU 4x | < 3 s                                | —                                                            |
| Słaby telefon: Slow 4G + CPU 6x  | ≤ 5 s                                | najdłuższa interakcja (INP) < 200 ms, żadne zadanie > 200 ms |

- `npm run perf` mierzy oba profile powtarzalnie, w czystym Chromium, lokalnie i na produkcji.
- `npm run search:check` potwierdza, że reguła dopasowania z S-01 daje te same wyniki co przed zmianami.
- `chrome-devtools-mcp` jest podłączony, więc agent może nagrywać i analizować trace'y z dławieniem.
- Pole wyszukiwania reaguje od pierwszej chwili. Tekst wpisany przed gotowością listy zostaje, a wyniki pojawiają się same, gdy lista jest gotowa.

### Key Discoveries:

- `src/components/hooks/useRegistrySearchList.ts:41-44`: `fetch` bez opcji poza `signal` i `cache`. Tryb `cors` i `credentials: same-origin` pasują do `<link rel="preload" as="fetch" crossorigin="anonymous">`, więc preload zostanie przejęty, jeśli adres jest identyczny.
- `src/lib/registry-search.ts` nie importuje niczego w czasie działania (tylko `import type` z `@/types`). Działa więc i w workerze (bundlowany przez Vite), i w Node 22.14 z `--experimental-strip-types` (skrypt porównawczy).
- `scripts/smoke.mjs:5-6`: lokalne konto testowe `smoke-${Date.now()}@example.com` z rejestracją bez potwierdzenia e-maila (lokalny Supabase). Ten sam wzorzec posłuży skryptowi pomiarowemu.
- `chrome-devtools-mcp` (Context7, `/chromedevtools/chrome-devtools-mcp`) ma narzędzie `emulate` z presetami sieci `Slow 4G`/`Fast 4G` i `cpuThrottlingRate`, nagrywanie trace'ów oraz flagę `--isolated=true` (czysty, tymczasowy profil).

## What We're NOT Doing

- **Zmniejszania listy w bazie** (spacje `jsonb::text` z F8, krótsze krotki, inny format). To zmiana migracji i importu, osobny wycinek, jeśli pomiar to uzasadni.
- **Wyszukiwania po stronie serwera**, service workera i trybu offline po przeładowaniu.
- **Zmian reguły dopasowania**, limitu 20 wyników i komunikatów. Kolejność i wyniki mają zostać identyczne (`search:check`).
- **Runnera testów jednostkowych** (Vitest) i pomiarów w CI. `perf` i `search:check` uruchamiamy ręcznie.
- **Cache'owania indeksu między wizytami** (IndexedDB) i pracy z wieloma kartami.
- **Lighthouse'a i pomiaru całej strony poza przepływem `/szukaj`.**
- **Faz 5 i 6** — pominięte, faza 4 pokazała spełnione cele (produkcja, 2026-10-07, mediana z 5): lista gotowa 1320 ms (zwykły) i 3969 ms (słaby), INP/zadania przy pisaniu na profilu słabym: najdłuższa interakcja 64 ms, najdłuższe zadanie 107 ms.

## Implementation Approach

Pomiar → preload → worker → bramka na produkcji → kroki warunkowe.

1. **Pomiar i wzorzec.** Najpierw jedno narzędzie pomiarowe dla wszystkich kroków: skrypt Playwright z dławieniem przez CDP. Do tego wzorzec wyników `searchVariants` na pełnej liście, zapisany przed jakąkolwiek zmianą.
2. **Preload.** Przenosi start pobierania listy z „po hydratacji” do „razem z HTML-em”.
3. **Worker.** Zdejmuje parsowanie, budowę indeksu i wyszukiwanie z głównego wątku. Strona nadal sama pobiera listę, żeby przejąć preload, i przekazuje workerowi surowe bajty bez kopiowania (`Transferable`).
4. **Bramka na produkcji.** Lokalny preview zawyża czasy sieci, więc o fazach 5–6 decyduje pomiar na produkcji po wdrożeniu faz 1–3.

## Critical Implementation Details

- **Dławienie CPU a worker.** `Emulation.setCPUThrottlingRate` wysłane do sesji CDP strony może nie obejmować dedykowanego workera, bo worker jest osobnym celem CDP. Wtedy pomiar zaniżyłby czas gotowości listy.
  - Skrypt pomiarowy włącza automatyczne dołączanie do celów (`Target.setAutoAttach`, `flatten: true`) i ustawia ten sam współczynnik w sesji workera.
  - Worker raportuje własny czas budowy indeksu. Przy CPU 6x musi być co najmniej ok. 4 razy dłuższy niż bez dławienia, i to sprawdzamy ręcznie w fazie 3.
  - Jeśli workera nie da się dławić, skrypt wypisuje wyraźne ostrzeżenie przy wyniku.
- **Preload musi się zgadzać 1:1 z `fetch`.** Ten sam adres (`/api/registry/search-list?v=<version>`), `as="fetch"`, `crossorigin="anonymous"`. Pobieranie zostaje na głównym wątku. `fetch` z workera nie przejmie preloadu dokumentu i pobrałby listę drugi raz.
- **Wyniki asynchroniczne.**
  - Każde zapytanie do workera ma rosnący numer, a odpowiedź z innym numerem niż ostatni jest odrzucana.
  - Komponent pokazuje poprzednie wyniki do czasu nowej odpowiedzi (bez migania). Komunikat „Brak leku o takiej nazwie w rejestrze” pokazuje tylko wtedy, gdy odpowiedź dotyczy bieżącego zapytania.
  - Gdy lista staje się gotowa, hook od razu wysyła bieżące zapytanie, więc tekst wpisany wcześniej daje wyniki bez dopisywania znaku.
- **Gotowość listy w pomiarze** to znacznik `performance.mark("mamlek:search-list-ready")`. Gdy go brak (produkcja przed zmianami), jest to moment zniknięcia tekstu „Wczytywanie listy leków…”, rejestrowany przez `MutationObserver` ze skryptu startowego Playwrighta. Dzięki temu baseline na obecnej produkcji jest mierzalny tym samym skryptem.

## Phase 1: Pomiar i wzorzec

### Overview

Powtarzalny skrypt pomiarowy, znacznik gotowości listy, skrypt porównawczy reguły dopasowania z zapisanym wzorcem, `chrome-devtools-mcp` do diagnozy oraz baseline lokalnie i na produkcji.

### Changes Required:

#### 1. Zależność i skrypty npm

**File**: `package.json`, `.gitignore`

**Intent**: Dodać Playwrighta jako narzędzie pomiarowe i wystawić oba skrypty jako polecenia npm.

**Contract**:

- devDependency `playwright`;
- skrypty `"perf": "node scripts/perf-search.mjs"` i `"search:check": "node --experimental-strip-types scripts/registry-search-check.mjs"`;
- przeglądarka instalowana ręcznie: `npx playwright install chromium` (nie w CI);
- `.gitignore` dostaje katalog `.perf/` (wzorzec wyników i surowe wyniki pomiarów).

#### 2. Znacznik gotowości listy

**File**: `src/components/hooks/useRegistrySearchList.ts`

**Intent**: Dać pomiarowi dokładny moment, w którym podpowiedzi zaczynają działać.

**Contract**: `performance.mark("mamlek:search-list-ready")` raz na udane wczytanie, tuż po zbudowaniu indeksu (przed `finish("ready", …)`). W fazie 3 znacznik przenosi się do obsługi odpowiedzi `ready` z workera.

#### 3. Skrypt pomiarowy

**File**: `scripts/perf-search.mjs` (nowy)

**Intent**: Mierzyć ten sam przepływ przed i po każdym kroku, w czystym Chromium, z dławieniem odpowiadającym obu profilom.

**Contract**:

- **Parametry:**
  - `BASE_URL` (domyślnie `http://localhost:4321`);
  - `--profile fast|slow|both` (domyślnie `both`), `--runs <n>` (domyślnie 5), `--json` (dopisuje surowe wyniki do `.perf/perf-<data>.json`);
  - `PERF_EMAIL` i `PERF_PASSWORD`. Bez nich, dla hosta lokalnego, skrypt zakłada konto testowe jak smoke. Dla hosta nielokalnego bez danych kończy się kodem 2 z komunikatem.
  - Kody wyjścia: 0 sukces, 1 błąd pomiaru, 2 błąd użycia.
- **Profile:** `fast` = preset DevTools „Fast 4G” + CPU 4x, `slow` = preset „Slow 4G” + CPU 6x. Wartości presetów sieci są przepisane jako stałe z komentarzem o źródle (presety DevTools/Chromium).
- **Jeden przebieg:**
  - nowy kontekst przeglądarki (pusty cache HTTP);
  - logowanie przez formularz `/auth/signin` bez dławienia;
  - włączenie dławienia sieci i CPU (także w workerach, patrz „Critical Implementation Details”);
  - wejście na `/szukaj`.
- **Mierzy:**
  - `listReadyMs`: od początku nawigacji do znacznika gotowości albo do zniknięcia tekstu wczytywania;
  - `earlyTyping`: wpisywanie `ibu 400` (opóźnienie ok. 150 ms między znakami) od momentu, gdy pole jest widoczne, czyli w trakcie wczytywania. Najdłuższa interakcja (Event Timing, `durationThreshold: 16`) i najdłuższe zadanie (`longtask`) do końca pisania;
  - `readyTyping`: to samo po gotowości listy, po wyczyszczeniu pola.
- **Wynik:** tabela median i maksimów na profil na stdout oraz porównanie z celami (✓/✗).

#### 4. Skrypt porównawczy reguły dopasowania

**File**: `scripts/registry-search-check.mjs` (nowy)

**Intent**: Wykryć każdą zmianę wyników lub kolejności podpowiedzi bez runnera testów, porównując z wzorcem zapisanym przed zmianami.

**Contract**:

- **Dane:** wymagane `DATABASE_URL` (jak `registry-import-check.mjs`). Czyta `registry_search_list.payload` i importuje `buildSearchIndex` i `searchVariants` z `../src/lib/registry-search.ts`.
- **Zapytania:** stała lista ok. 29 zapytań:
  - wszystkie przykłady z S-01: `max`, `zel`, `żel`, `paracetamol`, `ibuprom 400`, `dla dzieci`, `ibupom`, `ibu 400`, `ibu max`;
  - dodatkowe: każdy poziom A–D, polskie znaki (np. `łódź`), cyfry, zapytanie za krótkie (`ib`), dwa krótkie słowa (`no spa`), kilka słów, wielkie litery.
- **Wynik na zapytanie:** `total` i lista id wyników (do 20, w kolejności).
- **Tryby:**
  - `--save` zapisuje `.perf/search-golden.json` z `version` listy;
  - bez flagi porównuje i wypisuje różnice (zmiana `total`, pierwsza różna pozycja z id i nazwą).
- **Kody wyjścia:** 0 zgodne, 1 różnice, 2 brak wzorca, brak `DATABASE_URL` albo inna `version` listy niż we wzorcu (komunikat: zapisz wzorzec od nowa).
- **Granica:** `buildSearchIndex(payload)` i `searchVariants(index, query, limit)` zachowują sygnatury w całym planie. Na tym kontrakcie opiera się skrypt.

#### 5. Serwer MCP DevTools

**File**: `.mcp.json`

**Intent**: Pozwolić agentowi sterować osobnym Chrome z dławieniem i nagrywać trace'y do diagnozy (nie do liczb docelowych).

**Contract**:

- Nowy wpis `chrome-devtools`: `command: "cmd"`, `args: ["/c", "npx", "-y", "chrome-devtools-mcp@latest", "--isolated=true"]` (Windows wymaga `cmd /c` dla `npx`).
- Plik ma niezacommitowany wpis `exa` należący do użytkownika. Commit fazy zawiera tylko hunk `chrome-devtools`, chyba że użytkownik zdecyduje inaczej.
- Wymaga restartu sesji Claude Code i zatwierdzenia serwera.

#### 6. Reguły dla agentów

**File**: `AGENTS.md`

**Intent**: Udokumentować nowe polecenia w „Command tripwires”, żeby kolejne zmiany komponentu podpowiedzi (S-02–S-04) z nich korzystały.

**Contract**:

- **`npm run perf`:** wymaga `npx playwright install chromium` i działającego serwera; na produkcji tylko z `PERF_EMAIL`/`PERF_PASSWORD` użytkownika; lokalne czasy sieci są zawyżone przez brak kompresji.
- **`npm run search:check`:** wymaga pełnego importu lokalnie; `--save` przed zmianą w `src/lib/registry-search.ts`, potem porównanie; po ponownym imporcie wzorzec od nowa.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` i `npx astro check` bez błędów
- `npm run lint` przechodzi
- `npm run build` przechodzi
- `npm run search:check -- --save` zapisuje wzorzec na pełnym imporcie, a kolejne `npm run search:check` kończy się kodem 0
- `npm run perf -- --runs 1` na lokalnym `npm run preview` wypisuje metryki obu profili

#### Manual Verification:

- Baseline lokalny (oba profile, mediana z 5) zanotowany w Progress
- Baseline produkcyjny przed zmianami (oba profile, mediana z 5, uruchamia użytkownik z własnym kontem) zanotowany w Progress
- `chrome-devtools-mcp` podłączony (`/mcp`), trace wpisywania `ibu 400` przy CPU 6x po gotowości listy zanotowany z podziałem najdłuższej interakcji (wyszukiwanie / render Reacta / styl i layout)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Pomiar produkcyjny uruchamia użytkownik — agent nie wpisuje prawdziwych danych logowania.

---

## Phase 2: Preload listy

### Overview

Pobieranie listy startuje razem z HTML-em strony, równolegle z JS, zamiast po hydratacji wyspy.

### Changes Required:

#### 1. Slot w `<head>`

**File**: `src/layouts/Layout.astro`

**Intent**: Pozwolić stronie dodać własne znaczniki do `<head>`.

**Contract**: Nazwany slot `<slot name="head" />` na końcu `<head>`. Strony bez niego renderują się bez zmian.

#### 2. Preload na stronie wyszukiwania

**File**: `src/pages/szukaj.astro`

**Intent**: Dać przeglądarce adres listy w HTML-u, żeby pobieranie zaczęło się przed uruchomieniem JS strony.

**Contract**: Tylko gdy lista istnieje (`list` nie jest `null`): `<link slot="head" rel="preload" href={`/api/registry/search-list?v=${list.version}`} as="fetch" crossorigin="anonymous" />`. Adres musi być identyczny z tym w hooku. Przy błędzie odczytu i braku listy nie ma preloadu.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` i `npx astro check` bez błędów
- `npm run lint` przechodzi
- `npm run build` przechodzi
- `npm run smoke` przechodzi (łącznie z krokami `/szukaj`)

#### Manual Verification:

- DevTools → Network na `/szukaj`: lista pobierana jeden raz i startuje przed chunkiem JS wyspy; w konsoli brak ostrzeżenia o nieużytym preloadzie
- `npm run perf` lokalnie (oba profile, mediana z 5) zanotowany w Progress i porównany z baseline lokalnym

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Indeks w Web Workerze

### Overview

Worker parsuje listę, buduje indeks i wykonuje wyszukiwanie. Główny wątek pobiera bajty listy, wysyła zapytania i rysuje wyniki.

### Changes Required:

#### 1. Protokół wiadomości

**File**: `src/types.ts`

**Intent**: Jedno źródło kształtu wiadomości między hookiem a workerem.

**Contract**:

- Strona → worker:
  - `{ type: "load"; buffer: ArrayBuffer }` (przekazany jako `Transferable`);
  - `{ type: "search"; id: number; query: string }`.
- Worker → strona:
  - `{ type: "ready"; variantCount: number; buildMs: number }`;
  - `{ type: "error" }`;
  - `{ type: "results"; id: number; query: string; results: RegistryVariant[]; total: number }`.

#### 2. Worker wyszukiwania

**File**: `src/lib/registry-search.worker.ts` (nowy)

**Intent**: Trzymać indeks poza głównym wątkiem i odpowiadać na zapytania tą samą funkcją dopasowania co dotąd.

**Contract**:

- **Na `load`:** `TextDecoder` → `JSON.parse` → sprawdzenie kształtu (jak `isPayload` w hooku) → `buildSearchIndex`; odpowiedź `ready` z czasem budowy (dekodowanie, parsowanie i indeks) albo `error`.
- **Na `search`:** `searchVariants(index, query, MAX_RESULTS)` → `results` z tym samym `id` i `query`.
- Importuje wyłącznie z `@/lib/registry-search` i `@/types`.

#### 3. Hook wyszukiwania

**File**: `src/components/hooks/useRegistrySearchList.ts` → `src/components/hooks/useRegistrySearch.ts` (zmiana nazwy i API)

**Intent**: Ukryć workera za hookiem, który przyjmuje zapytanie i zwraca wyniki. Komponent podpowiedzi i kolejne ekrany nie dotykają workera.

**Contract**:

- **Sygnatura:** `useRegistrySearch(version: number, query: string)` → `{ status: "loading" | "ready" | "unauthorized" | "error"; results: RegistryVariant[]; total: number; resultsQuery: string | null; retry(): void }`. `resultsQuery` to zapytanie, którego dotyczą `results`/`total`.
- **Wczytanie:**
  - `fetch` jak dziś (ten sam adres i opcje, przejmuje preload) → `arrayBuffer()` → worker tworzony przez `new Worker(new URL("../../lib/registry-search.worker.ts", import.meta.url), { type: "module" })` → `load` z przekazaniem bufora;
  - 401 → `unauthorized`; pozostałe błędy pobrania i `error` z workera → `error`;
  - `retry` kończy workera i powtarza z `cache: "reload"`;
  - odmontowanie przerywa `fetch` i kończy workera.
- **Na `ready`:** `performance.mark("mamlek:search-list-ready")`, status `ready`, natychmiastowe wysłanie bieżącego zapytania.
- **Zapytania:**
  - wysyłane tylko w stanie `ready` i tylko gdy `isQueryLongEnough(query)`; za krótkie zapytanie daje od razu puste wyniki bez wiadomości;
  - odpowiedź z `id` innym niż ostatnio wysłane jest ignorowana.

#### 4. Komponent podpowiedzi

**File**: `src/components/registry/MedicineSuggest.tsx`

**Intent**: Korzystać z asynchronicznych wyników bez zmiany zachowania widocznego dla użytkownika.

**Contract**:

- `useMemo(searchVariants)` zastąpione wynikami z `useRegistrySearch(version, query)`.
- Do czasu nowej odpowiedzi lista pokazuje poprzednie wyniki.
- Komunikaty „Brak leku o takiej nazwie w rejestrze”, „Pokazano 20 z N…” i liczba dla czytnika ekranu opierają się na odpowiedzi tylko wtedy, gdy `resultsQuery === query`.
- Klawiatura, dotyk, ARIA i ogłoszenia z opóźnieniem bez zmian.
- Props komponentu bez zmian.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` i `npx astro check` bez błędów
- `npm run lint` przechodzi
- `npm run build` przechodzi, a w `dist/` jest osobny chunk workera
- `npm run smoke` przechodzi
- `npm run search:check` kończy się kodem 0

#### Manual Verification:

- `npm run perf` lokalnie (oba profile, mediana z 5) zanotowany w Progress; na profilu słabym żadne zadanie > 200 ms podczas pisania w trakcie wczytywania
- Dławienie workera potwierdzone: `buildMs` przy CPU 6x co najmniej ok. 4 razy większe niż bez dławienia (albo ostrzeżenie skryptu zanotowane)
- Tekst wpisany przed gotowością listy zostaje, a po gotowości wyniki pojawiają się bez dopisywania znaku; przy szybkim pisaniu nie miga „Brak leku…”
- `ibu 400` pokazuje 20 podpowiedzi i „Pokazano 20 z 53…”, po dopisaniu `max` komunikat znika; `żel` i `zel` dają ten sam wynik
- Klawiatura (↑ ↓ Enter Esc), dotyk i czytnik ekranu działają jak w S-01; „Spróbuj ponownie” po błędzie pobrania (np. sieć offline przed wczytaniem) wczytuje listę
- Na telefonie: podpowiedzi działają, także bez sieci po pobraniu listy

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Pomiar na produkcji (bramka)

### Overview

Wdrożenie faz 1–3, pomiar obu profili na produkcji i decyzja, które z faz 5–6 wykonać.

### Changes Required:

#### 1. Wdrożenie i pomiar

**File**: — (PR, merge, automatyczne wdrożenie po merge'u; wyniki w Progress tego planu)

**Intent**: Sprawdzić cele na prawdziwej sieci z kompresją, a nie na lokalnym preview.

**Contract**:

- Użytkownik uruchamia `BASE_URL=https://mamlek.mig-app.workers.dev PERF_EMAIL=… PERF_PASSWORD=… npm run perf -- --json` z własnego terminala.
- Wynik (mediany obu profili) trafia do Progress obok baseline'u produkcyjnego z fazy 1.
- **Reguła bramki:**
  - **Faza 5:** gdy na profilu słabym INP ≥ 200 ms albo jakieś zadanie podczas pisania > 200 ms (po gotowości lub w trakcie wczytywania).
  - **Faza 6:** gdy lista gotowa ≥ 3 s na profilu zwykłym albo > 5 s na profilu słabym.
  - **Fazy niepotrzebne:** ich pozycje w Progress oznaczone `[x] … — pominięte (faza 4: cel spełniony, <liczba>)`, a fazy dopisane do „What We're NOT Doing”.

### Success Criteria:

#### Automated Verification:

- CI na PR z fazami 1–3 przechodzi

#### Manual Verification:

- PR z fazami 1–3 zmergowany i wdrożony na produkcję
- `npm run perf` na produkcji (oba profile, mediana z 5) zanotowany w Progress i porównany z celami i baseline'em produkcyjnym
- Decyzja o fazach 5 i 6 zapisana w Progress według reguły bramki

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Lżejszy render przy pisaniu (warunkowa)

### Overview

Wykonywana tylko wtedy, gdy bramka z fazy 4 wskaże pisanie na profilu słabym. Celem jest skrócenie renderu i layoutu po każdym znaku bez zmiany wyników.

### Changes Required:

#### 1. Render listy podpowiedzi

**File**: `src/components/registry/MedicineSuggest.tsx`

**Intent**: Zmniejszyć pracę Reacta i przeglądarki po każdym znaku, w kolejności wskazanej przez trace z fazy 1 (pozycja 1.8).

**Contract**: Kolejne próby, każda z pomiarem i każda zostaje tylko wtedy, gdy zmniejsza najdłuższą interakcję:

1. Wiersz podpowiedzi jako osobny komponent `memo` ze stabilnymi propsami (bez nowych funkcji na każdy render).
2. Wyniki renderowane przez `useDeferredValue`, żeby wpisanie znaku nie czekało na render listy.
3. Uproszczenie stylów wiersza, które trace wskaże jako koszt layoutu (np. `line-clamp`, `break-words`).

Wygląd, liczba wyników, ARIA i klawiatura bez zmian.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` i `npx astro check` bez błędów
- `npm run lint` przechodzi
- `npm run build` przechodzi
- `npm run search:check` kończy się kodem 0

#### Manual Verification:

- `npm run perf` na profilu słabym lokalnie: INP < 200 ms i żadne zadanie > 200 ms podczas pisania, wynik zanotowany w Progress
- Po wdrożeniu `npm run perf` na produkcji potwierdza cel pisania, wynik zanotowany w Progress
- Klawiatura, dotyk i czytnik ekranu działają jak w S-01

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 6: Rozmiar JS strony (warunkowa)

### Overview

Wykonywana tylko wtedy, gdy bramka z fazy 4 wskaże czas gotowości listy. Celem jest mniej JS do pobrania i uruchomienia przed hydratacją wyspy `/szukaj`.

### Changes Required:

#### 1. Analiza i cięcia bundla

**File**: `src/components/registry/*`, `src/pages/szukaj.astro` (według wyników analizy)

**Intent**: Usunąć z JS strony kod, którego `/szukaj` nie potrzebuje do startu.

**Contract**:

- Rozmiar JS przesyłanego przez `/szukaj` (DevTools → Network, filtr JS, produkcja) zanotowany przed i po.
- Największe zbędne moduły w chunkach wyspy wskazane na podstawie `npm run build` (np. `Button` z `@radix-ui/react-slot` i `class-variance-authority` tylko dla przycisku ponawiania, ikony `lucide-react`).
- Każde cięcie zostaje tylko wtedy, gdy zmniejsza czas gotowości listy w `npm run perf`.
- Wygląd i zachowanie bez zmian.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` i `npx astro check` bez błędów
- `npm run lint` przechodzi
- `npm run build` przechodzi
- `npm run smoke` przechodzi

#### Manual Verification:

- Rozmiar JS `/szukaj` przed i po zanotowany w Progress
- Po wdrożeniu `npm run perf` na produkcji: lista gotowa < 3 s (zwykły) i ≤ 5 s (słaby), wynik zanotowany w Progress; jeśli cel nadal nie jest spełniony, pozostała luka i jej przyczyna (np. transfer listy) zanotowane jako wejście do osobnego wycinka

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Brak runnera testów jednostkowych (świadomie poza zakresem). Regułę dopasowania pilnuje `npm run search:check`: wzorzec ok. 29 zapytań na pełnej liście, zapisany przed zmianami.

### Integration Tests:

- `npm run smoke`: endpoint listy i strona `/szukaj` (bez zmian w skrypcie; preload i worker nie zmieniają odpowiedzi serwera).
- `npm run perf`: przepływ logowanie → `/szukaj` → gotowość listy → pisanie, na obu profilach.

### Manual Testing Steps:

1. `npx supabase db reset`, pełny import (`npm run registry:import`), `npm run search:check -- --save` przed pierwszą zmianą w kodzie wyszukiwania.
2. `npm run build && npm run preview`, potem `npm run perf` po każdej fazie.
3. W przeglądarce: pisanie przed gotowością listy, przykłady z S-01, klawiatura i dotyk, ponowienie po błędzie.
4. Produkcja: baseline (faza 1) i pomiar po wdrożeniu (faza 4, ewentualnie 5–6) uruchamiane przez użytkownika.

## Performance Considerations

- **Budżet na profilu słabym** (5 s) przy ok. 2,5 s samego transferu listy (337 kB przy Slow 4G): preload ma nałożyć transfer listy na pobieranie i start JS. Worker ma usunąć z głównego wątku ok. 2,5 s parsowania i budowy indeksu.
- **Przekazanie bufora do workera** (`Transferable`) jest bez kopiowania. Do strony wraca najwyżej 20 wariantów na zapytanie.
- **Wyniki lokalne i produkcyjne:** lokalnie czasy sieci są zawyżone (brak kompresji), więc liczą się tylko do porównań między fazami. O celach decyduje produkcja.

## Migration Notes

- Brak zmian w bazie i API. Rollback: revert PR. Lista i endpoint bez zmian, więc stare i nowe wersje strony działają na tych samych danych.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-09: baseline, unknowns, approach)
- Plan S-01: `context/archive/2026-10-02-registry-search-suggestions/plan.md` (reguła dopasowania, przykłady, Progress 2.6/3.8)
- Przegląd S-01: `context/archive/2026-10-02-registry-search-suggestions/reviews/impl-review.md` (F3, F5, F8)
- PRD: `context/foundation/prd.md:188-198` (NFR czas odpowiedzi i używalność)
- Kod: `src/lib/registry-search.ts:74-176`, `src/components/hooks/useRegistrySearchList.ts:24-78`, `src/components/registry/MedicineSuggest.tsx:23-242`, `src/pages/szukaj.astro:37`, `src/layouts/Layout.astro:14-19`
- Wzorce skryptów: `scripts/smoke.mjs:4-6`, `scripts/registry-import-check.mjs:13-19`
- chrome-devtools-mcp: Context7 `/chromedevtools/chrome-devtools-mcp` (konfiguracja, `emulate`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pomiar i wzorzec

#### Automated

- [x] 1.1 `npx astro sync` i `npx astro check` bez błędów — 0869716
- [x] 1.2 `npm run lint` przechodzi — 0869716
- [x] 1.3 `npm run build` przechodzi — 0869716
- [x] 1.4 `npm run search:check -- --save` zapisuje wzorzec, kolejne `npm run search:check` kończy się kodem 0 — 0869716
- [x] 1.5 `npm run perf -- --runs 1` lokalnie wypisuje metryki obu profili — 0869716

#### Manual

- [x] 1.6 Baseline lokalny (oba profile, mediana z 5) zanotowany w Progress
  - Lokalnie (`wrangler dev`, 2026-10-06), lista gotowa / pisanie `ibu 400` w trakcie wczytywania (interakcja, zadanie) / po gotowości (interakcja, zadanie): zwykły (Fast 4G, CPU 4x) 2128 ms (2068–2341) / 632 ms, 690 ms / 104 ms, 88 ms; słaby (Slow 4G, CPU 6x) 5802 ms (5268–6688) / 48 ms, 0 ms / 184 ms, 146 ms.
- [x] 1.7 Baseline produkcyjny przed zmianami (oba profile, mediana z 5) zanotowany w Progress
  - Produkcja (`https://mamlek.mig-app.workers.dev`, 2026-10-06, kod bez znacznika `mamlek:search-list-ready`, gotowość listy z tekstu strony): zwykły 2213 ms (2043–4195) / 576 ms, 597 ms / 88 ms, 64 ms; słaby 7353 ms (6666–8402) / 56 ms, 0 ms / 168 ms, 138 ms. Cele: lista < 3 s (zwykły) spełniony w medianie, ≤ 5 s (słaby) niespełniony o ok. 2,4 s.
- [x] 1.8 `chrome-devtools-mcp` podłączony, trace pisania `ibu 400` przy CPU 6x zanotowany z podziałem najdłuższej interakcji
  - Pierwszy trace nagrano Playwrightem (`browser.startTracing` + CDP, CPU 6x, lokalnie `wrangler dev`, po gotowości listy, `ibu 400` co 150 ms), bo `chrome-devtools-mcp` nie był wtedy podłączony. Po restarcie sesji powtórzono go przez `chrome-devtools-mcp` (`performance_start_trace`/`performance_stop_trace`, CPU 6x, znaki wpisywane pojedynczo co ok. 1,3 s) i wynik się potwierdził: zadanie 3. znaku 238 ms (funkcja `searchVariants` w chunku RegistrySearch ok. 114 ms próbek, layout 51 ms), kolejne znaki 45–106 ms, w nich `searchVariants` 21–58 ms. Zadanie 1. znaku (555 ms) to artefakt startu profilera i jest pomijane. Trace DevTools: scratchpad sesji (`devtools-trace.json`), nie w repo.
  - Najdłuższa interakcja: 200 ms (3. znak `u`, pierwsze wyszukiwanie i pierwszy render listy); kolejne 57–108 ms; znaki 1–2 (poniżej progu wyszukiwania) 19–23 ms. Najdłuższe zadanie 179 ms: wyszukiwanie (`searchVariants`, chunk RegistrySearch) 91 ms, render Reacta 28 ms, layout 40 ms, przeliczenie stylów 7 ms, reszta JS i inne ok. 13 ms.
  - Suma 6 zadań > 16 ms (ok. 455 ms): wyszukiwanie ok. 261 ms (ok. 57%), React ok. 50 ms, layout i style ok. 73 ms, malowanie ok. 12 ms. Wniosek: wąskie gardło po gotowości listy to samo przeszukiwanie listy w wątku głównym (faza 3 przenosi je do workera), render Reacta jest drugorzędny.

### Phase 2: Preload listy

#### Automated

- [x] 2.1 `npx astro sync` i `npx astro check` bez błędów — 9539a46
- [x] 2.2 `npm run lint` przechodzi — 9539a46
- [x] 2.3 `npm run build` przechodzi — 9539a46
- [x] 2.4 `npm run smoke` przechodzi — 9539a46

#### Manual

- [x] 2.5 Lista pobierana raz i przed chunkiem JS wyspy, brak ostrzeżenia o nieużytym preloadzie — 9539a46
  - Lokalnie (`wrangler dev`, 2026-10-06): jedno żądanie listy, inicjator `link`, start 87 ms, przed chunkami JS wyspy (95–117 ms); `<link rel="preload" as="fetch" crossorigin="anonymous">` w `<head>`; konsola pusta po 6 s.
- [x] 2.6 `npm run perf` lokalnie zanotowany i porównany z baseline'em lokalnym — 9539a46
  - Lokalnie (`wrangler dev`, 2026-10-06, mediana z 5), lista gotowa / pisanie `ibu 400` w trakcie wczytywania (interakcja, zadanie) / po gotowości (interakcja, zadanie): zwykły (Fast 4G, CPU 4x) 1787 ms (max 1929; baseline 2128) / 224 ms, 196 ms (max 432) / 96 ms, 82 ms; słaby (Slow 4G, CPU 6x) 4454 ms (max 4607; baseline 5802) / 48 ms, 301 ms (max 1148) / 144 ms, 122 ms. Słaby profil spełnia lokalnie cel ≤ 5 s. Pisanie w trakcie wczytywania wypada gorzej niż w baseline (zadanie 301 ms wobec 0 ms), bo lista jest gotowa wcześniej i budowa indeksu nakłada się na pisanie; to praca głównego wątku, którą faza 3 przenosi do workera.

### Phase 3: Indeks w Web Workerze

#### Automated

- [x] 3.1 `npx astro sync` i `npx astro check` bez błędów — ccd7876
- [x] 3.2 `npm run lint` przechodzi — ccd7876
- [x] 3.3 `npm run build` przechodzi, w `dist/` jest chunk workera — ccd7876
- [x] 3.4 `npm run smoke` przechodzi — ccd7876
- [x] 3.5 `npm run search:check` kończy się kodem 0 — ccd7876

#### Manual

- [x] 3.6 `npm run perf` lokalnie zanotowany; na profilu słabym brak zadań > 200 ms podczas pisania w trakcie wczytywania
  - Wyniki z sesji agenta (2026-10-06, `wrangler dev`, mediana z 5), potwierdzone przez użytkownika 2026-10-07. Lista gotowa / pisanie w trakcie wczytywania (interakcja, zadanie, max zadania) / po gotowości (interakcja, zadanie, max zadania): zwykły 1376 ms (max 1469; baseline 2128) / 48 ms, 0 ms, 56 ms / 40 ms, 0 ms, 0 ms; słaby 3966 ms (max 4032; baseline 5802) / 40 ms, 0 ms, 109 ms / 56 ms, 0 ms, 112 ms. Na profilu słabym żadne zadanie > 200 ms.
- [x] 3.7 Dławienie workera potwierdzone (`buildMs` przy CPU 6x ≥ ok. 4x) albo ostrzeżenie zanotowane
  - Ostrzeżenie skryptu `perf` w 10 z 10 przebiegów: „CPU throttling could not be applied to the search worker (Operation is only supported for pages, not workers)”. Czas w workerze jest więc zaniżony, a liczby z 3.6 optymistyczne (ostrzeżenie zanotowane, rozstrzygnie pomiar produkcyjny w fazie 4). Potwierdzone przez użytkownika 2026-10-07.
- [x] 3.8 Tekst wpisany przed gotowością daje wyniki po gotowości; brak migania „Brak leku…”
  - Sprawdzone przez agenta w DevTools (Slow 4G + CPU 6x): wpisane `ibu 400` zostało, po gotowości 20 opcji, „Brak leku” niewidziane. Lista była już gotowa w chwili pierwszego odczytu, więc ścieżka „przed gotowością” potwierdzona tylko częściowo (lepiej pokrywają ją metryki early typing z `perf`). Potwierdzone przez użytkownika 2026-10-07.
- [x] 3.9 `ibu 400` → 20 i „Pokazano 20 z 53…”, po `max` komunikat znika; `żel` = `zel`
  - Sprawdzone przez agenta w DevTools: `ibu 400` → 20 opcji i „Pokazano 20 z 53 — dopisz kolejne słowo…”; po ` max` 14 opcji i brak komunikatu; `żel` i `zel` → te same 19 opcji w tej samej kolejności. Potwierdzone przez użytkownika 2026-10-07.
- [x] 3.10 Klawiatura, dotyk, czytnik ekranu i „Spróbuj ponownie” działają
  - Potwierdzone przez użytkownika 2026-10-07 (lokalnie, `wrangler dev`).
- [x] 3.11 Na telefonie podpowiedzi działają, także bez sieci po pobraniu listy
  - Potwierdzone przez użytkownika 2026-10-07 (telefon, produkcja).

### Phase 4: Pomiar na produkcji (bramka)

#### Automated

- [x] 4.1 CI na PR z fazami 1–3 przechodzi — 0c63e7b
  - PR #21: `ci` 59 s, `smoke` 2 min 33 s, oba zielone.

#### Manual

- [x] 4.2 PR z fazami 1–3 zmergowany i wdrożony na produkcję — 0c63e7b
  - PR #21 zmergowany 2026-10-07 08:52Z, przebieg `main` (deploy) zakończony sukcesem.
- [x] 4.3 `npm run perf` na produkcji zanotowany i porównany z celami i baseline'em produkcyjnym
  - Produkcja (`https://mamlek.mig-app.workers.dev`, 2026-10-07, `.perf/perf-2026-10-07.json`, mediana z 5), lista gotowa (zakres) / pisanie w trakcie wczytywania (interakcja, zadanie; max zadania) / po gotowości (interakcja, zadanie; max zadania). **Po fazach 1–3** (09:02Z): zwykły 1320 ms (1254–1858) / 24 ms, 55 ms (max 68) / 40 ms, 0 ms (max 0); słaby 3969 ms (3947–3971) / 40 ms, 0 ms (max 107) / 56 ms, 0 ms (max 0). **Przed wdrożeniem** (ten sam dzień 08:51Z, stary kod): zwykły 2249 ms (2047–3356) / 640 ms, 575 ms (max 660) / 96 ms, 77 ms (max 83); słaby 7220 ms (5993–7913) / 32 ms, 0 ms (max 0) / 152 ms, 123 ms (max 157).
  - Cele: lista < 3 s (zwykły) spełniona (1320 ms), ≤ 5 s (słaby) spełniona (3969 ms, wcześniej 7220 ms). Pisanie: najdłuższa interakcja na profilu słabym 64 ms (< 200 ms), najdłuższe zadanie 107 ms (< 200 ms).
  - Zastrzeżenie: dławienie CPU nie obejmuje workera („Operation is only supported for pages, not workers", 10 z 10 przebiegów), więc czas budowy indeksu w workerze jest zaniżony, a wynik słabego profilu optymistyczny. Sprawdzić na prawdziwym telefonie (3.11).
- [x] 4.4 Decyzja o fazach 5 i 6 zapisana według reguły bramki
  - Faza 5: nie (słaby: INP 64 ms < 200 ms, najdłuższe zadanie 107 ms < 200 ms). Faza 6: nie (zwykły 1320 ms < 3 s, słaby 3969 ms ≤ 5 s). Obie pominięte.

### Phase 5: Lżejszy render przy pisaniu (warunkowa)

#### Automated

- [x] 5.1 `npx astro sync` i `npx astro check` bez błędów — pominięte (faza 4: cel spełniony, INP 64 ms, zadanie max 107 ms)
- [x] 5.2 `npm run lint` przechodzi — pominięte (faza 4: cel spełniony, INP 64 ms, zadanie max 107 ms)
- [x] 5.3 `npm run build` przechodzi — pominięte (faza 4: cel spełniony, INP 64 ms, zadanie max 107 ms)
- [x] 5.4 `npm run search:check` kończy się kodem 0 — pominięte (faza 4: cel spełniony, INP 64 ms, zadanie max 107 ms)

#### Manual

- [x] 5.5 `npm run perf` lokalnie na profilu słabym: INP < 200 ms i brak zadań > 200 ms, zanotowany — pominięte (faza 4: cel spełniony, INP 64 ms, zadanie max 107 ms)
- [x] 5.6 `npm run perf` na produkcji po wdrożeniu potwierdza cel pisania, zanotowany — pominięte (faza 4: cel spełniony, INP 64 ms, zadanie max 107 ms)
- [x] 5.7 Klawiatura, dotyk i czytnik ekranu działają jak w S-01 — pominięte (faza 4: cel spełniony, INP 64 ms, zadanie max 107 ms)

### Phase 6: Rozmiar JS strony (warunkowa)

#### Automated

- [x] 6.1 `npx astro sync` i `npx astro check` bez błędów — pominięte (faza 4: cel spełniony, lista 1320 ms / 3969 ms)
- [x] 6.2 `npm run lint` przechodzi — pominięte (faza 4: cel spełniony, lista 1320 ms / 3969 ms)
- [x] 6.3 `npm run build` przechodzi — pominięte (faza 4: cel spełniony, lista 1320 ms / 3969 ms)
- [x] 6.4 `npm run smoke` przechodzi — pominięte (faza 4: cel spełniony, lista 1320 ms / 3969 ms)

#### Manual

- [x] 6.5 Rozmiar JS `/szukaj` przed i po zanotowany — pominięte (faza 4: cel spełniony, lista 1320 ms / 3969 ms)
- [x] 6.6 `npm run perf` na produkcji po wdrożeniu: cele gotowości listy spełnione albo pozostała luka zanotowana — pominięte (faza 4: cel spełniony, lista 1320 ms / 3969 ms)
