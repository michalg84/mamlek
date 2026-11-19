# Przejścia substancja ↔ lek i dodanie leku z wyszukiwania — Implementation Plan

## Overview

Wycinek S-17 łączy istniejące ekrany przejściami. Substancja czynna jest linkiem w trzech miejscach: na karcie wybranego leku na `/szukaj`, w wyniku sprawdzenia i na liście apteczki. Link prowadzi do `/szukaj` z listą leków zawierających tę substancję. Z tej listy użytkownik wybiera lek i widzi jego kartę oraz wynik sprawdzenia. Przycisk „Dodaj do apteczki” na karcie przenosi na `/apteczka` z formularzem dodawania i tym lekiem już wybranym. Reguła dopasowania (`medicine_check`) się nie zmienia.

## Current State Analysis

- **Wyszukiwanie** działa w Web Workerze (`src/lib/registry-search.worker.ts`):
  - indeks `buildSearchIndex` jest budowany raz na pobraną listę (~16 165 wariantów);
  - `searchVariants` (`src/lib/registry-search.ts:292`) dopasowuje prefiksy słów na poziomach A–D, z limitem 20 i licznikiem `total`;
  - słowa substancji są spłaszczone w jedną pulę (`:222`).
- **Brakujące wyszukiwania:** nie ma filtra „wariant zawiera tę substancję” ani wyszukiwania wariantu po id.
- **Jeden worker na hook:** każde wywołanie `useRegistryListWorker` (`src/components/hooks/useRegistryListWorker.ts:26`) tworzy osobny Worker, który parsuje 2 MB i buduje indeks. Odpowiedzi trafiają do jednego callbacku `onAnswer`, a do niego dochodzą tylko typy `results`/`matches` (`:7`). Liczniki id żądań są lokalne dla hooka (`useRegistrySearch`, `useRegistryMatch`).
- **Stan `/szukaj` tylko w pamięci:** `RegistrySearch.tsx` trzyma `selected` w `useState`, a w `src/` nie ma `pushState`/`popstate`. `szukaj.astro:55` przekazuje tylko `version`.
- **`MedicineSuggest`** (`src/components/registry/MedicineSuggest.tsx:27-29`) sam trzyma `query` i sam tworzy hook wyszukiwania. Nie da się z zewnątrz ustawić nazwy w polu. Używają go `RegistrySearch`, `KitAddForm` (`:298`) i `KitImportRow` (`:385`, po jednym dla każdego otwartego wiersza).
- **`KitAddForm`** (`:292-309`) przyjmuje tylko `version`, a wybrany lek trzyma w `useState<RegistryVariant | null>`. `<PackForm key={variant.id}>` resetuje pola przy zmianie leku.
- **`KitItemDetails`** (`src/components/kit/KitItemDetails.tsx:31-33`) wyświetla `substances` jako zwykły tekst.
  - Wynik sprawdzenia przekazuje do niego `item.substances` (`MedicineCheckResult.tsx:39`).
  - Lista apteczki ich nie przekazuje, bo `KIT_ITEM_SELECT` (`src/lib/services/kit.ts:175`) nie pobiera substancji, a `KitItem` (`src/types.ts:63-80`) nie ma takiego pola.
  - Tabela `registry_product_substances` ma politykę select dla `authenticated` (`supabase/migrations/20261001120000_registry_tables.sql:158`).
- **Wzorzec parametrów w URL-u** (`src/pages/apteczka.astro:23-48`): `.astro` sprawdza format parametru (cyfry), a wartość nieznaną albo błędną ignoruje.
- **Poziom dopasowania** (`useMatchLevel`, `localStorage`) jest celowo poza URL-em (precedens S-06).

## Desired End State

- **Klik substancji:**
  - Na `/szukaj` (karta leku albo wynik sprawdzenia) robi `pushState` na `/szukaj?substancja=<nazwa>`, bez przeładowania strony.
  - Na `/apteczka` (lista) to zwykły link do tego samego adresu.
  - Ctrl/⌘/Shift/środkowy klik zachowują się jak przy zwykłym linku.
- **`/szukaj?substancja=X`** pokazuje:
  - nagłówek z nazwą substancji i liczbą leków;
  - 20 pierwszych wariantów: najpierw jednoskładnikowe, potem złożone;
  - przycisk „Pokaż więcej”, który dokłada po 20;
  - komunikat, gdy żaden lek tej substancji nie zawiera.
- **Wybór leku** (z listy substancji albo z podpowiedzi) robi `pushState` na `/szukaj?lek=<id>` i pokazuje kartę z wynikiem sprawdzenia. „Wstecz” przywraca poprzedni stan: listę substancji z tą samą liczbą pokazanych pozycji albo poprzedni lek.
- **Bezpośrednie wejście** na `/szukaj?lek=<id>` lub `/szukaj?substancja=X` (np. odświeżenie) odtwarza ten sam stan po wczytaniu listy.
- **„Dodaj do apteczki”** na karcie leku to link do `/apteczka?lek=<id>#add-heading`:
  - formularz dodawania ma ten lek wybrany i od razu pokazuje opakowania;
  - nieznane id jest ignorowane i formularz zostaje pusty;
  - po dodaniu przekierowanie na `?dodano` usuwa `lek` z adresu i formularz wraca do stanu pustego.
- **Lista apteczki** pokazuje substancje każdej pozycji jako linki.
- **Jeden Worker na stronę:** na `/szukaj` (także w trybie substancji) i na `/apteczka?lek` powstaje dokładnie jeden Worker.

### Key Discoveries:

- `registry-search.ts:212-216`: aktywne warianty sortują się przed wycofanymi w obrębie poziomu. Filtr substancji przejmuje tę semantykę z dwoma poziomami (jednoskładnikowe, złożone).
- `registry-search.ts:57` `sameName`: równość list słów po normalizacji. Wzorzec do porównania całej nazwy substancji, a nie prefiksu słowa.
- `useRegistryMatch.ts:43-56`: wzorzec „wyślij po `ready`, podbij id przy każdej zmianie wejścia, odrzuć odpowiedź do starego id”, do powtórzenia w nowych hookach.
- `tests/helpers/fake-search-worker.ts`: fałszywy Worker z prawdziwymi `buildSearchIndex`/`searchVariants`/`matchRow`, z kolejką odpowiedzi i `FakeSearchWorker.last`. Rozszerzamy go o nowe wiadomości.
- `KitImportRow.tsx:385` tworzy `MedicineSuggest` warunkowo (jeden Worker na otwarty wiersz). Tego zachowania nie zmieniamy.

## What We're NOT Doing

- Powrót na głęboki link po zalogowaniu (`/szukaj?substancja=…` dla wylogowanego kończy się na `/szukaj` bez parametrów; `signin.ts:23`). Decyzja z wywiadu.
- Zmiana poziomu dopasowania przy kliknięciu substancji: sprawdzenie liczy się z zapisanym poziomem, a poziom nadal nie trafia do URL-a.
- Zmiana reguły `medicine_check`, migracje bazy, zmiana listy wyszukiwania (`registry_search_list`) i jej formatu.
- Linki z nazwy leku (lek → `/szukaj?lek`) na liście apteczki i w wyniku sprawdzenia. Klikalne są tylko substancje.
- Formularz dodawania na `/szukaj`. Dodawanie zostaje na `/apteczka` (decyzja autora w roadmapie).
- Wspólny Worker dla wierszy importu CSV (`KitImportRow`). Zostaje jak dziś.
- Tłumaczenie łacińskich nazw substancji. Link pokazuje nazwę tak, jak podaje ją rejestr.
- Zmiana limitu 20 zwykłych podpowiedzi.

## Implementation Approach

1. **Faza 1, worker i dane.** Zaczynamy od czystej logiki, którą da się przetestować bez UI: filtr substancji i lookup w `registry-search.ts`, dwie nowe wiadomości workera. W tej samej fazie zmieniamy hook listy na **jeden wspólny uchwyt** (`RegistryListHandle`) z subskrypcją odpowiedzi. Bez tego każda nowa funkcja na `/szukaj` i `/apteczka` tworzyłaby drugi Worker, czyli podwójny `JSON.parse` 2 MB i podwójną budowę indeksu, a zapas na wolnym profilu to ok. 350 ms.
2. **Faza 2, `/szukaj`.** Przejście na stan w URL-u (parser wspólny dla `.astro` i klienta), tryb substancji, linki substancji z przechwytywaniem kliknięć i przycisk dodawania.
3. **Fazy 3 i 4** po fazie 2, równolegle, bo dotykają rozłącznych plików:
   - faza 3: `KitAddForm.tsx`, `apteczka.astro`, `KitAddForm.test.tsx`;
   - faza 4: `kit.ts`, `types.ts` (`KitItem`), `KitList.tsx`, `KitList.test.tsx`, `KitItemEdit.test.tsx`, `kit-import.test.ts`, testy API.

   Faza 3 nie zmienia `types.ts`. Faza 4 nie zmienia `apteczka.astro`. Bramki, staging i commity zawsze po kolei.

4. **Faza 5, dokumentacja.**

## Critical Implementation Details

- **Kolizje id żądań:** dwa hooki na jednym Workerze z osobnymi licznikami wysłałyby oba id 1. Id żądań pochodzi więc z jednego licznika na poziomie modułu (`nextRegistryRequestId()`). Każdy rodzaj żądania ma też własny typ odpowiedzi (`substanceResults`, `lookupResult`) i nie używa ponownie `results`.
- **Przechwytywanie kliknięć:** `KitItemDetails` nie wie, na jakiej jest stronie, i renderuje zwykłe `<a href="/szukaj?substancja=…">` z atrybutem `data-substance-link`. `RegistrySearch` przechwytuje kliknięcia jednym delegowanym listenerem na swoim korzeniu. Przechwytuje tylko, gdy `event.button === 0`, nie jest wciśnięty żaden z klawiszy `ctrlKey`/`metaKey`/`shiftKey`/`altKey` i `!event.defaultPrevented`. Wtedy robi `preventDefault` i `pushState`, inaczej przeglądarka obsługuje link sama.
- **Historia:**
  - Każdy wybór leku i każdy klik substancji robi `pushState`.
  - Edycja pola (`onEdit`, które dziś zrzuca wybór) robi `replaceState` na `/szukaj` bez parametrów, żeby odświeżenie nie przywróciło porzuconego leku.
  - Liczba pozycji listy substancji żyje w `history.state.shown`. Klik substancji robi `pushState` z `{ shown: 20 }`, a „Pokaż więcej” robi `replaceState` z nową wartością, żeby „Wstecz” i odświeżenie przywróciły tyle samo pozycji. Brak `history.state` (np. wejście z linku) daje 20.
  - Gdy w URL-u są oba parametry, wygrywa `lek`.
- **Hydratacja:** stan startowy pochodzi z `Astro.url` w `.astro` i jest przekazany jako propsy. Klient nie czyta `location` przy pierwszym renderze, tylko w `popstate`. Parser parametrów jest jedną czystą funkcją, której używają oba miejsca.
- **Wydajność:** klucze substancji (znormalizowana cała nazwa) i mapa `id → wpis` są liczone leniwie przy pierwszym żądaniu `substance`/`lookup` i zapamiętane w indeksie, nie w `buildSearchIndex`. Dzięki temu `buildMs`, czyli czas do gotowej listy, się nie zmienia.

## Phase 1: Filtr substancji, lookup po id i wspólny worker

### Overview

Logika filtra i lookupu, nowe wiadomości workera oraz jeden współdzielony uchwyt Workera dla wszystkich hooków listy. Ekrany wyglądają i działają jak dziś.

### Changes Required:

#### 1. Filtr substancji i lookup

**File**: `src/lib/registry-search.ts`

**Intent**: dodać funkcję zwracającą warianty, których lista substancji zawiera daną substancję, i funkcję znajdującą wariant po id.

**Contract**:

- `variantsWithSubstance(index, substance, limit): RegistrySearchResult`:
  - Dopasowanie: któraś substancja wariantu ma tę samą listę słów po normalizacji co `substance` (semantyka `sameName`, cała nazwa, nie prefiks; „Paracetamolum” nie trafia w „Paracetamolum + Coffeinum” jako jedną nazwę, ale trafia w wariant z substancjami `["Paracetamolum", "Coffeinum"]`).
  - Kolejność: najpierw warianty z dokładnie jedną substancją, potem złożone, a w obrębie grupy kolejność indeksu (aktywne przed wycofanymi, potem jak dziś). Wycofany jednoskładnikowy stoi więc przed aktywnym złożonym.
  - `total` liczy wszystkie trafienia, a `results` to pierwsze `limit`.
  - Substancja bez słów (np. „-”) daje pusty wynik.
- `findVariant(index, id): RegistryVariant | null`: tylko id z listy (reprezentant wariantu); inne id → `null`.
- Klucze substancji i mapa id → wpis są liczone leniwie i zapamiętane (pole opcjonalne w `RegistrySearchIndex`), a nie w `buildSearchIndex`.

#### 2. Protokół i worker

**File**: `src/types.ts`, `src/lib/registry-search.worker.ts`

**Intent**: dwie nowe pary wiadomości w istniejącym protokole.

**Contract**:

- Żądania:
  - `{ type: "substance"; id: number; substance: string; limit: number }`
  - `{ type: "lookup"; id: number; variantId: number }`
- Odpowiedzi:
  - `{ type: "substanceResults"; id: number; substance: string; results: RegistryVariant[]; total: number }`
  - `{ type: "lookupResult"; id: number; variant: RegistryVariant | null }`
- Przed zbudowaniem indeksu worker ignoruje te żądania, tak jak dziś `search`. Wyjątek w filtrze daje pusty wynik, jak w `search`.

#### 3. Wspólny uchwyt listy

**File**: `src/components/hooks/useRegistryListWorker.ts`

**Intent**: zastąpić jeden callback `onAnswer` subskrypcją, żeby kilka hooków mogło korzystać z jednego Workera.

**Contract**:

```ts
export type RegistryWorkerAnswer = Extract<
  RegistrySearchWorkerResponse,
  { type: "results" | "matches" | "substanceResults" | "lookupResult" }
>;
export interface RegistryListHandle {
  status: RegistryListStatus;
  /** Names the current load (version + attempt). */
  key: string;
  retry: () => void;
  /** Sends a request to the current worker; a no-op unless status is "ready". */
  post: (request: RegistrySearchWorkerRequest) => void;
  /** Every answer of the current load goes to every listener; returns the unsubscribe function. */
  subscribe: (listener: (message: RegistryWorkerAnswer, key: string) => void) => () => void;
}
export function useRegistryListWorker(version: number): RegistryListHandle;
/** Module-wide request id, so consumers sharing one worker never collide. */
export function nextRegistryRequestId(): number;
```

- Obiekt uchwytu jest stabilny między renderami, dopóki nie zmieni się `status` ani `key`, żeby efekty konsumentów nie zapętlały się.
- `performance.mark("mamlek:search-list-ready")` zostaje bez zmian.

#### 4. Konsumenci uchwytu

**File**: `src/components/hooks/useRegistrySearch.ts`, `src/components/hooks/useRegistryMatch.ts`, nowe `src/components/hooks/useRegistryLookup.ts`, `src/components/hooks/useSubstanceVariants.ts`

**Intent**: istniejące hooki przyjmują uchwyt zamiast `version`. Nowe hooki obsługują lookup i filtr według wzorca z `useRegistryMatch.ts:43-56`.

**Contract**:

- `useRegistrySearch(list, query)` i `useRegistryMatch(list, rows)` zwracają to samo co dziś.
- `useRegistryLookup(list, variantId: number | null)` → `{ status: "idle" | "loading" | "found" | "missing" | "error" | "unauthorized"; variant: RegistryVariant | null }`.
- `useSubstanceVariants(list, substance: string | null, limit: number)` → `{ status, results, total, retry }`. Zmiana `limit` wysyła żądanie ponownie, a do czasu odpowiedzi zostają poprzednie wyniki, żeby lista nie migała przy „Pokaż więcej”.
- Odpowiedź do starego id albo innego `key` jest odrzucana.
- `KitImport.tsx:527` tworzy uchwyt (`useRegistryListWorker(version)`) i przekazuje go do `useRegistryMatch`.

#### 5. `MedicineSuggest` z uchwytem

**File**: `src/components/registry/MedicineSuggest.tsx`, `src/components/kit/KitImportRow.tsx`, `src/components/registry/RegistrySearch.tsx`, `src/components/kit/KitAddForm.tsx`

**Intent**: `MedicineSuggest` dostaje uchwyt od rodzica. Wiersz importu zachowuje własny Worker przez cienki wrapper.

**Contract**:

- Propsy `MedicineSuggest`: `list: RegistryListHandle` (wymagany) zamiast `version`.
- `StandaloneMedicineSuggest({ version, ...rest })` w tym samym pliku tworzy uchwyt i renderuje `MedicineSuggest`. `KitImportRow.tsx:385` używa wrappera; to zmiana jednej linii.
- `RegistrySearch` i `KitAddForm` tworzą uchwyt raz i przekazują go dalej.

#### 6. Fałszywy Worker i testy

**File**: `tests/helpers/fake-search-worker.ts`, `src/lib/registry-search.test.ts`, `src/components/hooks/useRegistryMatch.test.tsx`

**Intent**: fałszywy Worker obsługuje nowe wiadomości prawdziwymi funkcjami i liczy utworzone instancje.

**Contract**:

- `FakeSearchWorker` odpowiada na `substance`/`lookup` przez `variantsWithSubstance`/`findVariant`, z kolejką i `autoDeliver` jak dziś.
- Statyczny licznik instancji (`FakeSearchWorker.created`) jest zerowany w `stubSearchWorker`.
- Testy unit filtra:
  - całe nazwy zamiast prefiksów;
  - normalizacja (wielkość liter, diakrytyki, ł);
  - kolejność: jednoskładnikowe przed złożonymi, aktywne przed wycofanymi w grupie, wycofany jednoskładnikowy przed aktywnym złożonym;
  - `total` przy obcięciu do `limit`;
  - substancja bez słów daje pusty wynik.
- Testy unit lookupu: id reprezentanta, nieznane id daje `null`, wariant wycofany zwraca `withdrawn: true`.
- `useRegistryMatch.test.tsx` (`:71,87,122,147`): callback `renderHook` tworzy uchwyt przez `useRegistryListWorker(version)` i przekazuje go do `useRegistryMatch`. Asercje oraz użycie `Worker.last`/`deliverMatch` zostają bez zmian.

### Success Criteria:

#### Automated Verification:

- Testy unit filtra i lookupu przechodzą: `npx vitest run src/lib/registry-search.test.ts`
- Istniejące testy component (`RegistrySearch`, `KitAddForm`, `KitImport`, `MedicineCheckResult`, `useRegistryMatch`) przechodzą bez zmian asercji: `npx vitest run --project component`
- Lint, typy i `ui:scan`: `npm run lint`, `npx astro check`, `npm run ui:scan`
- `npm run search:check` nie zgłasza różnic: `searchVariants` się nie zmienia (wymaga pełnego rejestru lokalnie; bez niego krok jest pomijany z adnotacją)

#### Manual Verification:

- `/szukaj` i `/apteczka` działają jak przed zmianą: podpowiedzi, wybór, sprawdzenie, dodanie leku. W DevTools → Sources/Threads widać jeden Worker na stronę (`http://localhost:4321/szukaj`, `http://localhost:4321/apteczka`). Użytkownik decyduje, czy ten test wykonuje sam, czy oddaje agentowi.

**Implementation Note**: po zielonych bramkach automatycznych zatrzymaj się na potwierdzenie testów ręcznych przez użytkownika. Checkboxy są w sekcji `## Progress`.

---

## Phase 2: `/szukaj` — stan w URL-u, lista substancji, linki i przycisk dodawania

### Overview

Ekran wyszukiwania pamięta stan w adresie, pokazuje leki z wybraną substancją, a substancje na karcie i w wyniku sprawdzenia są linkami. Na karcie leku jest przycisk „Dodaj do apteczki”.

### Changes Required:

#### 1. Parser i budowa adresu

**File**: nowy `src/lib/search-url.ts` (+ `src/lib/search-url.test.ts`)

**Intent**: jedna czysta funkcja odczytu parametrów dla `.astro` i dla `popstate` oraz funkcje budujące adresy.

**Contract**:

- `parseSearchState(params: URLSearchParams): { variantId: number | null; substance: string | null }`:
  - `lek` to tylko same cyfry, w zakresie bezpiecznej liczby całkowitej;
  - `substancja` jest przycinana, pusta daje `null`, a dłuższa niż 200 znaków też daje `null`;
  - gdy podane są oba parametry, wygrywa `lek` i `substance` jest `null`.
- `substanceHref(substance): string` → `/szukaj?substancja=<encodeURIComponent>`.
- `variantHref(id)` → `/szukaj?lek=<id>`.
- `addToKitHref(id)` → `/apteczka?lek=<id>#add-heading`.
- Testy unit: błędne `lek` („12a”, „-1”, „”, bardzo długie), kodowanie polskich znaków i `+` w nazwie, przycięcie, pierwszeństwo `lek`.

#### 2. Link substancji

**File**: nowy `src/components/registry/SubstanceLink.tsx`, `src/components/kit/KitItemDetails.tsx`

**Intent**: substancje w opisie pozycji są linkami. Substancja bez słów (np. „-”) zostaje tekstem.

**Contract**:

- `SubstanceLink({ substance })` renderuje `<a href={substanceHref(substance)} data-substance-link={substance}>` w klasach `buttonVariants({ variant: "link" })` (z `cn`) albo zwykły tekst.
- `KitItemDetails` renderuje listę linków rozdzieloną przecinkami w tym samym miejscu co dziś (`:31-33`).
- Nowe pliki widoku trafiają do `GUARDED` w `scripts/ui-scan.mjs`.

#### 3. Karta leku

**File**: `src/components/registry/RegistrySearch.tsx`

**Intent**:

- Pozycje w sekcji „Substancje czynne” w `VariantCard` (`:27-48`) są linkami `SubstanceLink`.
- Pod kartą jest link „Dodaj do apteczki” do `addToKitHref(selected.id)`, w klasach `buttonVariants` (`min-h-11`). Pokazujemy go także dla leku wycofanego, bo formularz to dopuszcza.

**Contract**: id w linku to `selected.id` (reprezentant z listy), nie `searched.id`.

#### 4. Stan w URL-u i tryb substancji

**File**: `src/components/registry/RegistrySearch.tsx`, nowy `src/components/registry/SubstanceVariants.tsx`, `src/pages/szukaj.astro`

**Intent**: `szukaj.astro` odczytuje `parseSearchState(Astro.url.searchParams)` i przekazuje wynik jako propsy. `RegistrySearch` trzyma stan `{ variantId, substance, shown }` i synchronizuje go z historią.

**Contract**:

- Propsy: `RegistrySearch({ version, initialVariantId, initialSubstance })`.
- Wybór leku (z podpowiedzi albo z listy substancji):
  - `pushState` na `variantHref(id)`;
  - bieżący wariant znany z kliknięcia jest pamiętany w mapie id → `RegistryVariant`, więc „Wstecz” nie czeka na lookup;
  - dla id spoza mapy (start z URL-a, „Dalej”) używamy `useRegistryLookup`.
- Klik substancji: przechwycony delegowanym listenerem (zasady w Critical Implementation Details), potem `pushState` na `substanceHref` ze stanem `{ shown: 20 }`. Każdy klik substancji, także z listy innej substancji, zaczyna od 20 pozycji.
- „Pokaż więcej” dokłada 20 i robi `replaceState` z `{ shown }` na bieżącym wpisie, więc odświeżenie i „Wstecz” pokazują tę samą liczbę pozycji.
- `onEdit` z `MedicineSuggest` robi `replaceState` na `/szukaj` i czyści stan.
- `popstate` ustawia stan z `parseSearchState(new URLSearchParams(location.search))` i `history.state?.shown`.
- Lookup zwraca `missing` (nieznane id z URL-a): ekran pokazuje zwykłe wyszukiwanie bez komunikatu, a adres zostaje bez zmian.
- `SubstanceVariants({ substance, results, total, status, onPick, onMore })` pokazuje:
  - nagłówek „Leki z substancją: <nazwa>” i licznik „Pokazano X z Y”;
  - listę przycisków z nazwą, mocą i postacią oraz oznaczeniem wycofania jak w podpowiedziach;
  - „Pokaż więcej” (dokłada 20), gdy `X < Y`;
  - komunikat „Brak leków z substancją „<nazwa>” w rejestrze”, gdy `Y = 0`;
  - stany wczytywania listy, sesji wygasłej i błędu jak w `MedicineSuggest`.
- Tryb substancji zastępuje kartę leku i wynik sprawdzenia. Pole podpowiedzi zostaje nad listą i jego użycie wychodzi z trybu substancji.
- Ogłoszenie dla czytników ekranu (`role="status"`) podaje liczbę leków po wczytaniu listy substancji. Fokus po kliknięciu substancji przechodzi na nagłówek listy, a po wyborze leku na kartę.

#### 5. Nazwa w polu z zewnątrz

**File**: `src/components/registry/MedicineSuggest.tsx`

**Intent**: gdy lek jest wybrany spoza pola (URL, lista substancji, „Wstecz”), pole pokazuje jego nazwę bez otwierania listy podpowiedzi.

**Contract**:

- Opcjonalny prop `pickedName?: string | null`. Zmiana na wartość niepustą, inną niż poprzednia, ustawia `query` na tę nazwę z zamkniętą listą podpowiedzi i bez wywołania `onEdit`.
- `null` nie czyści pola.
- Zmiana z wpisanego tekstu działa jak dziś.

#### 6. Testy component

**File**: `src/components/registry/RegistrySearch.test.tsx`, `src/components/registry/MedicineCheckResult.test.tsx`

**Intent**: scenariusze ekranu na fałszywym Workerze i `stubRoutedFetch` (zastępowane tylko `fetch` i `Worker`).

**Contract**:

- Klik substancji na karcie:
  - adres to `/szukaj?substancja=…`;
  - lista ma 20 pozycji, najpierw jednoskładnikowe, z licznikiem;
  - „Pokaż więcej” dokłada 20.
- Klik w wyniku sprawdzenia działa tak samo.
- Ctrl-klik nie jest przechwytywany.
- Wybór z listy: adres `?lek=`, karta i wynik sprawdzenia. „Wstecz” (wywołany `popstate` po `history.back()` albo ręcznie) wraca do listy z tą samą liczbą pozycji.
- Start z `initialVariantId` po wczytaniu listy pokazuje kartę i nazwę w polu. Start z nieznanym id pokazuje puste wyszukiwanie.
- Start z `initialSubstance` bez trafień pokazuje komunikat „Brak leków…”.
- Edycja pola po wyborze robi `replaceState` na `/szukaj`.
- Przycisk „Dodaj do apteczki” ma `href` `/apteczka?lek=<id>#add-heading`.
- Na każdej ścieżce powstaje dokładnie jeden Worker (`FakeSearchWorker.created === 1`).
- `MedicineCheckResult.test.tsx`: substancje pozycji są linkami.

### Success Criteria:

#### Automated Verification:

- Testy unit parsera: `npx vitest run src/lib/search-url.test.ts`
- Testy component ekranu: `npx vitest run src/components/registry`
- Pełny zestaw CI: `npx vitest run --project unit --project component --project registry`
- Lint, typy i skan widoków: `npm run lint`, `npx astro check`, `npm run ui:scan`

#### Manual Verification:

- Na `http://localhost:4321/szukaj`:
  - wybór leku, klik substancji, wybór leku z listy, „Pokaż więcej”, dwa razy „Wstecz” i raz „Dalej” dają oczekiwane stany bez przeładowania;
  - odświeżenie na `?lek=` i na `?substancja=` odtwarza stan;
  - Ctrl-klik substancji otwiera nową kartę.
- Wygląd listy substancji i przycisku dodawania na szerokości 390 px i 1280 px (`npm run ui:shots -- --label s17`). Klawiatura (Tab/Enter) i czytnik ekranu: ogłoszenie liczby leków.
- `npm run perf` na wolnym profilu: czas do gotowej listy bez pogorszenia względem pomiaru przed zmianą, tym samym ustawieniem (`wrangler dev`).

Przy każdym z tych testów użytkownik decyduje, czy wykonuje go sam, czy oddaje agentowi.

**Implementation Note**: po zielonych bramkach automatycznych zatrzymaj się na potwierdzenie testów ręcznych przez użytkownika. Checkboxy są w sekcji `## Progress`.

---

## Phase 3: `/apteczka?lek=<id>` — lek wybrany w formularzu dodawania

_Wykonywalna równolegle z fazą 4 (po fazie 2): pliki rozłączne._

### Overview

Formularz dodawania na `/apteczka` przyjmuje lek z adresu i pokazuje go jako wybrany po wczytaniu listy.

### Changes Required:

#### 1. Odczyt parametru

**File**: `src/pages/apteczka.astro`

**Intent**: `?lek=<id>` (same cyfry) trafia do formularza jako prop. Wartość błędną ignorujemy, jak `?dodano` (`:41-48`).

**Contract**:

- `<KitAddForm version={list.version} initialVariantId={…} client:load />`.
- Do odczytu służy ta sama funkcja `parseSearchState` z fazy 2: z jej wyniku bierzemy tylko `variantId`.

#### 2. Preselekcja

**File**: `src/components/kit/KitAddForm.tsx`

**Intent**: formularz wyszukuje lek przez `useRegistryLookup` na tym samym uchwycie co `MedicineSuggest` i ustawia `variant`.

**Contract**:

- Prop `initialVariantId?: number | null`.
- Preselekcja działa raz: gdy użytkownik edytuje pole albo wybierze inny lek, nie wraca. Przy tej pierwszej zmianie `history.replaceState` usuwa `lek` z adresu i zostawia hash (`#add-heading`), żeby odświeżenie nie przywróciło porzuconego leku, tak jak na `/szukaj`.
- `missing` zostawia formularz pusty, bez komunikatu.
- `MedicineSuggest` dostaje `pickedName` wybranego leku.
- `PackForm` montuje się jak dziś (`key={variant.id}`).
- Po udanym dodaniu przejście na `?dodano` (`:115`) celowo usuwa `lek` z adresu.

#### 3. Testy component

**File**: `src/components/kit/KitAddForm.test.tsx`

**Intent**: scenariusze preselekcji.

**Contract**:

- Z `initialVariantId` po wczytaniu listy pole pokazuje nazwę, a formularz opakowań się ładuje (zapytanie o `registry/packages` z tym id).
- Lek wycofany pokazuje notkę o wycofaniu.
- Nieznane id daje pusty formularz.
- Edycja pola zrzuca wybór, preselekcja nie wraca, a `location.search` nie ma już `lek`.
- Powstaje jeden Worker.

### Success Criteria:

#### Automated Verification:

- Testy formularza: `npx vitest run src/components/kit/KitAddForm.test.tsx`
- Pełny zestaw CI: `npx vitest run --project unit --project component --project registry`
- Lint, typy i skan widoków: `npm run lint`, `npx astro check`, `npm run ui:scan`
- Kontrakt API bez zmian: `npm run test:api` (strona `/apteczka` jest na liście plików, po których zmianie trzeba go uruchomić)

#### Manual Verification:

- Z karty leku na `http://localhost:4321/szukaj` kliknąć „Dodaj do apteczki”: strona `/apteczka` przewija do „Dodaj lek”, lek jest wybrany, opakowania się wczytują. Dodanie kończy się komunikatem „Dodano: …”, a formularz jest pusty.
- `http://localhost:4321/apteczka?lek=999999999` i `http://localhost:4321/apteczka?lek=abc` dają pusty formularz bez błędu.

Przy każdym z tych testów użytkownik decyduje, czy wykonuje go sam, czy oddaje agentowi.

**Implementation Note**: po zielonych bramkach automatycznych zatrzymaj się na potwierdzenie testów ręcznych przez użytkownika. Checkboxy są w sekcji `## Progress`.

---

## Phase 4: Substancje na liście apteczki

_Wykonywalna równolegle z fazą 3 (po fazie 2): pliki rozłączne._

### Overview

Każda pozycja apteczki niesie swoje substancje czynne. Lista pokazuje je jako linki przez `KitItemDetails` z fazy 2.

### Changes Required:

#### 1. Odczyt substancji

**File**: `src/lib/services/kit.ts`, `src/types.ts`

**Intent**: wspólny select pozycji (lista, pojedynczy odczyt, `PATCH`) pobiera substancje produktu, a mapper zwraca je w kolejności rejestru.

**Contract**:

- `KIT_ITEM_SELECT` dokłada w `registry_products` zagnieżdżone `registry_product_substances(name, position)`.
- `KitItemRow` dostaje odpowiadające pole.
- `KitItem.substances: string[]` (może być puste) jest sortowane po `position` w `toKitItem`, bez polegania na kolejności z PostgREST.
- Odpowiedź `PATCH` (`UpdateKitItemResponse`) zawiera nowe pole.

#### 2. Lista

**File**: `src/components/kit/KitList.tsx`

**Intent**: wiersz listy przekazuje `substances={item.substances}` do `KitItemDetails` (`:218-232`).

**Contract**: ten sam render co w wyniku sprawdzenia (linki z fazy 2), działający na `/apteczka` jak zwykły link.

#### 3. Testy

**File**: `src/components/kit/KitList.test.tsx`, `src/components/kit/KitItemEdit.test.tsx`, `src/lib/kit-import.test.ts`, `tests/api/kit-input.test.ts`

**Intent**: fabryki `kitItem()` (w `KitList.test.tsx`, `KitItemEdit.test.tsx` i `src/lib/kit-import.test.ts:370`, gdzie dostają `substances: []`) dostają `substances`, a testy sprawdzają linki i kształt odpowiedzi.

**Contract**:

- `KitList.test.tsx`: substancje pozycji to linki z `href` `/szukaj?substancja=…`, a pozycja bez substancji nie ma pustego akapitu.
- Spójność nazw (świadome ograniczenie): lista wyszukiwania i apteczka czytają tę samą kolumnę `registry_product_substances.name`, ale nie zawsze ten sam produkt. Lista bierze substancje reprezentanta wariantu (`20261117120000_variant_key_btrim.sql:91-107`), a apteczka i wynik sprawdzenia substancje produktu opakowania (`pack.product_id`). Pomiar na pełnym lokalnym rejestrze (2026-11-19; 20 354 produkty, 71 643 opakowania): 20% produktów nie jest reprezentantem swojego wariantu, ale tylko 1 158 opakowań (1,6%) ma przynajmniej jedną substancję, której nie ma reprezentant (718 z 4 658 klików takich produktów); 670 z 718 to import równoległy (IR). Rozjazd to inny zapis w rejestrze (np. `borax` / `sodu czteroboran`, `camphora racemica` / `camphorum`), a nie inna końcówka: obcięcie 3 końcowych liter nie zmienia wyniku (718 → 718), a luźniejsze dopasowanie po prefiksie słowa łączyłoby np. wszystkie `acidum …`, więc zostajemy przy całej nazwie. Skutek w rzadkim przypadku: lista bez tego leku albo „Brak leków…”, a lek nadal da się znaleźć po nazwie. Ręczna kontrola 4.6 dotyczy pozycji, której produkt jest reprezentantem wariantu (zwykły produkt, nie IR). Czytanie substancji reprezentanta (migracja) odłożone jako ewentualny osobny wycinek.
- `tests/api/kit-input.test.ts`: udany `PATCH` zwraca `item.substances` jako tablicę nazw w kolejności rejestru, ułożoną ręcznie z danych fixture.

### Success Criteria:

#### Automated Verification:

- Testy listy i edycji: `npx vitest run src/components/kit/KitList.test.tsx src/components/kit/KitItemEdit.test.tsx`
- Pełny zestaw CI: `npx vitest run --project unit --project component --project registry`
- Testy API na lokalnym serwerze z lokalnym Supabase i zaimportowanymi fixture: `npm run test:api` (wymaga Dockera)
- Izolacja apteczki bez zmian: `npm run test:db`
- Lint, typy i skan widoków: `npm run lint`, `npx astro check`, `npm run ui:scan`

#### Manual Verification:

- Na `http://localhost:4321/apteczka` każda pozycja pokazuje substancje. Klik substancji otwiera `/szukaj` z listą leków tej substancji, a edycja ilości i opakowania nie gubi substancji w wierszu.

Przy tym teście użytkownik decyduje, czy wykonuje go sam, czy oddaje agentowi.

**Implementation Note**: po zielonych bramkach automatycznych zatrzymaj się na potwierdzenie testów ręcznych przez użytkownika. Checkboxy są w sekcji `## Progress`.

---

## Phase 5: Dokumentacja

### Overview

Opisy testów i reguł w dokumentach projektu odpowiadają nowemu zachowaniu.

### Changes Required:

#### 1. AGENTS.md

**File**: `AGENTS.md`

**Intent**: opis `npm test` w „Command tripwires” wymienia nowe pokrycie.

- unit: `src/lib/search-url.test.ts` i filtr substancji;
- component: scenariusze URL-a i historii w `RegistrySearch.test.tsx`, preselekcja w `KitAddForm.test.tsx`, linki substancji w `KitList.test.tsx`;
- jeden Worker na stronę;
- opis `test:api`: substancje w odpowiedzi `PATCH`.

**Contract**: tylko sekcja „Command tripwires” i, w razie potrzeby, „Auth flow” (pozostaje bez zmian, bo powrót po logowaniu jest poza zakresem). Tekst po angielsku.

#### 2. PRD

**File**: `context/foundation/prd.md`

**Intent**: dopisek „Doprecyzowanie (substance-medicine-links, 2026-11-19)” pod FR-002 (filtr „zawiera tę substancję” z linków substancji, 20 pozycji z „Pokaż więcej”) i pod FR-003 (dodanie z karty leku przez `/apteczka?lek=`), w stylu dopisku pod FR-011.

**Contract**: dopiski pod istniejącymi wymaganiami, bez zmiany ich numeracji i priorytetów. Tekst po polsku.

### Success Criteria:

#### Automated Verification:

- Formatowanie dokumentów: `npx prettier --check AGENTS.md context/foundation/prd.md`

#### Manual Verification:

- Przegląd dopisków w PRD i AGENTS.md przez użytkownika.

---

## Testing Strategy

### Unit Tests:

- `variantsWithSubstance`:
  - cała nazwa po normalizacji;
  - kolejność grup i wycofanych;
  - `total` przy limicie;
  - pusta substancja.
- `findVariant`: znane, nieznane i wycofane id.
- `parseSearchState` i funkcje budujące adresy: błędne wartości, kodowanie, pierwszeństwo `lek`.

### Integration Tests:

- Component, na fałszywym Workerze z prawdziwą logiką: ekran `/szukaj` (historia, tryb substancji, linki, przycisk, jeden Worker), formularz dodawania (preselekcja), lista apteczki (linki).
- Regresje: `KitImport` (wrapper `StandaloneMedicineSuggest`) i `MedicineCheckResult`.
- `test:api`: kształt odpowiedzi `PATCH` z substancjami. `test:db` bez zmian (brak migracji).

### Manual Testing Steps:

1. `http://localhost:4321/szukaj`: wpisać „ibu 400”, wybrać lek, kliknąć „Ibuprofenum” na karcie. Lista leków z licznikiem, „Pokaż więcej” dokłada 20.
2. Wybrać lek z listy, potem „Wstecz”. Wraca lista z tą samą liczbą pozycji. Drugie „Wstecz” wraca do pierwszego leku.
3. „Dodaj do apteczki”: `/apteczka` z wybranym lekiem, dodanie, komunikat „Dodano”.
4. Na liście apteczki kliknąć substancję. `/szukaj` z listą leków tej substancji.
5. W wyniku sprawdzenia kliknąć substancję pozycji z apteczki. Lista bez przeładowania.

## Performance Considerations

- **Jeden Worker na stronę** to warunek konieczny, sprawdzany testem component (`FakeSearchWorker.created === 1`).
- **Leniwe klucze** substancji i mapa id nie zmieniają czasu `buildSearchIndex`. Pierwszy filtr kosztuje jedno przejście po ok. 16 tys. wpisów w Workerze, poza wątkiem UI.
- **„Pokaż więcej”** wysyła ponownie żądanie z większym `limit`. Przy ok. 16 tys. wpisów to jedno przejście w Workerze, bez zmian w wątku UI poza dorenderowaniem 20 wierszy.
- **Pomiar przed i po** (`npm run perf`, wolny profil) jest w kryteriach ręcznych fazy 2.

## Migration Notes

Brak migracji bazy i zmian formatu listy. Odpowiedź `GET`/`PATCH` pozycji apteczki dostaje nowe pole (`substances`), co jest zmianą rozszerzającą. Klient i serwer wdrażają się razem (Cloudflare), więc nie trzeba wspierać starego kształtu.

## References

- Research: `context/changes/substance-medicine-links/research.md`
- Roadmapa: `context/foundation/roadmap.md` (S-17)
- Wzorzec hooka z wysyłką po `ready`: `src/components/hooks/useRegistryMatch.ts:43-56`
- Wzorzec parametru w URL-u: `src/pages/apteczka.astro:41-48`
- Kolejność poziomów: `src/lib/registry-search.ts:212-216`, `:288-323`
- Opis pozycji: `src/components/kit/KitItemDetails.tsx:23-49`
- Select pozycji apteczki: `src/lib/services/kit.ts:174-196`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Filtr substancji, lookup po id i wspólny worker

#### Automated

- [x] 1.1 Testy unit filtra i lookupu przechodzą: `npx vitest run src/lib/registry-search.test.ts`
- [x] 1.2 Istniejące testy component (`RegistrySearch`, `KitAddForm`, `KitImport`, `MedicineCheckResult`, `useRegistryMatch`) przechodzą bez zmian asercji: `npx vitest run --project component`
- [x] 1.3 Lint, typy i `ui:scan`: `npm run lint`, `npx astro check`, `npm run ui:scan`
- [x] 1.4 `npm run search:check` nie zgłasza różnic: `searchVariants` się nie zmienia (bez pełnego rejestru lokalnie pominięty z adnotacją, to nie porażka) (skipped: no DATABASE_URL/full registry locally)

#### Manual

- [x] 1.5 `/szukaj` i `/apteczka` działają jak przed zmianą, z jednym Workerem na stronę

### Phase 2: `/szukaj` — stan w URL-u, lista substancji, linki i przycisk dodawania

#### Automated

- [ ] 2.1 Testy unit parsera: `npx vitest run src/lib/search-url.test.ts`
- [ ] 2.2 Testy component ekranu: `npx vitest run src/components/registry`
- [ ] 2.3 Pełny zestaw CI: `npx vitest run --project unit --project component --project registry`
- [ ] 2.4 Lint, typy i skan widoków: `npm run lint`, `npx astro check`, `npm run ui:scan`

#### Manual

- [ ] 2.5 Nawigacja na `/szukaj` (substancja, lista, „Pokaż więcej”, „Wstecz”/„Dalej”, odświeżenie, Ctrl-klik)
- [ ] 2.6 Wygląd na 390 i 1280 px (`ui:shots`), klawiatura i czytnik ekranu
- [ ] 2.7 `npm run perf` na wolnym profilu bez pogorszenia czasu do gotowej listy

### Phase 3: `/apteczka?lek=<id>` — lek wybrany w formularzu dodawania

#### Automated

- [ ] 3.1 Testy formularza: `npx vitest run src/components/kit/KitAddForm.test.tsx`
- [ ] 3.2 Pełny zestaw CI: `npx vitest run --project unit --project component --project registry`
- [ ] 3.3 Lint, typy i skan widoków: `npm run lint`, `npx astro check`, `npm run ui:scan`
- [ ] 3.4 Kontrakt API bez zmian: `npm run test:api`

#### Manual

- [ ] 3.5 „Dodaj do apteczki” z karty leku prowadzi do formularza z wybranym lekiem; dodanie czyści formularz
- [ ] 3.6 Nieznane i błędne `?lek` dają pusty formularz bez błędu

### Phase 4: Substancje na liście apteczki

#### Automated

- [ ] 4.1 Testy listy i edycji: `npx vitest run src/components/kit/KitList.test.tsx src/components/kit/KitItemEdit.test.tsx`
- [ ] 4.2 Pełny zestaw CI: `npx vitest run --project unit --project component --project registry`
- [ ] 4.3 Testy API: `npm run test:api`
- [ ] 4.4 Izolacja apteczki bez zmian: `npm run test:db`
- [ ] 4.5 Lint, typy i skan widoków: `npm run lint`, `npx astro check`, `npm run ui:scan`

#### Manual

- [ ] 4.6 Substancje na liście apteczki są linkami do `/szukaj` (dla pozycji z produktem-reprezentantem lista zawiera jej wariant) i nie znikają po edycji

### Phase 5: Dokumentacja

#### Automated

- [ ] 5.1 Formatowanie dokumentów: `npx prettier --check AGENTS.md context/foundation/prd.md`

#### Manual

- [ ] 5.2 Przegląd dopisków w PRD i AGENTS.md przez użytkownika
