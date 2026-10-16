# Test Plan

> Etapowe wdrażanie testów w tym projekcie. Strategia jest zamrożona na górze
> (§1–§5); wzorce z książki kucharskiej na dole (§6) uzupełniają się wraz z
> kolejnymi fazami. Przeczytaj przed napisaniem każdego nowego testu.
>
> Odświeżanie: uruchom ponownie `/10x-test-plan --refresh`, gdy plan się zestarzeje (zob. §8).
>
> Ostatnia aktualizacja: 2026-10-10

## 1. Strategy

Testy w tym projekcie trzymają się trzech zasad, które nie podlegają negocjacji:

1. **Koszt × sygnał.** Wygrywa najtańszy test, który daje prawdziwy sygnał
   dla ryzyka. Nie przenoś testu do e2e, bo e2e „wydaje się bezpieczniejsze”.
   Nie kładź modelu wizyjnego na deterministycznym porównaniu obrazów, które
   już wyłapuje regresję.
2. **Obawy użytkownika są pełnoprawnym dowodem.** Ryzyka oparte na „autor
   boi się X, a awaria wyszłaby gdzieś w przepływie sprawdzenia” ważą tyle
   samo, co zapisy PRD czy dane o gorących punktach.
3. **Ryzyka to scenariusze, nie miejsca w kodzie.** Ten plan opisuje, _co
   może się zepsuć_ i _dlaczego uważamy to za prawdopodobne_ — na podstawie
   dokumentów, wywiadu i _sygnałów_ z kodu (częstość zmian, struktura, baza
   testów). NIE twierdzi, że wie, która linia odpowiada za awarię. Tę wiedzę
   daje `/10x-research` w każdej fazie wdrażania. Jeśli plan i research
   różnią się co do miejsca awarii, rację ma research.

Zakres gorących punktów użyty do ważenia prawdopodobieństwa: `src/`, `supabase/` (28 commitów w 30 dniach przed 2026-10-10; `scripts/` pominięte na prośbę autora).

## 2. Risk Map

Najważniejsze scenariusze awarii, przed którymi projekt musi się chronić,
uporządkowane według ryzyko = wpływ × prawdopodobieństwo. Ryzyka to
scenariusze awarii w języku użytkownika i biznesu, nie nazwy testów. Kolumna
„Źródło” wskazuje _dowody, które ujawniły ryzyko_ — nigdy konkretny plik jako
„miejsce awarii” (to zadanie researchu, zob. §1 zasada nr 3).

| #   | Ryzyko (scenariusz awarii)                                                                                                   | Wpływ  | Prawdopodobieństwo | Źródło (dowód — nie kotwica)                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sprawdzenie odpowiada „nie masz” dla leku albo leku z tą samą substancją, który jest w apteczce                              | Wysoki | Wysokie            | wywiad P1, P3; PRD Success Criteria (Primary); roadmapa S-03 (w toku), S-06 (rozszerza regułę); gorący katalog `supabase/migrations/` (6 commitów/30 dni)                                                                              |
| 2   | Sprawdzenie zgłasza „ta sama substancja” dla leku, który nią nie jest                                                        | Wysoki | Średnie            | PRD Guardrails („fałszywa wskazówka jest gorsza niż brak odpowiedzi”); roadmapa S-06; wywiad P3                                                                                                                                        |
| 3   | Ekran pokazuje werdykt należący do innego leku niż ten, który jest teraz w polu                                              | Średni | Wysokie            | wywiad P2 (już się zdarzyło); przegląd w archiwum `2026-10-06-registry-search-performance` (wracają wcześniejsze wyniki); gorące katalogi `src/components/registry/` (12 commitów/30 dni), `src/components/hooks/` (7)                 |
| 4   | Jedno konto domowe czyta lub zmienia apteczkę innego konta albo dane apteczki są dostępne bez sesji                          | Wysoki | Średnie            | PRD Guardrails i NFR (dostęp); wywiad P3 (RLS); przegląd w archiwum `2026-10-02-registry-search-suggestions` (RLS nigdy nie sprawdzone na danych); roadmapa S-05 (dodaje edycję i usuwanie)                                            |
| 5   | Podpowiedzi zmieniają kolejność albo gubią warianty, więc użytkownik nie może znaleźć lub odróżnić właściwego rekordu        | Średni | Średnie            | notatki o ryzyku S-01 i S-09 w roadmapie; AGENTS.md (`search:check` wymaga pełnego rejestru, nie działa w CI); gorący katalog `src/lib/` (10 commitów/30 dni)                                                                          |
| 6   | Endpointy apteczki przyjmują nieprawidłowe dane albo odpowiadają na nie błędem 500                                           | Średni | Średnie            | przegląd w archiwum `2026-10-07-add-medicine-to-kit` (przepełnienie ilości, niezmienniki tylko w API); roadmapa Parked (zapis do apteczki tylko przez aplikację); gorący katalog `src/pages/api/` (10 commitów/30 dni)                 |
| 7   | Import rejestru gubi lub psuje produkty, substancje albo opakowania bez błędu, więc prawdziwego leku brakuje lub jest błędny | Wysoki | Średnie            | dopytanie w wywiadzie (autor poprosił o testy skryptów importu, na końcu); przegląd w archiwum `2026-10-01-registry-copy-load` (niejasny błąd przy pustych nazwach, nieprawidłowe UTF-8 po cichu zastępowane); ryzyko F-01 w roadmapie |

Ryzyko nr 7 jest dopisane na końcu z wyboru autora co do kolejności, a nie
według oceny. Rejestr, który przestaje się odświeżać (w odróżnieniu od
importu błędnych danych), to sprawa alertów, którą już pokrywa e-mail o
nieudanym przebiegu i widoczna data stanu; nie jest tu celem testów.

### Risk Response Guidance

| Ryzyko | Co dowiodłoby ochrony                                                                                                                                                                                                                                             | Co trzeba zakwestionować                                                                                                                                           | Kontekst, który `/10x-research` musi ustalić                                                                                                                                | Najtańsza warstwa (prawdopodobnie)                                                             | Antywzorzec do uniknięcia                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| #1     | Gdy lek jest w apteczce (inna wielkość opakowania, import równoległy, wycofane opakowanie albo inny produkt z tą samą substancją), werdykt widoczny dla użytkownika nigdy nie brzmi „nie masz”                                                                    | „Sprawdzenie reguły w bazie przechodzi, więc użytkownik widzi właściwy werdykt” — warstwa między regułą a ekranem może zamienić dopasowanie albo błąd w „nie masz” | Jak zdefiniowano „ten sam lek” i „ta sama substancja”; gdzie wyliczany jest werdykt; jak tłumaczony jest pusty lub nieudany wynik; co pokrywa istniejące sprawdzenie reguły | integracja z bazą + unit na mapowaniu werdyktu                                                 | Oczekiwane werdykty skopiowane z obecnego wyniku; wyrocznią jest reguła z PRD i pary sprawdzone ręcznie                |
| #2     | Częściowe pokrycie substancji, zaślepki i podobne nazwy nigdy nie dają werdyktu „ta sama substancja”; komunikat „skonsultuj się z farmaceutą” pojawia się przy każdym werdykcie „ta sama substancja”                                                              | „Ta sama nazwa powszechna oznacza tę samą substancję”                                                                                                              | Semantyka porównania zbiorów; obsługa zaślepek; warunek wyświetlenia komunikatu                                                                                             | integracja z bazą + test komponentu dla komunikatu                                             | Tylko szczęśliwa ścieżka (pary z jedną substancją)                                                                     |
| #3     | Po edycji, wyczyszczeniu lub ponownym wyborze, także gdy odpowiedzi przychodzą w innej kolejności, ekran nigdy nie pokazuje werdyktu dla czegoś innego niż bieżący wybór                                                                                          | „Czyszczenie wyniku przy zmianie tekstu to naprawiło” — spóźniona odpowiedź na wcześniejsze zapytanie wciąż może dotrzeć                                           | Kto jest właścicielem stanu wyniku; czy zapytania są anulowane; co uruchamia sprawdzenie                                                                                    | test hooka / komponentu z kontrolowaną asynchronicznością; e2e tylko, jeśli tamte nie odtworzą | Sleepy; sprawdzanie stanu wewnętrznego zamiast tego, co wyrenderowane                                                  |
| #4     | Drugi zalogowany użytkownik nie może odczytać, sprawdzić względem, dodać do, edytować ani usunąć apteczki pierwszego przez API aplikacji ani bezpośrednio przez API danych; anonimowy wywołujący nie dostaje nic                                                  | „Zalogowany znaczy uprawniony”; „RLS tabeli obejmuje też funkcję w bazie”                                                                                          | Każda ścieżka czytająca lub zapisująca dane apteczki; tryb bezpieczeństwa funkcji; polityki per operacja; co już sprawdza istniejący test reguły                            | integracja z bazą na dwóch użytkownikach + integracja API                                      | Mockowanie klienta Supabase (mock nie dowiedzie RLS); testowanie tylko przez UI                                        |
| #5     | Dopasowania nazwy produktu są na górze, moc i postać odróżniają warianty, znaki diakrytyczne i wielkość liter są ignorowane — na małej, ręcznie zbudowanej liście, która działa w CI                                                                              | „Zgodność z plikiem wzorcowym oznacza poprawne wyniki” — plik wzorcowy zapisuje obecne zachowanie razem z błędami                                                  | Reguły dopasowania; najmniejsza lista, która je ćwiczy                                                                                                                      | unit                                                                                           | Snapshot bez opisanego znaczenia                                                                                       |
| #6     | Dane spoza zakresu, złego typu, za duże, spoza rejestru lub z wycofanym opakowaniem dostają czyste 4xx, nic nie zapisują i nie ujawniają szczegółów wewnętrznych                                                                                                  | „Formularz waliduje, więc serwer jest bezpieczny”                                                                                                                  | Granice walidacji; limity kolumn w bazie; tłumaczenie błędów                                                                                                                | integracja API albo unit na walidacji                                                          | Przepisywanie schematu walidacji w teście; granice biorą się z PRD i limitów bazy                                      |
| #7     | Plik rejestru z błędnym, pustym, zduplikowanym lub nieoczekiwanym rekordem albo importuje nienaruszony każdy poprawny produkt, albo kończy się głośnym błędem i wycofaniem; żaden produkt, substancja ani opakowanie nie znika ani nie zmienia znaczenia po cichu | „Sprawdzenie importu fixture'ów przechodzi, więc prawdziwe pliki rejestru importują się poprawnie” — fixture'y zawierają tylko kształty, o których ktoś pomyślał   | Kształty danych, jakie daje prawdziwy rejestr; które problemy przerywają import, a które są tolerowane; co sprawdza istniejąca kontrola importu                             | unit na parserze + integracja z bazą na imporcie                                               | Oczekiwane wiersze uzyskane przez uruchomienie testowanego parsera; wyrocznią jest ręcznie przeczytany rekord źródłowy |

## 3. Phased Rollout

Każdy wiersz to osobna faza wdrażania, która otworzy własny folder zmiany
przez `/10x-new`. Status przechodzi od lewej do prawej przez wartości
poniżej; orkiestrator aktualizuje Status, gdy na dysku pojawiają się artefakty.

| #   | Phase name                      | Goal (one line)                                                                                                   | Risks covered | Test types                  | Status        | Change folder                                                 |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------- | ------------- | ------------------------------------------------------------- |
| 1   | Check verdict correctness       | Uruchomić runner testów i dowieść, że werdykt widoczny dla użytkownika jest poprawny, od reguły po ekran          | #1, #2        | unit + database integration | complete      | context/archive/2026-10-10-testing-check-verdict-correctness/ |
| 2   | Result state and search         | Dowieść, że ekran nigdy nie pokazuje odpowiedzi na inne pytanie, a podpowiedzi zachowują kolejność                | #3, #5        | unit + component            | change opened | context/changes/testing-result-state-and-search/              |
| 3   | Kit access and input boundaries | Dowieść, że dane apteczki są odizolowane per konto, a nieprawidłowe dane są czysto odrzucane                      | #4, #6        | database + API integration  | not started   | —                                                             |
| 4   | Quality-gates wiring            | Uczynić zestawy z Faz 1–3 wymaganymi lokalnie i w CI oraz dodać hook po edycji                                    | cross-cutting | gates                       | not started   | —                                                             |
| 5   | Registry import scripts         | Dowieść, że import i jego parser zachowują każdy poprawny produkt albo głośno zawodzą, a potem dodać je do bramek | #7            | unit + database integration | not started   | —                                                             |

**Status vocabulary** (stały — literały parsera, zostają po angielsku): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

Brak fazy AI-native: nic w mapie ryzyk nie wymaga przeglądu wizyjnego ani
przez AI, którego deterministyczny test nie złapałby taniej.

## 4. Stack

Klasyczna baza testów tego projektu. Narzędzia AI-native (jeśli są) mają datę
`checked:`, żeby przyszli czytelnicy wiedzieli, które wiersze wymagają
ponownej weryfikacji.

| Warstwa              | Narzędzie                          | Wersja                                   | Uwagi                                                                                                                                                                                                                                           |
| -------------------- | ---------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit + component     | Vitest + jsdom + Testing Library   | Vitest 5.0, jsdom 29, Testing Library 16 | Zwykły `vitest.config.ts` z dwoma projektami (`unit` w node, `component` w jsdom); testowane pliki nie importują modułów `astro:*`, więc `getViteConfig()` z Astro (ładuje plugin Cloudflare) nie jest używany. `npm test`; checked: 2026-10-13 |
| database integration | Vitest + `pg` na lokalnym Supabase | pg 8.x                                   | `vitest.db.config.ts`, `npm run test:db`, wiersze wstawiane w wycofywanej transakcji; działa w jobie CI `smoke` (sprawdzenie importu to nadal skrypt Node)                                                                                      |
| API mocking          | nie planujemy                      | —                                        | Testy integracyjne używają prawdziwego lokalnego Supabase; nie mockuj klienta Supabase                                                                                                                                                          |
| e2e / flow           | `npm run smoke` (bez zależności)   | —                                        | Istnieje: przepływ logowania i kroki listy wyszukiwania na podglądzie produkcyjnym                                                                                                                                                              |
| browser automation   | Playwright                         | 1.63                                     | Zainstalowany dla `perf` i `ui:shots`; warstwą testów tylko wtedy, gdy test komponentu nie odtworzy ryzyka                                                                                                                                      |
| static guards        | ESLint, `astro check`, `ui:scan`   | —                                        | Istnieją i są wymagane w CI                                                                                                                                                                                                                     |

Profil bazy testów na 2026-10-10: `none` — brak konfiguracji runnera i plików
testów; powyższe kontrole były własnymi skryptami, z których dwa
(`search:check`, `perf`) wymagają pełnego lokalnego rejestru i nie działają
w CI. Od 2026-10-13 (Faza 1) testy unit, komponentów i bazy z tabeli działają
na Vitest.

**Narzędzia do osadzenia stacku (bieżąca sesja):**

- Dokumentacja: Context7 — sprawdzony przewodnik testowania Astro (Vitest przez `getViteConfig()`, tu niepotrzebny: zob. §4); checked: 2026-10-10
- Wyszukiwanie: Exa.ai — dostępne, nieużyte (żadne pytanie o narzędzia go nie wymagało); checked: 2026-10-10
- Runtime/przeglądarka: chrome-devtools MCP i Claude in Chrome — dostępne, nieużyte; możliwa pomoc przy ręcznej weryfikacji, nie warstwa testów; checked: 2026-10-10
- Dostawca/platforma: Cloudflare MCP — dostępny, nieużyty; żadna bramka jakości od niego nie zależy; checked: 2026-10-10

## 5. Quality Gates

Pełny zestaw bramek, które muszą przejść, zanim zmiana trafi na produkcję.
„Required after §3 Phase N” oznacza, że bramka jest wymuszana od chwili
wdrożenia tej fazy; wcześniej ma status `planned`. Wartości w kolumnach
„Where” i „Required?” zostają po angielsku, bo czyta je `/10x-configure-hook`.

| Gate                             | Where              | Required?                    | Catches                                                  |
| -------------------------------- | ------------------ | ---------------------------- | -------------------------------------------------------- |
| lint + type check + `ui:scan`    | local + CI         | required (wired)             | błędy składni, typów i odejścia od tokenów projektu      |
| build                            | CI                 | required (wired)             | kod, który nie buduje się dla runtime'u Workera          |
| database rule and import checks  | CI on PR           | required (wired)             | regresje reguły sprawdzenia, RLS na regule, importu      |
| auth-flow smoke                  | CI on PR           | required (wired)             | zepsute logowanie, chronione ścieżki, lista wyszukiwania |
| unit + component                 | local + CI         | required after §3 Phase 4    | regresje logiki werdyktu, stanu wyniku i wyszukiwania    |
| kit access and input integration | CI on PR           | required after §3 Phase 4    | dostęp między kontami, przyjęte nieprawidłowe dane       |
| post-edit hook                   | local (agent loop) | recommended after §3 Phase 4 | regresje w chwili edycji                                 |
| registry import and parser tests | local + CI         | required after §3 Phase 5    | produkty zgubione lub zepsute przy imporcie              |

## 6. Cookbook Patterns

Jak dodawać nowe testy w tym projekcie. Każda podsekcja jest uzupełniana, gdy
wejdzie odpowiednia faza wdrażania; do tego czasu brzmi „TBD — zob. §3 Faza N”.

### 6.1 Adding a unit test

- **Istniejący wzorzec (logika werdyktu)**: czysta funkcja w `src/lib/`, którą wywołuje ekran, testowana z wartością oczekiwaną wziętą z reguły w PRD, a nie z wyniku funkcji; jedno `it.each` na właściwość („dopasowanie nigdy nie staje się „nie masz”” dla każdego rodzaju i liczby pozycji).
- **Test wzorcowy**: `src/lib/medicine-check-verdict.test.ts` (`checkVerdict`, `parseMedicineCheck`).
- **Uruchomienie lokalnie**: `npm test` (baza niepotrzebna).
- Strażnik, który odrzuca odpowiedź niemożliwą do pokazania na ekranie, jest testowany w obie strony: każda poprawna odpowiedź przechodzi bez zmian, każde zepsute pole jest odrzucane.
- TBD — zob. §3 Faza 2 dla wzorca dopasowania wyszukiwania.

### 6.2 Adding a database rule test

- **Istniejący wzorzec**: syntetyczne wiersze wstawiane w jednej transakcji, która zawsze jest wycofywana.
- **Test wzorcowy**: `tests/db/medicine-check.test.ts` (fixture'y w `tests/db/medicine-check-fixtures.ts`).
- **Uruchomienie lokalnie**: `npm run test:db` z `DATABASE_URL` ustawionym na lokalną bazę, po `npx supabase db reset`.
- **Dane syntetyczne**: identyfikatory zaczynają się od 9 000 000 001, id opakowania to id produktu + 1000, każdy przypadek dostaje własne konto, savepoint na test; `connectLocal` rzuca błąd (nigdy nie pomija) bez lokalnego `DATABASE_URL`.
- **Przez kod ekranu**: każda odpowiedź reguły przechodzi przez `parseMedicineCheck` i `checkVerdict`, więc zmiana nazwy pola albo werdykt, który zamienia dopasowanie w „nie masz”, wywraca się tutaj, a nie na ekranie.
- **Znane ograniczenia** (inna sól z inną nazwą powszechną, substancja zapisana jako jeden napis) są przypięte testami, których nazwy to mówią, a nie pominięte.
- TBD — zob. §3 Faza 3 dla wzorca izolacji dwóch użytkowników.

### 6.3 Adding a component or hook test

- **Istniejący wzorzec**: wyrenderuj prawdziwy komponent, podmień tylko `fetch`, sprawdzaj wyrenderowany tekst (teksty o znaczeniu prawnym są przypięte jako stałe; region live powtarza werdykt, więc widoczny tekst szukamy poza `[role=status]`).
- **Test wzorcowy**: `src/components/registry/MedicineCheckResult.test.tsx`.
- TBD — zob. §3 Faza 2 dla wzorca nieaktualnego werdyktu (kontrolowana asynchroniczność, asercje na tym, co wyrenderowane).

### 6.4 Adding a test for a new API endpoint

- TBD — zob. §3 Faza 3 dla wzorca nieprawidłowych danych i dostępu między kontami.

### 6.5 Adding a test for the registry import or parser

- **Istniejący wzorzec**: zaimportuj fixture'y v1, v1, v2, potem `node scripts/registry-import-check.mjs`.
- TBD — zob. §3 Faza 5 dla wzorca błędnego rekordu (import nienaruszony albo głośny błąd).

### 6.6 Per-rollout-phase notes

**Faza 1 — Check verdict correctness (2026-10-13, zmiana `testing-check-verdict-correctness`)**

- **Dostarczone**: runner Vitest (`npm test`, `npm run test:db`), `checkVerdict` i `parseMedicineCheck` jako testowane czyste funkcje, test komponentu dla wyniku sprawdzenia, skrypt reguły przeniesiony do 35 przypadków Vitest. Nieczytelna odpowiedź pokazuje teraz błąd z ponowieniem zamiast „Nie masz tego leku”.
- **Żadnego prawdziwego błędu reguły** nie znalazło 16 nowych przypadków; wartością jest ochrona przed regresją i pomost od wyniku reguły do werdyktu na ekranie.
- **Testy mutacyjne**: Stryker 10.0.0 z `@stryker-mutator/vitest-runner` nie działa z Vitest 5.0.4. Z `projects` nie startuje (`Converting circular structure to JSON` na `resolvedProjects`); z płaską konfiguracją startuje, ale nie zabija żadnego mutanta (0 ze 155, także dla oczywiście zepsutego `return ""`), więc wynik nic nie znaczy. Zależności i konfiguracja zostały usunięte. Sprawdzenia mutacyjne tej fazy zrobiono ręcznie (celowe zepsucie werdyktu, strażnika i reguły SQL). Spróbować ponownie, gdy Stryker będzie wspierał Vitest 5.
- **Pomiar na pełnym rejestrze (eksport z 2026-10-08)**: 309 nazw powszechnych łączy produkty o rozłącznych zbiorach substancji, 1 wartość z NBSP, 118 nazw powszechnych z separatorem innym niż „+”, 6 par kluczy wariantu różniących się tylko białymi znakami. `lower()` i `s` zachowują się tak samo lokalnie i na produkcji. Szczegóły i decyzje autora: `context/archive/2026-10-10-testing-check-verdict-correctness/placeholder-measurement.md`.
- **Decyzje**: zmieni się tylko obcinanie spacji na początku i końcu klucza wariantu (osobna zmiana); przegląd 309 nazw pod kątem prawdziwych zaślepek odłożony.
- **Wnioski**: `projects` w `vitest.config.ts` działa dla runnera, ale nie dla Strykera; reguła substancji to OR zbioru nazw powszechnych i zbioru substancji, więc substancja zapisana jako jeden napis psuje tylko ścieżkę substancji.

## 7. What We Deliberately Don't Test

Wykluczenia uzgodnione podczas wdrażania (wywiad Fazy 2, P5). Przyszli
współtwórcy powinni ich przestrzegać, chyba że zmieni się założenie, na
którym stoją.

- **Skrypty narzędziowe `roadmap:sync`, `perf`, `ui:shots`** — pomoce dla programisty bez skutków dla użytkownika. Ocenić ponownie, jeśli któryś zacznie blokować CI albo wdrożenie. (Źródło: wywiad Fazy 2, P5.)
- **Logowanie i wylogowanie** — bez nowych testów; pracę wykonuje Supabase, a istniejący przebieg `smoke` nadal pokrywa ten przepływ. Ocenić ponownie, jeśli zmieni się metoda logowania (PRD Open Question 2). (Źródło: wywiad Fazy 2, P5.)
- **Harmonogram odświeżania rejestru** — odświeżanie, które przestaje działać, wyłapuje e-mail o nieudanym przebiegu i data stanu na `/szukaj`, a nie test. Ocenić ponownie, jeśli repozytorium stanie się publiczne. (Źródło: rejestr ryzyk w `infrastructure.md`.)
- **Import CSV (S-04)** — jeszcze nie zbudowany, więc nie ma czego chronić. Dodać przez `--refresh`, gdy S-04 wejdzie. (Źródło: roadmapa S-04, status proposed.)

## 8. Freshness Ledger

- Strategia (§1–§5) ostatnio przejrzana: 2026-10-13 (§4 i §6 zaktualizowane przez Fazę 1; sama strategia bez zmian)
- Wersje stacku ostatnio zweryfikowane: 2026-10-13 (Vitest 5.0.4, jsdom 29.1.1, Testing Library 16.3.3, pg 8.x)
- Odwołania do narzędzi AI-native ostatnio zweryfikowane: 2026-10-10

Odśwież (`/10x-test-plan --refresh`), gdy:

- z roadmapy lub archiwum wyłoni się nowe ryzyko z pierwszej trójki,
- data `checked:` polecanego narzędzia jest starsza niż trzy miesiące,
- zmieni się stack projektu (nowy framework, nowy runner testów),
- §7 przestanie odpowiadać temu, w co wierzy zespół.
