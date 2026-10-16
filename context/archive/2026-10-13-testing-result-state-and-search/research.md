---
date: 2026-10-13T15:48:04+02:00
researcher: michalg84 (z Claude Code)
git_commit: 600d649978174c3b49f7f6d8305056369087b67a
branch: test/result-state-and-search
repository: mamlek
topic: "Faza 2 wdrażania testów: czego muszą dowieść testy dla ryzyka #3 (nieaktualny werdykt) i ryzyka #5 (kolejność podpowiedzi i warianty)"
tags: [research, testing, registry-search, medicine-check, result-state, vitest]
status: complete
last_updated: 2026-10-16
last_updated_by: michalg84 (z Claude Code)
last_updated_note: "Przetłumaczone na polski; odwołania do linii test-plan.md zaktualizowane po jego tłumaczeniu."
---

# Research: Faza 2 wdrażania testów — stan wyniku i wyszukiwanie (ryzyka #3, #5)

**Date**: 2026-10-13T15:48:04+02:00
**Researcher**: michalg84 (z Claude Code)
**Git Commit**: 600d649978174c3b49f7f6d8305056369087b67a
**Branch**: test/result-state-and-search
**Repository**: mamlek

## Research Question

Czego muszą dowieść testy dla ryzyk #3 i #5 z Fazy 2 w `test-plan.md`?

- **#3**: które źródła określają, co pokazuje ekran po edycji, wyczyszczeniu lub ponownym wyborze leku oraz gdy odpowiedzi sprawdzenia przychodzą w innej kolejności, i gdzie w komponencie żyje ten stan.
- **#5**: które źródła określają reguły kolejności w `searchVariants` i co musi zawierać mała, ręcznie zbudowana lista, żeby przećwiczyć je w CI.
- Co już pokrywają testy z Fazy 1 i plik wzorcowy `search:check` oraz co można wziąć z książki kucharskiej §6.1 i §6.3.

## Summary

- **#5 ma kompletną, spisaną wyrocznię.** Uzgodniona reguła dopasowania jest w planie S-01 (`context/archive/2026-10-02-registry-search-suggestions/plan.md:46-57`): normalizacja, minimalna długość, cztery poziomy A–D, reguła dla kolejnych słów zapytania, kolejność w obrębie poziomu, limit 20 i suma. FR-002 (`context/foundation/prd.md:142`) i US-01 (`prd.md:109-111`) dają wymaganie na poziomie produktu. Wartości oczekiwane da się wyprowadzić ręcznie z tej reguły na małej liście; żadna wartość nie musi pochodzić z uruchomienia kodu.
- **#3 ma uboższą wyrocznię, rozproszoną po trzech dokumentach.** PRD nie ma zdania o nieaktualnym stanie. Reguły są takie: edycja tekstu usuwa kartę i werdykt (`context/archive/2026-10-09-medicine-check/plan.md:473`), nowy wybór przerywa poprzednie zapytanie sprawdzenia (`medicine-check/plan.md:230`), odpowiedź na zapytanie inne niż ostatnie jest odrzucana, a wyniki usuniętego zapytania nie mogą wrócić (`context/archive/2026-10-06-registry-search-performance/plan.md:70-73`, `reviews/impl-review.md:75-83`). Razem uzasadniają zdanie z planu testów „ekran nigdy nie pokazuje werdyktu dla czegoś innego niż bieżący wybór” (`context/foundation/test-plan.md:60`).
- **Stan żyje w czterech miejscach**: wybór w `RegistrySearch` (`src/components/registry/RegistrySearch.tsx:43-46`), odpowiedź sprawdzenia w `useMedicineCheck` (`src/components/hooks/useMedicineCheck.ts:19-72`), wpisany tekst w `MedicineSuggest` (`src/components/registry/MedicineSuggest.tsx:27`) i odpowiedź z podpowiedziami w `useRegistrySearch` (`src/components/hooks/useRegistrySearch.ts:31-150`). Dowiedzenie #3 na tym, co wyrenderowane, wymaga więc testu całego `RegistrySearch`, a nie samego `MedicineCheckResult`.
- **Czytanie kodu nie ujawniło defektu** na sprawdzonych ścieżkach #3 na `/szukaj`. Tak jak w Fazie 1, oczekiwaną wartością testów jest ochrona przed regresją. Istnieje jedna pokrewna luka poza brzmieniem ryzyka: formularz dodawania na `/apteczka` nie usuwa wyboru przy edycji (Open Question 1).
- **Nic z Fazy 1 nie pokrywa żadnego z ryzyk.** `MedicineCheckResult.test.tsx` renderuje w każdym przypadku ze stałym `productId={1}`; nie ma pliku testów dla `registry-search.ts`, `MedicineSuggest`, `RegistrySearch` ani dwóch hooków wyszukiwania. Plik wzorcowy porównuje obecny wynik z wcześniejszym wynikiem tego samego kodu, jest ignorowany przez git i wymaga pełnego rejestru.
- **Potrzebny jest jeden nowy punkt podmiany.** jsdom nie ma `Worker`, więc test `RegistrySearch` musi podmienić `Worker` oprócz `fetch`. To wykracza poza książkę kucharską §6.3 („podmień tylko `fetch`”) i jest decyzją dla planu.

## Detailed Findings

### Ryzyko #5: wyrocznia dla `searchVariants`

Źródło każdej reguły poniżej: plan S-01, sekcja „Reguła dopasowania (uzgodniona)”, `context/archive/2026-10-02-registry-search-suggestions/plan.md:46-57`. Plan oznacza regułę jako uzgodnioną z autorem; przykłady z `:57` sprawdzono ręcznie na pełnym imporcie (`plan.md:345`) i ponownie w S-09 (`registry-search-performance/plan.md:542-543`).

| #   | Reguła                                                                                                                                                                                                                               | Linia źródła         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| R1  | Zapytanie i pola są zamieniane na małe litery, znaki diakrytyczne usuwane (NFD, znaki łączące odrzucone), `ł` staje się `l`. Słowa to ciągi `[a-z0-9]`.                                                                              | `plan.md:48`         |
| R2  | Zapytanie krótsze niż 3 znaki po normalizacji, bez liczenia separatorów, nie daje listy. `no spa` (5 znaków) działa.                                                                                                                 | `plan.md:49`         |
| R3  | Pierwsze słowo zapytania wyznacza poziom; wygrywa pierwszy pasujący poziom. A: zaczyna pierwsze słowo nazwy produktu. B: zaczyna inne słowo nazwy produktu. C: zaczyna słowo nazwy powszechnej. D: zaczyna słowo substancji czynnej. | `plan.md:50-54`      |
| R4  | Każde kolejne słowo zapytania musi zaczynać słowo pola danego poziomu albo mocy lub postaci; w przeciwnym razie wariant odpada na tym poziomie i jest próbowany na następnym.                                                        | `plan.md:55`         |
| R5  | Kolejność: poziom A, B, C, D. W obrębie poziomu: najpierw krótsza nazwa produktu (liczba znaków oryginalnej nazwy), potem nazwa według polskiego porządku sortowania, potem moc według tego samego porządku, potem `id`.             | `plan.md:56`         |
| R6  | Najwyżej 20 wyników; `total` to liczba wszystkich pasujących wariantów przed obcięciem.                                                                                                                                              | `plan.md:56`, `:206` |
| R7  | Brak tolerancji literówek: `ibupom` nie daje nic.                                                                                                                                                                                    | `plan.md:33`, `:57`  |

Wymagania produktowe, którym służy reguła:

- Nazwa produktu ma pierwszeństwo przed nazwą powszechną i substancjami (`prd.md:142`, FR-002).
- Podpowiedzi pokazują nazwę z mocą i postacią, bo sama nazwa nie odróżnia „Ibuprom Max 400” od „Ibuprom 400” (`prd.md:109-111`; notatka o ryzyku S-01 w roadmapie, `context/foundation/roadmap.md:108`).
- W rejestrze nazwa to „Ibuprom Max”, a „400” jest w polu mocy (`registry-search-suggestions/research.md:43`), więc „moc odróżnia warianty” to w praktyce R4: `ibuprom 400` musi zostawić Ibuprom Max · 400 mg i odrzucić Ibuprom · 200 mg (`plan.md:57`).

Gdzie jest to zaimplementowane (żeby plan mógł wskazać testowaną jednostkę, nie jako wyrocznia): `normalizeText` `src/lib/registry-search.ts:39-45`, `isQueryLongEnough` `:56-62`, sortowanie `:64-71`, `buildSearchIndex` `:74-92`, `levelOf` `:115-139`, `searchVariants` `:145-176`. Wszystkie cztery to eksportowane czyste funkcje bez importów `astro:*` ani przeglądarkowych (`:1`), więc działają w istniejącym projekcie `unit` (`vitest.config.ts:12-18`).

„Moc i postać odróżniają warianty” obsługują dwie warstwy:

1. **Dopasowanie** (unit): dwa warianty o tej samej nazwie i różnej mocy lub postaci są zwracane oba, każdy z własną mocą i postacią, a słowo zapytania z mocy lub postaci zawęża do właściwego.
2. **Wyświetlanie** (komponent): każda opcja renderuje nazwę i drugą linię „moc · postać” (`MedicineSuggest.tsx:204`, `:219-220`; kontrakt w S-01 `plan.md:222`). To jedna asercja w teście `RegistrySearch` dla ryzyka #3, nie osobny zestaw.

Nie jest częścią `searchVariants`: składanie duplikatów z importu równoległego w jeden wariant dzieje się w SQL przy budowaniu listy (`plan.md:59-63`) i sprawdza to `scripts/registry-import-check.mjs` (`plan.md:110-114`). Ręcznie zbudowana lista do testu unit zaczyna się po tym kroku.

### Ryzyko #5: co musi zawierać ręcznie zbudowana lista

Lista to `RegistrySearchListPayload` (`src/types.ts:8-22`): krotki `[id, name, strength, form, commonName, substances]`. Nazwy mogą być realistyczne, ale wiersze są pisane ręcznie, a oczekiwany wynik każdego zapytania jest wyprowadzony z R1–R7 obok. Jedna właściwość na `it.each`, zgodnie z książką kucharską §6.1 (`test-plan.md:138`).

| Właściwość do dowiedzenia                                  | Wiersze potrzebne na liście                                                                                                                                  | Przykładowe zapytanie → wynik oczekiwany z reguły                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nazwa wygrywa z nazwą powszechną i substancją (R3, FR-002) | jeden wariant pasujący w nazwie (A), jeden tylko w nazwie powszechnej (C), jeden tylko w substancji (D, nazwa powszechna bez tego słowa)                     | `paracetamol` → wiersz A, potem C, potem D                                                                                                                                     |
| Pierwsze słowo nazwy wygrywa z dalszym (R3)                | wiersz A z **dłuższą** nazwą niż wiersz B, żeby decydował poziom, a nie długość nazwy                                                                        | `max` → wiersz w rodzaju „Maxigra Go” przed wierszem w rodzaju „Ibum Max”                                                                                                      |
| Kolejne słowa zawężają po mocy (R4)                        | to samo pierwsze słowo nazwy, moce 200 mg i 400 mg                                                                                                           | `ibuprom 400` → tylko wiersze 400 mg                                                                                                                                           |
| Kolejne słowa zawężają po postaci (R4)                     | ta sama nazwa i moc, dwie postacie                                                                                                                           | nazwa + słowo postaci → jeden wiersz                                                                                                                                           |
| Warianty nie giną                                          | dwa wiersze z tą samą nazwą i różną mocą                                                                                                                     | sama nazwa → oba wiersze, `total` 2                                                                                                                                            |
| Przejście do następnego poziomu (R4)                       | wiersz, którego nazwa pasuje do pierwszego słowa, a drugie słowo zapytania jest tylko w nazwie powszechnej                                                   | poziom C, za wszystkimi wierszami A i B                                                                                                                                        |
| Znaki diakrytyczne i `ł` ignorowane (R1)                   | nazwa lub postać z `ż`, `ó`, `ł`                                                                                                                             | `zel` i `żel` → ten sam wynik                                                                                                                                                  |
| Wielkość liter i otaczające spacje ignorowane (R1)         | dowolny wiersz                                                                                                                                               | `IBUPROM MAX`, `  ibuprom  ` → to samo co małymi literami                                                                                                                      |
| Minimalna długość (R2)                                     | dwuczłonowa nazwa w rodzaju „No-Spa”                                                                                                                         | `ib` → nic; `no spa` → wiersz                                                                                                                                                  |
| Tylko prefiks, bez literówek (R3, R7)                      | „Ibuprom”                                                                                                                                                    | `prom` → nic; `ibupom` → nic                                                                                                                                                   |
| Kolejność w obrębie poziomu (R5)                           | ten sam poziom: różne długości nazw; równe długości z nazwami różniącymi się w polskim sortowaniu; ta sama nazwa, różna moc; ta sama nazwa i moc, różne `id` | jedno zapytanie, które zwraca je wszystkie w kolejności R5                                                                                                                     |
| Limit i suma (R6)                                          | więcej dopasowań niż limit                                                                                                                                   | wywołanie z małym jawnym `limit` (trzeci parametr, `registry-search.ts:145`): `results.length` = limit, `total` = wszystkie dopasowania, zostają wiersze najwyżej w kolejności |
| Brakujące pola                                             | wiersze ze `strength`, `form` lub `commonName` równym `null` i pustą listą substancji                                                                        | pasują po nazwie i nie rzucają błędu                                                                                                                                           |

Około 15–20 wierszy pokrywa tabelę. Tę samą listę może podawać podmieniony `fetch` w teście komponentu dla ryzyka #3, więc jeden fixture zasila oba.

`Intl.Collator("pl")` (`registry-search.ts:8`) zależy od danych ICU w Node, który uruchamia testy. W tym researchu nie sprawdzono, czy obraz Node w CI sortuje `ł` tak samo jak lokalny. Test kolejności sortowania powinien używać pary, której kolejność w polskim jest jednoznaczna (na przykład `a` przed `ą` przed `b`).

### Ryzyko #3: wyrocznia

| #   | Co musi pokazać ekran                                                                                                                                                                   | Źródło                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| S1  | Po wyborze: kartę wybranego leku i, gdy sprawdzenie odpowie, jeden werdykt dla niego (US-01).                                                                                           | `prd.md:84-90`; `medicine-check/plan.md:284-290`                                          |
| S2  | Każda edycja tekstu przez użytkownika usuwa wybór: karta i werdykt znikają, nie zostają pod inną wpisaną nazwą. Wybranie podpowiedzi nie jest edycją.                                   | `medicine-check/plan.md:473`; przegląd F5 `medicine-check/reviews/impl-review.md:101-109` |
| S3  | Nowy wybór przerywa poprzednie zapytanie sprawdzenia; dopóki nowe nie odpowie, status to ładowanie.                                                                                     | `medicine-check/plan.md:230-236`                                                          |
| S4  | Odpowiedź workera wyszukiwania z numerem innym niż ostatnio wysłany jest odrzucana.                                                                                                     | `registry-search-performance/plan.md:70-71`                                               |
| S5  | Gdy nowa odpowiedź jest w drodze, lista trzyma poprzednie wyniki (bez migotania). „Brak leku o takiej nazwie w rejestrze” pojawia się tylko, gdy odpowiedź dotyczy bieżącego zapytania. | `registry-search-performance/plan.md:72`, `:298-299`                                      |
| S6  | Wyniki zapytania, które użytkownik usunął, nie mogą wrócić: `ibu` → wyczyszczenie → `par` nie może znowu pokazać wyników `ibu`.                                                         | `registry-search-performance/reviews/impl-review.md:75-83` (F4, naprawione)               |
| S7  | Błędna odpowiedź jest gorsza niż brak odpowiedzi.                                                                                                                                       | `prd.md:75` (Guardrails)                                                                  |

Z S1–S7 wynikają te scenariusze. Każdy jest wyrażony jako to, co wyrenderowane, tak jak wymaga plan testów (`test-plan.md:60`):

1. **Edycja po werdykcie.** Wybierz A, widać werdykt A, wpisz jeden znak → brak karty „Wybrany lek”, brak werdyktu (S2). `ui:shots` dochodzi do tego stanu (`scripts/ui-shots.mjs:250-262`), ale to pomoc do zrzutów ekranu, wymaga działającego serwera i nie działa w CI.
2. **Wyczyszczenie po werdykcie.** To samo z opróżnionym polem (S2, S6).
3. **Edycja w trakcie sprawdzenia, odpowiedź przychodzi późno.** Wybierz A, edytuj przed odpowiedzią, potem pozwól dotrzeć odpowiedzi A → nadal brak karty i werdyktu (S2, S3).
4. **Drugi wybór wyprzedza pierwszy.** Wybierz A (w toku), wybierz B, B odpowiada, potem odpowiada A → karta i werdykt należą do B, przed spóźnioną odpowiedzią A i po niej (S3). To przypadek „do zakwestionowania” z planu testów: spóźniona odpowiedź na wcześniejsze zapytanie (`test-plan.md:60`).
5. **Odwrotna kolejność względem 4.** Spóźniona odpowiedź A przychodzi pierwsza, gdy B jest jeszcze w toku → ładowanie dla B, brak werdyktu A; potem werdykt B (S3).
6. **Ponowny wybór tego samego leku.** Wybierz A, edytuj, wybierz znowu A → widać kartę A i werdykt A. Żadne źródło nie mówi, czy trzeba wysłać nowe zapytanie, więc test sprawdza tylko to, co wyrenderowane.
7. **Usunięte zapytanie nie wraca.** Wpisz `ibu` (z odpowiedzią), wyczyść, wpisz `par`, zanim worker odpowie → nie widać żadnej opcji z odpowiedzi `ibu`; spóźniona odpowiedź `ibu` niczego nie zmienia (S4, S6).
8. **„Brak leku” tylko dla bieżącego zapytania.** Zapytanie bez dopasowań wpisane po zapytaniu z dopasowaniami → komunikat pojawia się dopiero po jego własnej odpowiedzi (S5).

Żeby odróżnić werdykty na ekranie, A i B potrzebują odpowiedzi różnego rodzaju (na przykład A „Masz ten lek · 1 opakowanie”, B „Nie masz tego leku”) i różnych nazw w karcie. Teksty są już przypięte jako stałe w teście z Fazy 1 (`MedicineCheckResult.test.tsx:8-13`).

### Ryzyko #3: gdzie żyje stan

- **Wybór**: `selected` w `RegistrySearch` (`RegistrySearch.tsx:43`). Ustawiany przez `onSelect`, czyszczony przez `onEdit` (`:51-57`). Karta i wynik renderują się tylko, gdy jest ustawiony (`:63-68`).
- **Pełne dane sprawdzanego leku**: `searched` (`RegistrySearch.tsx:45`), zapisywane przez `MedicineCheckResult` przez `onSearched` (`MedicineCheckResult.tsx:63-67`). Nigdy nie jest czyszczone; `shown` używa go tylko wtedy, gdy jego `id` równa się `id` wyboru (`RegistrySearch.tsx:46`).
- **Odpowiedź sprawdzenia**: `loaded` w `useMedicineCheck`, zapisywane z kluczem produktu i próby (`useMedicineCheck.ts:22-30`) i odczytywane tylko, gdy klucz zgadza się z bieżącym (`:66`). Efekt przerywa swoje zapytanie przy zmianie produktu lub odmontowaniu (`:57-59`), a `finish` ignoruje przerwane zapytanie (`:27-31`).
- **Jedna instancja na wybór**: `<MedicineCheckResult key={selected.id}>` (`RegistrySearch.tsx:66`) montuje wynik od nowa dla innego leku, więc jego stan zaczyna się pusty.
- **Wpisany tekst**: `query` w `MedicineSuggest` (`MedicineSuggest.tsx:27`). `handleChange` wywołuje `onEdit` (`:59-64`); `select` wstawia wybraną nazwę do pola i wywołuje `onSelect`, nie `onEdit` (`:52-57`). To jedyne dwa miejsca w pliku, które wywołują `setQuery`.
- **Odpowiedź z podpowiedziami**: `answer` w `useRegistrySearch` z id ostatnio wysłanego zapytania w refie (`useRegistrySearch.ts:34-37`); odpowiedź z innym id jest odrzucana (`:84-85`); id rośnie przy każdej zmianie zapytania, także gdy nic nie jest wysyłane (`:118-129`); zbyt krótkie zapytanie zeruje `answer` w trakcie renderu (`:111-115`).
- **Zapytania są anulowane** przy sprawdzeniu (`AbortController`, `useMedicineCheck.ts:25`, `:35`) i przy pobieraniu listy (`useRegistrySearch.ts:41`, `:53`). Zapytania do workera nie są anulowane; są filtrowane po id.
- **Co uruchamia sprawdzenie**: zamontowanie `MedicineCheckResult` z `productId` albo `retry` (`useMedicineCheck.ts:24-64`). W `RegistrySearch` oznacza to wybór.

Każdą spóźnioną odpowiedź chronią dwa zabezpieczenia (flaga przerwania oraz klucz lub id). Test, który usuwa tylko jedno z nich, nadal przejdzie, i tak ma być: test dowodzi zachowania, a nie tego, które zabezpieczenie je zapewnia.

Drugim użytkownikiem `MedicineSuggest` jest `KitAddForm` (`src/components/kit/KitAddForm.tsx:345-352`). Nadaje `PackForm` klucz `variant.id` i używa `useVariantPackages`, który ma ten sam kształt klucza i przerywania (`src/components/hooks/useVariantPackages.ts:20-69`). Nie przekazuje `onEdit` (`KitAddForm.tsx:350`). Zob. Open Question 1.

### Co już istnieje

- **Test komponentu z Fazy 1** (`src/components/registry/MedicineCheckResult.test.tsx`, 7 bloków testów, w tym jeden `it.each` po 6 błędach): teksty ostrzeżeń, stany błędu i 401, ponowienie. Każdy przypadek renderuje `<MedicineCheckResult productId={1} />` i od razu rozwiązuje `fetch` (`:57-59`). Nie ma przypadku z drugim produktem, zapytaniem w toku ani z `RegistrySearch`.
- **Test unit z Fazy 1** (`src/lib/medicine-check-verdict.test.ts`): mapowanie werdyktu; niezwiązany z wyszukiwaniem.
- **`search:check`** (`scripts/registry-search-check.mjs`): 31 zapytań (`:28-70`), dla każdego `total` i do 20 id w kolejności (`:108-120`), porównywane z `.perf/search-golden.json`. Plik wzorcowy powstaje przez `--save` z kodu w obecnej postaci (`:185-193`), jest ignorowany przez git (`.gitignore:50`), czyta listę z lokalnej bazy z pełnym rejestrem (`:86-106`) i kończy się kodem 2, gdy wersja listy jest inna (`:196-201`). Lokalny plik zapisano 2026-10-06 dla wersji listy 1790946891. Wykrywa zmianę, ale nie mówi, która strona ma rację (`test-plan.md:62`), i nie działa w CI (`test-plan.md:100-103`).
- **Stan `edited-after-pick` w `ui:shots`** (`scripts/ui-shots.mjs:250-262`): pokrywa tylko scenariusz 1, w prawdziwej przeglądarce na działającym serwerze, nie w CI.
- **Brak testów** dla `registry-search.ts`, `MedicineSuggest`, `RegistrySearch`, `useRegistrySearch`, `useMedicineCheck` (jako hooka) i `KitAddForm`: śledzone pliki testów to dwa powyższe plus `tests/db/` (`git ls-files`, 2026-10-13).

### Co można wziąć z książki kucharskiej

- **§6.1** (`test-plan.md:136-142`): czysta funkcja w `src/lib/`, wartość oczekiwana ze spisanej reguły, jedno `it.each` na właściwość. Pasuje do ryzyka #5 bez zmian: `src/lib/registry-search.test.ts` w projekcie `unit`. Linia „TBD — zob. §3 Faza 2 dla wzorca dopasowania wyszukiwania” (`:142`) to właśnie to, co ta faza uzupełnia.
- **§6.3** (`test-plan.md:154-158`): wyrenderuj prawdziwy komponent, sprawdzaj wyrenderowany tekst, widoczny tekst szukaj poza `[role=status]`, teksty prawne jako stałe. Do wzięcia bez zmian: pomocniki `stubFetch`, `reply`, `item` i `response` (`MedicineCheckResult.test.tsx:17-73`) oraz sprzątanie w `tests/setup-component.ts`. Są lokalne dla pliku z Fazy 1, więc ponowne użycie oznacza przeniesienie ich do wspólnego pomocnika albo skopiowanie.
- **Runner**: `vitest.config.ts` zbiera `src/**/*.test.ts` (node) i `src/**/*.test.tsx` (jsdom); nowe pliki obok kodu nie wymagają zmian w konfiguracji. Pliki testów nie mogą leżeć pod `src/pages/` (AGENTS.md).

Czego §6.3 jeszcze nie pokrywa:

- **Kontrolowanej asynchroniczności.** `reply` z Fazy 1 rozwiązuje się od razu. Scenariusze nieaktualnego werdyktu potrzebują podmiany `fetch`, która zwraca promise per id produktu, rozwiązywany przez test później, w wybranej przez niego kolejności. Podmiana nie powinna odrzucać przy przerwaniu: odpowiedź, która dociera mimo przerwanego zapytania, to mocniejszy przypadek. Po rozwiązaniu spóźnionej odpowiedzi test opróżnia oczekującą pracę i sprawdza brak; sleep nie jest potrzebny (`test-plan.md:60`).
- **`Worker`.** jsdom 29 nie ma `Worker` (sprawdzone: `typeof window.Worker === "undefined"`). `useRegistrySearch` tworzy go po pobraniu listy (`useRegistrySearch.ts:70`). Test `RegistrySearch` potrzebuje zastępnika, który odbiera wiadomości `load` i `search` (`src/types.ts:118-125`) i pozwala testowi decydować, kiedy dostarczyć każdą odpowiedź. Może liczyć odpowiedzi prawdziwymi `buildSearchIndex` i `searchVariants`, tak jak robi to prawdziwy worker (`src/lib/registry-search.worker.ts:14-43`).
- **Innych luk jsdom** (sprawdzone na własnym window jsdom): brakuje `Element.prototype.scrollIntoView`, a `MedicineSuggest` wywołuje je, gdy opcja staje się aktywna z klawiatury (`MedicineSuggest.tsx:46-50`); wybór kliknięciem tam nie dochodzi. Na window jsdom brakuje `performance.mark`, a hook wywołuje je, gdy worker zgłasza gotowość (`useRegistrySearch.ts:79`). Niesprawdzone: czy środowisko jsdom w Vitest wystawia zamiast tego `performance` z Node.
- **Brak `@testing-library/user-event`** w `package.json`; Faza 1 używa `fireEvent`.

### CI

`npm test` jeszcze nie działa w CI; podpięcie to Faza 4 wdrażania (`test-plan.md:77`, `:126`). „Działa w CI” oznacza więc w tej fazie dla ryzyka #5: test nie potrzebuje bazy ani pełnego rejestru, więc Faza 4 może dodać go do joba `ci` bez nowej infrastruktury.

## Code References

- `src/lib/registry-search.ts:39-176` — normalizacja, indeks, poziomy, wyszukiwanie (jednostka testowana dla #5)
- `src/lib/registry-search.worker.ts:14-43` — protokół workera, którego musi trzymać się zastępnik
- `src/types.ts:8-32`, `:118-125` — dane listy, wariant, wiadomości workera
- `src/components/registry/RegistrySearch.tsx:42-71` — stan wyboru, czyszczenie przy edycji, wynik z kluczem
- `src/components/registry/MedicineSuggest.tsx:52-64`, `:128-141`, `:203-223` — wybór i edycja, komunikaty powiązane z zapytaniem, na które przyszła odpowiedź, renderowanie opcji
- `src/components/hooks/useMedicineCheck.ts:19-72` — klucz zapytania, przerwanie, ponowienie
- `src/components/hooks/useRegistrySearch.ts:31-150` — worker, id zapytań, zerowanie przy krótkim zapytaniu
- `src/components/kit/KitAddForm.tsx:345-352` — drugi użytkownik `MedicineSuggest`, bez `onEdit`
- `src/components/registry/MedicineCheckResult.test.tsx:17-73` — pomocniki do ponownego użycia
- `vitest.config.ts:10-28`, `tests/setup-component.ts` — projekty runnera i sprzątanie
- `scripts/registry-search-check.mjs:28-70`, `:108-120`, `:185-201` — kontrola pliku wzorcowego
- `scripts/ui-shots.mjs:250-262` — stan zrzutu `edited-after-pick`

## Architecture Insights

- Oba hooki, które ładują dane per wybór, używają tego samego wzorca: klucz zapytania zapisany z odpowiedzią plus flaga przerwania. Dodatkowo komponent jest montowany od nowa per wybór przez `key`. Test na poziomie `RegistrySearch` ćwiczy wszystkie trzy naraz.
- Reguła wyszukiwania jest czysta i już oddzielona od Reacta i workera, więc ryzyko #5 nie potrzebuje żadnego zastępnika.
- Lista-fixture zbudowana dla #5 jest też naturalnym wejściem testu komponentu dla #3, przez podmienione pobieranie listy.

## Historical Context (from prior changes)

- `context/archive/2026-10-02-registry-search-suggestions/plan.md:46-57` — uzgodniona reguła dopasowania i jej przykłady (nadal zgodna z kodem czytanym 2026-10-13); `:266` mówi, że regułę sprawdzono ręcznie, bo nie było runnera testów (co do runnera już nieaktualne: Vitest istnieje od Fazy 1; nadal prawda, że żaden test nie pokrywa reguły).
- `context/archive/2026-10-06-registry-search-performance/plan.md:70-73`, `:298-299` — asynchroniczne odpowiedzi, numerowane zapytania; `reviews/impl-review.md:75-83` — F4, wcześniejsze wyniki wracały i dało się je wybrać, naprawione.
- `context/archive/2026-10-09-medicine-check/plan.md:230-236`, `:284-290`, `:473` — kontrakt hooka sprawdzenia, wynik z kluczem, dopisek o czyszczeniu przy edycji; `reviews/impl-review.md:101-109` — F5, czyszczenie przy edycji dodano poza planem.
- `context/archive/2026-10-07-add-medicine-to-kit/plan.md:201` — „Changing the medicine resets pack, quantity and expiry”; nic nie mówi o edycji tekstu bez nowego wyboru.
- `context/foundation/test-plan.md:43`, `:45`, `:60`, `:62` — ryzyka #3 i #5 i wskazówki odpowiedzi na nie.

## Related Research

- `context/archive/2026-10-02-registry-search-suggestions/research.md` — dane rejestru stojące za regułą wyszukiwania
- `context/archive/2026-10-09-medicine-check/research.md` — przepływ sprawdzenia i ponowne użycie `MedicineSuggest`
- `context/archive/2026-10-10-testing-check-verdict-correctness/research.md` — Faza 1 tego wdrażania

## Open Questions

1. **Formularz dodawania na `/apteczka`: czy nieaktualny wybór tam jest w zakresie?** `KitAddForm` nie przekazuje `onEdit`, więc po wyborze użytkownik może zmienić tekst bez ponownego wyboru, a formularz opakowania wcześniejszego leku zostaje (`KitAddForm.tsx:350-352`). Ryzyko #3 jest sformułowane dla werdyktu i żadne źródło nie mówi, co ma robić formularz dodawania. Opcje: pominąć w tej fazie, przypiąć jako znane ograniczenie albo uznać za defekt i naprawić w osobnej zmianie. Decyzja autora.
2. **Kolejność mocy jest tekstowa, nie liczbowa.** R5 mówi, że moc jest porównywana tym samym collatorem, więc „1000 mg” jest przed „500 mg” dla tej samej nazwy. Reguła jest tak spisana i kod jej się trzyma. Czy test ma przypiąć tę kolejność jako uzgodnioną regułę, czy zostawić kolejność mocy bez asercji, dopóki autor nie zdecyduje, czy chce kolejności liczbowej?
3. **Zastępnik dla `Worker`.** Ręcznie napisany zastępnik w pomocnikach testów albo pakiet, który uruchamia prawdziwy plik workera w procesie testów. Pierwsza opcja daje kontrolę nad tym, kiedy przychodzą odpowiedzi, czego potrzebują scenariusze 7 i 8; drugiej nie oceniono pod kątem Vitest 5. Decyzja planu.
4. **Sortowanie w CI.** Nie sprawdzono, czy Node w CI sortuje polskie litery tak jak lokalny; dotyczy tylko przypadku sortowania z R5.
