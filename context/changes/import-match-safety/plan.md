# Import match safety Implementation Plan

## Overview

Zaostrzamy automatyczne przypisanie leku w imporcie CSV i zamykamy lukę w trybie edycji wiersza (audyt `context/audits/prd-conformance/2026-11-16.md`, F1, F2, F3). Po zmianie wiersz dostaje lek bez kliknięcia tylko wtedy, gdy ma nazwę, moc i postać, najdokładniejsze zapytanie daje dokładnie jedno trafienie, a nazwa tego wariantu jest taka sama jak nazwa z wiersza. W każdym innym przypadku użytkownik wybiera lek z propozycji. Wiersz z otwartym wyszukiwaniem („Zmień”) blokuje zapis strony, dopóki użytkownik nie wybierze nowego leku albo nie kliknie „Anuluj”, i przez cały czas pokazuje, co jest przypisane.

## Current State Analysis

- `rowQueries` (`src/lib/kit-import.ts:75-89`) pomija puste części, więc dla wiersza bez mocy i postaci pierwszym zapytaniem jest sama nazwa. `matchRow` (`:95-110`) daje `auto` przy `i === 0 && total === 1`, bez względu na to, czy wiersz jest pełny (F1).
- `matchRow` nie porównuje nazwy trafienia z nazwą wiersza. `searchVariants` dopasowuje prefiksy słów na poziomach A–D (nazwa, dalsze słowa nazwy, nazwa powszechna, substancja), więc „jedyne trafienie” może mieć inną nazwę handlową. Pomiar na pełnym rejestrze: `Ibuprom; 400 mg; tabletki drażowane` daje dziś 1 trafienie „Ibuprom Max” i przypisuje się sam; 3 927 wierszy z nazwą skróconą o ostatnie słowo dostałoby lek o innej nazwie (np. `IPP; 20 mg` → IPP 20) (F2).
- Worker dostaje same zapytania: `RegistrySearchWorkerRequest` `{ type: "match"; rows: string[][] }` (`src/types.ts:155-158`), `registry-search.worker.ts` woła `matchRow(built, queries)`. `matchRow` nie wie więc, czy wiersz był pełny ani jaka była jego nazwa.
- Napis pod lekiem przypisanym automatycznie: „Przypisano automatycznie — jedyny pasujący lek w rejestrze” (`src/components/kit/KitImportRow.tsx:379`).
- Tryb edycji (`RowVariant`, `KitImportRow.tsx:357-366`) pokazuje tylko `MedicineSuggest` i „Anuluj”, a `onEdit` to pusta funkcja (`:71-73`). Wybór opakowania i reszta wiersza są ukryte (`row.variant && !editing`). `blocked` w `ImportReview` (`src/components/kit/KitImport.tsx:293-294`) liczy tylko `rowIssues`, które nie znają trybu edycji. Użytkownik może więc kliknąć „Zmień”, wpisać inną nazwę, nie wybrać podpowiedzi i zapisać stronę z poprzednim lekiem, którego nie widać (F3, ta sama klasa błędu co S-10).
- Testy przypinają luźniejszą regułę: `src/lib/kit-import.test.ts:122-123` („assigns on its own for a name alone that is unique”) i nagłówek pliku (`:24-35`). W `src/components/kit/KitImport.test.tsx` wiersze `Rutinoscorbin;;;;` i `Altacet;;żel;;` przypisują się same na fixture'ach, a testy zapisu (`:298-335`, `:337-352`) od razu wybierają opakowanie.

## Desired End State

- Wiersz bez mocy albo bez postaci nigdy nie dostaje leku bez kliknięcia: widzi propozycje (albo „Brak dopasowania”).
- Wiersz pełny dostaje lek automatycznie tylko przy jednym trafieniu pierwszego zapytania i nazwie wariantu równej nazwie z wiersza po normalizacji wyszukiwarki („NO-SPA” = „No Spa” = „No-Spa”, ale „Nospa” ≠ „No-Spa”). Pod takim lekiem stoi „Przypisano automatycznie — jedyny lek w rejestrze o tej nazwie, mocy i postaci”.
- Wiersz w trybie edycji pokazuje „Obecnie: <lek>” nad polem szukania, ma w linii „Wymaga decyzji” powód „dokończ wybór leku albo anuluj” i blokuje zapis strony. „Anuluj” zdejmuje blokadę i przywraca widok wiersza.
- PRD FR-009 opisuje tę regułę.

Weryfikacja: testy jednostkowe `matchRow` i testy komponentu `KitImport` (nowe i zaktualizowane) przechodzą, a każdy z nich czerwienieje po celowym zepsuciu reguły.

### Key Discoveries:

- `normalizeText` jest eksportowane z `src/lib/registry-search.ts`, `wordsOf` (słowa `[a-z0-9]+` po normalizacji) jest prywatne. Porównanie nazw ma użyć tej samej normalizacji, bez zmiany `normalizeText` ani `wordsOf`, żeby wyniki wyszukiwarki się nie zmieniły.
- Odpowiedź workera na `match` przechodzi przez `useRegistryMatch` (`src/components/hooks/useRegistryMatch.ts`), który porównuje `rows` po tożsamości. `KitImport.tsx:522` liczy `parsed.map(rowQueries)` w `useMemo`; nowy kształt żądania musi zachować ten kontrakt.
- `tests/helpers/fake-search-worker.ts` (`rows: string[][]`, `matchRow(index, queries)`) i `src/components/hooks/useRegistryMatch.test.tsx` (`NO_SPA_ROW`, `UNKNOWN_ROW`, `IBUPROM_ROW` jako tablice zapytań) używają starego kształtu i muszą przejść na nowy razem z protokołem.
- `acceptDuplicates` (`kit-import.ts:170`) zdejmuje tylko powody `DuplicateIssue`, więc nowy powód trybu edycji nie zostanie przez „Dodaj mimo to” zdjęty.
- `tests/e2e/` nie testuje importu, nic tam nie zależy od automatycznego przypisania.

## What We're NOT Doing

- Nie sprawdzamy dokładnej zgodności mocy i postaci. Moc i postać nadal dopasowują się prefiksowo w zapytaniu: wiersz `X;400 mg;tabletki` może dostać automatycznie jedyny wariant „X 400 mg tabletki powlekane”. Decyzja autora obejmuje równość nazwy; test jednostkowy przypina to zachowanie.
- Nie zmieniamy `searchVariants`, `normalizeText` ani `wordsOf`. Wyszukiwarka na `/szukaj` działa tak samo, więc `npm run search:check` nie jest potrzebny.
- Nie zmieniamy zapytań zastępczych (nazwa + moc, sama nazwa) ani limitu 5 propozycji.
- Nie zmieniamy API (`POST /api/kit/import`) ani bazy, więc bez `test:db` i `test:api`.
- Nie robimy otwartego kroku ręcznego 4.5 z S-04 (import prawdziwego CSV). Zostaje po stronie autora.

## Implementation Approach

Faza 1 przenosi do `matchRow` informację, której dziś nie ma: czy wiersz jest pełny i jaka jest jego nazwa. Żądanie dopasowania jednego wiersza staje się obiektem `{ queries, exactName }` budowanym w czystym `kit-import.ts`. `exactName` jest ustawione tylko dla wiersza z nazwą, mocą i postacią. `matchRow` zwraca `auto` tylko przy `exactName`, jednym trafieniu pierwszego zapytania i równej nazwie. Najpierw czerwone testy jednostkowe, potem protokół i reguła.

Faza 2 dopisuje blokadę trybu edycji w `ImportReview`, który już trzyma stan `editing`. `rowIssues` zostaje bez stanu UI: `ImportReview` dokłada nowy powód do listy wiersza, który jest w edycji i ma przypisany lek. Najpierw czerwony test komponentu.

Fazy dzielą `KitImport.tsx`, `KitImportRow.tsx` i `KitImport.test.tsx`, więc idą po kolei, nie równolegle.

## Phase 1: Reguła automatycznego przypisania (F1 + F2)

### Overview

`auto` tylko dla pełnego wiersza z jednym trafieniem i równą nazwą; zawsze propozycje dla wiersza bez mocy albo postaci. Nowy napis pod lekiem przypisanym automatycznie. PRD FR-009 dostaje doprecyzowanie.

### Changes Required:

#### 1. Testy jednostkowe reguły (najpierw, czerwone)

**File**: `src/lib/kit-import.test.ts`

**Intent**: Zapisać nową regułę jako testy, które dziś nie przechodzą, zanim zmieni się kod. Wymaganie się zmieniło (decyzja F1/F2 w audycie), więc test „assigns on its own for a name alone that is unique” (`:122-123`) zmienia oczekiwanie na `choices`. Nie jest to dopasowywanie testu do kodu. Nagłówek pliku (`:24-35`) opisuje nową regułę.

**Contract**: Przypadki dla `matchRow` (i budowy żądania z `ParsedRow`):

- sama nazwa z jednym trafieniem → `choices` (Rutinoscorbin);
- nazwa + moc bez postaci, jedno trafienie → `choices`;
- pełny wiersz, jedno trafienie, nazwa wariantu inna niż nazwa wiersza (wiersz „Ibuprom” trafia tylko w „Ibuprom Max”) → `choices`;
- pełny wiersz, jedno trafienie, ta sama nazwa w innym zapisie (wielkość liter, myślnik zamiast spacji, polskie znaki) → `auto`;
- „Nospa” kontra „No-Spa” → `choices`;
- pełny wiersz z jednym trafieniem o tej samej nazwie i postaci dłuższej niż w wierszu („tabletki” → „tabletki powlekane”) → `auto` (przypina granicę opisaną w What We're NOT Doing);
- istniejące przypadki `choices`/`none` bez zmian.

#### 2. Porównanie nazw

**File**: `src/lib/registry-search.ts`

**Intent**: Udostępnić porównanie dwóch nazw z normalizacją wyszukiwarki, żeby import i wyszukiwarka rozumiały „tę samą nazwę” tak samo.

**Contract**: nowy eksport, np. `sameName(a: string, b: string): boolean` — równe listy słów `wordsOf(a)` i `wordsOf(b)`. `normalizeText` i `wordsOf` bez zmian.

#### 3. Żądanie dopasowania i reguła

**File**: `src/lib/kit-import.ts`, `src/types.ts`

**Intent**: Żądanie dopasowania wiersza niesie nazwę wiersza tylko wtedy, gdy wiersz jest pełny. `matchRow` przypisuje automatycznie tylko przy spełnieniu wszystkich trzech warunków decyzji.

**Contract**:

- `src/types.ts`: nowy typ żądania jednego wiersza, np. `RowMatchRequest { queries: string[]; exactName: string | null }`. Wariant `match` w `RegistrySearchWorkerRequest` niesie `rows: RowMatchRequest[]`; komentarz typu opisuje nowy kształt.
- `kit-import.ts`: budowa żądania z `ParsedRow`, np. `rowMatchRequest(row)` (zastępuje albo opakowuje `rowQueries`). `exactName` = nazwa wiersza, gdy nazwa, moc i postać są niepuste; inaczej `null`. `matchRow(index, request)` zwraca `auto` tylko gdy `exactName !== null`, pierwsze zapytanie daje `total === 1` i `sameName(results[0].name, exactName)`. W pozostałych przypadkach zachowuje obecną kolejność zapytań i zwraca `choices` albo `none`, także gdy pierwsze zapytanie dało jedno trafienie o innej nazwie (to trafienie jest wtedy jedyną propozycją).

#### 4. Protokół workera i jego odbiorcy

**File**: `src/lib/registry-search.worker.ts`, `src/components/hooks/useRegistryMatch.ts`, `src/components/kit/KitImport.tsx`, `tests/helpers/fake-search-worker.ts`, `src/components/hooks/useRegistryMatch.test.tsx`

**Intent**: Przenieść nowy kształt żądania przez wszystkie miejsca, które go wysyłają albo odbierają, bez zmiany zachowania hooka.

**Contract**:

- worker: `message.rows.map((request) => matchRow(built, request))`, obsługa błędu bez zmian;
- `useRegistryMatch(version, rows: RowMatchRequest[] | null)`: porównanie po tożsamości bez zmian;
- `KitImport.tsx`: `useMemo` buduje tablicę żądań z `parsed` (ta sama tożsamość dla tych samych wierszy);
- fake worker: `rows` i `pendingRows()` w nowym kształcie, `matchRow(index, request)`;
- test hooka: stałe wierszy jako obiekty żądań, oczekiwania bez zmian.

#### 5. Napis i testy komponentu

**File**: `src/components/kit/KitImportRow.tsx`, `src/components/kit/KitImport.test.tsx`

**Intent**: Napis mówi, na jakiej podstawie lek przypisano. Testy komponentu odpowiadają nowej regule.

**Contract**:

- napis: „Przypisano automatycznie — jedyny lek w rejestrze o tej nazwie, mocy i postaci”;
- test `:127`: sprawdza pełny nowy napis (No-Spa, wiersz pełny o równej nazwie, nadal `auto`);
- nowy test: wiersz bez mocy lub postaci z jednym trafieniem (Rutinoscorbin albo Altacet) pokazuje „Wybierz lek z rejestru:” i propozycję, bez napisu „Przypisano automatycznie”;
- testy zapisu `:298-335` i `:337-352`: przed `packChosen` dla Rutinoscorbin (wiersz 3) i Altacet (wiersz 32) klikają propozycję. Oczekiwane żądania zapisu bez zmian.

#### 6. PRD

**File**: `context/foundation/prd.md`

**Intent**: PRD v3 opisuje reguły, które kod egzekwuje, więc FR-009 dostaje regułę automatycznego przypisania.

**Contract**: pod FR-009 linia `> Doprecyzowanie (import-match-safety, 2026-11-16): …` — lek przypisuje się bez kliknięcia tylko wierszowi z nazwą, mocą i postacią, gdy najdokładniejsze wyszukanie daje jeden wariant o tej samej nazwie; w każdym innym przypadku użytkownik wybiera z propozycji. Wiersz z otwartą zmianą leku blokuje zapis strony. Wersja PRD bez zmian.

### Success Criteria:

#### Automated Verification:

- Nowe i zmienione testy jednostkowe `matchRow` są czerwone przed zmianą `matchRow` i zielone po niej: `npx vitest run src/lib/kit-import.test.ts`
- Celowe zepsucie (pominięcie warunku pełnego wiersza, potem osobno pominięcie warunku równej nazwy) czerwieni testy jednostkowe; plik przywrócony `git checkout --`
- Testy unit + component + registry przechodzą: `npx vitest run --project unit --project component --project registry`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

#### Manual Verification:

- Import na lokalnym serwerze (`http://localhost:4321/apteczka/import`) pliku z wierszem pełnym o nazwie z rejestru, wierszem z samą nazwą i wierszem o nazwie, która trafia w lek o innej nazwie: tylko pierwszy dostaje lek automatycznie z nowym napisem, pozostałe pokazują propozycje

**Implementation Note**: Po przejściu bramek automatycznych zatrzymaj się. Użytkownik decyduje, czy test ręczny robi sam, czy zleca go agentowi.

---

## Phase 2: Blokada zapisu w trybie edycji (F3)

### Overview

Wiersz z otwartym wyszukiwaniem „Zmień” blokuje zapis strony i pokazuje obecny lek. „Anuluj” zdejmuje blokadę.

### Changes Required:

#### 1. Test komponentu odtwarzający błąd (najpierw, czerwony)

**File**: `src/components/kit/KitImport.test.tsx`

**Intent**: Odtworzyć F3 testem, który dziś nie przechodzi: wiersz z przypisanym lekiem, „Zmień”, „Zapisz stronę” → nic nie poszło na serwer.

**Contract**: Przypadki:

- wiersz No-Spa z lekiem i opakowaniem → „Zmień” → klik w „Zapisz stronę”: brak żądania `importRequests()`, przycisk ma `aria-disabled`, widać powód blokady strony i w wierszu „dokończ wybór leku albo anuluj”;
- w trybie edycji wiersz pokazuje „Obecnie: No-Spa”;
- „Anuluj” → blokada znika, zapis wysyła wiersz z dotychczasowym opakowaniem.

Test nie wpisuje tekstu w pole szukania; sam tryb edycji wystarcza do odtworzenia i nie wymaga odpowiedzi workera.

#### 2. Powód blokady

**File**: `src/lib/kit-import.ts`, `src/components/kit/KitImport.tsx`, `src/components/kit/KitImportRow.tsx`

**Intent**: Wiersz w edycji z przypisanym lekiem liczy się jako wiersz wymagający decyzji, tak samo jak wiersz bez opakowania.

**Contract**:

- `RowIssue` dostaje nową wartość, np. `"choosing-variant"`; nie wchodzi do `DuplicateIssue`. `rowIssues` jej nie zwraca (zostaje bez stanu UI);
- `ImportReview` dokłada ją do listy powodów wiersza `editing === index`, który ma `row.variant`. Wiersz bez leku ma już `no-variant`. Licznik `blocking` i `blocked` liczą go bez dalszych zmian;
- `ISSUE_TEXT`: „dokończ wybór leku albo anuluj”.

#### 3. Obecny lek w trybie edycji

**File**: `src/components/kit/KitImportRow.tsx`

**Intent**: Użytkownik widzi, co zostanie, jeśli kliknie „Anuluj”.

**Contract**: `RowVariant` w trybie edycji, gdy `row.variant` istnieje, pokazuje nad `MedicineSuggest` linię „Obecnie: <nazwa>” (z mocą i postacią jak w widoku wiersza, klasy ról, bez literalnych kolorów).

### Success Criteria:

#### Automated Verification:

- Nowy test komponentu jest czerwony przed zmianą i zielony po niej: `npx vitest run src/components/kit/KitImport.test.tsx`
- Celowe zepsucie (powód trybu edycji nie trafia do listy wiersza) czerwieni test; plik przywrócony `git checkout --`
- Testy unit + component + registry przechodzą: `npx vitest run --project unit --project component --project registry`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Skan widoków przechodzi: `npm run ui:scan`

#### Manual Verification:

- Na `http://localhost:4321/apteczka/import`: wiersz z lekiem → „Zmień” → widać „Obecnie: …”, zapis strony zablokowany z powodem; „Anuluj” → zapis działa; wybór innego leku z podpowiedzi → wiersz ma nowy lek i wymaga wyboru opakowania

**Implementation Note**: Po przejściu bramek automatycznych zatrzymaj się. Użytkownik decyduje, czy test ręczny robi sam, czy zleca go agentowi.

---

## Testing Strategy

### Unit Tests:

- `matchRow` na indeksie zbudowanym z wariantów testowych: wiersz niepełny, nazwa inna niż trafienie, ta sama nazwa w innym zapisie, „Nospa” kontra „No-Spa”, dłuższa postać w trafieniu.
- `sameName`: wielkość liter, polskie znaki, separatory.

### Integration Tests:

- `KitImport.test.tsx` na całym ekranie (podmienione tylko `fetch` i `Worker`): napis przy `auto`, propozycje dla wiersza niepełnego, blokada trybu edycji i „Anuluj”, zapis stron z wyborem propozycji.
- `useRegistryMatch.test.tsx` na nowym kształcie żądania.

### Manual Testing Steps:

1. `npm run dev`, zaloguj się, otwórz `http://localhost:4321/apteczka/import`.
2. Wklej CSV z nagłówkiem i trzema wierszami: pełny o nazwie z lokalnego rejestru, sama nazwa, nazwa ucięta o ostatnie słowo z mocą i postacią. Sprawdź, że tylko pierwszy ma „Przypisano automatycznie — jedyny lek w rejestrze o tej nazwie, mocy i postaci”.
3. W pierwszym wierszu kliknij „Zmień”: „Obecnie: …”, zapis zablokowany, „Anuluj” odblokowuje.

## References

- Audyt: `context/audits/prd-conformance/2026-11-16.md` (F1, F2, F3 z decyzjami)
- Plan S-04: `context/archive/2026-11-01-csv-kit-import/plan-brief.md:27`, `plan.md:53`
- Kontrakt S-10: `context/archive/2026-10-29-kit-add-form-reset-on-edit/plan-brief.md:51`
- Kod: `src/lib/kit-import.ts:75-110`, `src/components/kit/KitImportRow.tsx:71-73`, `:357-379`, `src/components/kit/KitImport.tsx:285-294`, `:310`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguła automatycznego przypisania (F1 + F2)

#### Automated

- [x] 1.1 Nowe i zmienione testy jednostkowe `matchRow` są czerwone przed zmianą i zielone po niej
- [x] 1.2 Celowe zepsucie warunku pełnego wiersza i warunku równej nazwy czerwieni testy jednostkowe
- [x] 1.3 Testy unit + component + registry przechodzą
- [x] 1.4 Lint przechodzi
- [x] 1.5 Typy przechodzą (`npx astro check`)

#### Manual

- [ ] 1.6 Import na lokalnym serwerze: tylko pełny wiersz o równej nazwie dostaje lek automatycznie z nowym napisem

### Phase 2: Blokada zapisu w trybie edycji (F3)

#### Automated

- [ ] 2.1 Nowy test komponentu jest czerwony przed zmianą i zielony po niej
- [ ] 2.2 Celowe zepsucie powodu trybu edycji czerwieni test
- [ ] 2.3 Testy unit + component + registry przechodzą
- [ ] 2.4 Lint przechodzi
- [ ] 2.5 Typy przechodzą (`npx astro check`)
- [ ] 2.6 Skan widoków przechodzi (`npm run ui:scan`)

#### Manual

- [ ] 2.7 Tryb edycji na lokalnym serwerze: „Obecnie: …”, zapis zablokowany, „Anuluj” odblokowuje, nowy wybór działa
