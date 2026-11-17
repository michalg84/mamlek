# Liczbowa kolejność mocy w podpowiedziach — Implementation Plan

## Overview

Warianty leku o tej samej nazwie mają w podpowiedziach stać w kolejności rosnącej mocy liczbowej („500 mg” przed „1000 mg”), a nie tekstowej (roadmapa S-11, FR-002). Zmiana dotyczy wyłącznie reguły sortowania po stronie klienta w `src/lib/registry-search.ts`; bez migracji, bez API.

## Current State Analysis

- Kolejność wewnątrz poziomu ustala `compareEntries` (`src/lib/registry-search.ts:80-88`): wycofany → długość nazwy → nazwa (`Intl.Collator("pl")`) → **moc jako tekst** → id. Dla tej samej nazwy „1000 mg” stoi więc przed „500 mg”, a „10 mg” przed „5 mg”.
- Sortowanie wykonuje się raz, w `buildSearchIndex` (`src/lib/registry-search.ts:96-118`), w workerze (`src/lib/registry-search.worker.ts:30`), na całej liście. `searchVariants` tylko przechodzi po posortowanych wpisach i wypełnia poziomy A–D, więc kolejność obowiązuje przed obcięciem do `limit` (20).
- Kolejność z bazy (`registry_search_list`) nie ma znaczenia — klient sortuje po swojemu.
- `matchRow` w imporcie (`src/lib/kit-import.ts:113-136`) przypisuje automatycznie tylko przy `total === 1`, więc zmiana kolejności go nie dotyczy; zmienia się jedynie kolejność propozycji (`choices`).
- Istniejące testy kolejności używają mocy o tej samej liczbie cyfr (200/400 mg, 10/20 mg, 40 mg): `src/lib/registry-search.test.ts:159-163`, `src/components/registry/RegistrySearch.test.tsx:370-374`, `src/components/kit/KitImport.test.tsx`, `src/components/kit/KitAddForm.test.tsx`, `src/lib/kit-import.test.ts`. Po zmianie ich oczekiwania pozostają prawdziwe.
- Kształt mocy w pełnym rejestrze (lokalna baza, lista `version` 1794911068, 16 273 warianty, odczyt SELECT 2026-11-17): ok. 61% „liczba jednostka”, 18% stężenia („9 mg/ml”, „1000 j.m./0,5 ml”), 14% złożone („10 mg + 5 mg”, „(50 mg + 7,5 mg)/5 ml”), reszta nieparsowalna lub pusta („-”, „Produkt złożony”, `null`, wolny tekst szczepionek, listy „5 mg; 10 mg”, homeopatia „CH, 4CH, …”, zakresy „22,8-25,2 mg”). 3 165 nazw ma co najmniej dwie różne moce; 494 nazwy mają moce różnego kształtu (Abilify: „10 mg” i „1 mg/ml”); 25 nazw miesza g i mg (Duomox: 250 mg … 1 g). Prototyp reguły poniżej sparsował ok. 90% mocy.

## Desired End State

W obrębie tej samej nazwy (i tego samego poziomu, flagi wycofania i długości nazwy — wyższe klucze `compareEntries` bez zmian) warianty stoją w kolejności klucza mocy:

1. moce parsowalne przed nieparsowalnymi (nieparsowalne i puste na końcu, między sobą w dotychczasowej kolejności tekstowej);
2. wśród parsowalnych najpierw sygnatura jednostek (grupa: np. całe „mg”, potem całe „mg/ml”), grupy w kolejności tekstowej sygnatury;
3. w grupie liczby po kolei: składnik po składniku dla mocy złożonych, licznik przed mianownikiem dla stężeń; masa (g, mg, mcg/µg) przeliczona na mg;
4. remis: dotychczasowa kolejność tekstowa mocy, potem id.

Przykłady (z pełnego rejestru, kolejność oczekiwana):

- Duomox: 250 mg, 375 mg, 500 mg, 750 mg, 1 g
- Abilify: 5 mg, 10 mg, 15 mg, 30 mg, 1 mg/ml, 7,5 mg/ml
- Abseamed: 1000 j.m./0,5 ml, 2000 j.m./ml, 3 000 j.m./0,3 ml, …, 10 000 j.m./ml, 20000 j.m./0,5 ml, 30000 j.m/0,75 ml, 40 000 j.m./ml
- Acebis: 2,5 mg + 1,25 mg, 2,5 mg + 2,5 mg, 5 mg + 2,5 mg, 5 mg + 5 mg, 10 mg + 5 mg, 10 mg + 10 mg
- Duracef: 500 mg, 1 g, 250 mg/5 ml, 500 mg/5 ml

Weryfikacja: testy regresji w `src/lib/registry-search.test.ts`, przejrzany diff `npm run search:check` na pełnym rejestrze i nowy plik wzorcowy, `npm run perf` w zapasie.

### Key Discoveries:

- Klucz musi być liczony raz na wpis w `buildSearchIndex`, obok `nameLength` (`src/lib/registry-search.ts:110`): komparator działa na ok. 16 tys. wpisów w workerze, a zapas wydajności to ok. 350 ms (roadmapa S-04/S-11).
- Samo „liczbowo, gdy porównywalne, inaczej tekstowo” nie jest poprawnym komparatorem (brak przechodniości: A<B liczbowo, B<C tekstowo, C<A liczbowo) — dlatego jeden klucz o stałym porządku.
- Spacja jest separatorem tysięcy w rejestrze („10 000 j.m./ml”, „3 000 j.m./0,3 ml”); naiwne „pierwsza liczba” czyta 10.
- Przecinek jest dziesiętny („2,5 mg”), ale też separatorem list („CH, 4CH, …”); średnik oddziela listy mocy („5 mg; 10 mg”) — takie moce są nieparsowalne.
- Pisownia jednostek bywa niespójna: „j.m.” / „j.m” („30000 j.m/0,75 ml”) — porównanie jednostek po małych literach i bez kropek je scala; „IU” zostaje osobną jednostką.
- Końcowy nawias jest dopiskiem równoważnika („1 mg/ml (0,1%)”, „100 j.m./ml (3,5 mg/ml)”) i nie wpływa na klucz.

## What We're NOT Doing

- Bez migracji, bez zmian `registry_search_list`, `registry_refresh_search_list` i API.
- Bez przeliczania jednostek innych niż masa (j.m. ↔ IU, ml, %, GBq zostają osobnymi grupami).
- Bez przeliczania stężeń na wartość na jednostkę (decyzja: licznik, potem mianownik).
- Bez parsowania list mocy („5 mg; 10 mg”), zakresów („22,8-25,2 mg”), homeopatii („CH, 4CH, …”) i wolnego tekstu — trafiają na koniec grupy nazwy.
- Bez zmian kolejności poziomów, flagi wycofania, długości i kolejności nazw ani limitu 20.
- Bez zmian w komponentach UI, imporcie i formularzu apteczki (nakładanie z S-06 i S-12 ograniczone do tego, że ich ekrany korzystają z kolejności wyników).

## Implementation Approach

Czysta funkcja budująca klucz mocy z tekstu mocy, wywoływana raz na wpis w `buildSearchIndex`; klucz trafia do `RegistrySearchEntry`, a `compareEntries` porównuje go w miejscu dzisiejszego `collator.compare(strength)`, zostawiając to porównanie tekstowe i id jako rozstrzygnięcie remisu. Najpierw (faza 1) plik wzorcowy `search:check` na niezmienionym kodzie i czerwone testy regresji; potem implementacja. Faza 2 zbiera wszystko, co wymaga wspólnej bazy i zgody koordynatora.

## Critical Implementation Details

- **Kolejność kroków z bazą:** `npm run search:check -- --save` musi przejść na niezmienionym kodzie, zanim zmieni się `src/lib/registry-search.ts`, a oba przebiegi (`--save` i porównanie w fazie 2) muszą widzieć tę samą `version` listy (dziś 1794911068). Wspólną bazę dzielą trzy sesje: przed każdym przebiegiem poprosić koordynatora o zgodę (`herdr agent prompt w1:p1 "search-numeric-strength-order: …"`) i okno bez `db reset`, importu i odświeżania listy. Plik wzorcowy powstaje w tym worktree (`.perf/search-golden.json`, poza gitem), nie jest kopiowany z głównego checkoutu.
- **Wydajność:** żadnego regexa w komparatorze; klucz liczony raz na wpis.

## Phase 1: Reguła i testy

### Overview

Plik wzorcowy przed zmianą, testy regresji, które najpierw nie przechodzą, potem klucz mocy i nowy komparator.

### Changes Required:

#### 1. Plik wzorcowy na niezmienionym kodzie

**File**: `.perf/search-golden.json` (poza gitem)

**Intent**: Zapisać wyniki ~30 stałych zapytań na obecnej regule, żeby w fazie 2 zobaczyć dokładnie, co zmieniła nowa kolejność.

**Contract**: `npm run search:check -- --save` z lokalnym `DATABASE_URL` (postgresql://postgres:postgres@127.0.0.1:54322/postgres), za zgodą koordynatora; zanotować `version` listy w raporcie fazy.

#### 2. Testy regresji kolejności mocy

**File**: `src/lib/registry-search.test.ts`

**Intent**: Nowy blok `describe` z własną listą wariantów (jak blok wycofanych, `src/lib/registry-search.test.ts:214-245`), bez zmiany wspólnego fixture'u `tests/fixtures/registry-search-list.ts`. Oczekiwane kolejności wyprowadzone ręcznie z reguły, nie z uruchomienia kodu; id wariantów celowo w odwrotnej kolejności niż oczekiwana, żeby nie rozstrzygały. Zaktualizować opis R5 w nagłówku pliku i komentarz testu `orders the same name by strength` (zdanie o celowo nieporównywanych liczbach cyfr przestaje być prawdą).

**Contract**: przypadki (każdy jedna nazwa, wszystkie warianty na tym samym poziomie):

- różna liczba cyfr: „1000 mg”, „500 mg”, „250 mg” → 250, 500, 1000; oraz „10 mg”, „5 mg”, „2,5 mg” → 2,5, 5, 10 (przecinek dziesiętny);
- masa przeliczana: „1 g”, „500 mg”, „750 mg” → 500 mg, 750 mg, 1 g; „0,5 mg” i „250 mcg” → 250 mcg, 0,5 mg;
- grupy jednostek: „1 mg/ml”, „10 mg”, „5 mg”, „7,5 mg/ml” → 5 mg, 10 mg, 1 mg/ml, 7,5 mg/ml;
- stężenia: „2000 j.m./ml”, „1000 j.m./0,5 ml”, „10 000 j.m./ml”, „3 000 j.m./0,3 ml” → 1000, 2000, 3 000, 10 000 (spacja tysięcy); przy równym liczniku „5 mg/5 ml” przed „5 mg/10 ml”;
- złożone: „10 mg + 10 mg”, „10 mg + 5 mg”, „2,5 mg + 1,25 mg”, „5 mg + 2,5 mg” → 2,5+1,25, 5+2,5, 10+5, 10+10;
- nieparsowalne na końcu: „-”, `null`, „Produkt złożony”, „5 mg; 10 mg” po „20 mg”, między sobą w kolejności tekstowej (pusty/`null` pierwszy, jak dziś);
- dopisek w nawiasie nie zmienia klucza: „1 mg/ml (0,1%)” po „0,5 mg/ml”;
- wyższe klucze bez zmian: krótsza nazwa nadal przed dłuższą niezależnie od mocy, aktywny przed wycofanym.

#### 3. Klucz mocy i komparator

**File**: `src/lib/registry-search.ts`

**Intent**: Funkcja (eksport tylko jeśli test tego potrzebuje; domyślnie wewnętrzna) zamieniająca tekst mocy w klucz; pole klucza w `RegistrySearchEntry` liczone w `buildSearchIndex`; `compareEntries` porównuje klucz między nazwą a tekstem mocy.

**Contract**:

- Wejście: tekst mocy (`string | null`). Wyjście: `null` (nieparsowalna) albo `{ signature: string; values: number[] }`.
- Gramatyka (po `trim()` i odcięciu jednego końcowego nawiasu `(…)`):
  - liczba: `\d{1,3}(?: \d{3})+` (spacja tysięcy) albo `\d+(?:[.,]\d+)?` (przecinek lub kropka dziesiętna);
  - ilość: liczba, opcjonalne spacje, jednostka — ciąg znaków bez cyfr, spacji, `/ + ( ) ; ,`; dopuszczalne kolejne słowa jednostki po pojedynczej spacji („mln j.”, „dawkę inh.”);
  - mianownik: `/` i opcjonalna liczba (brak = 1) z jednostką;
  - składnik: ilość z opcjonalnym własnym mianownikiem („10 mg/g + 0,25 mg/g”);
  - moc: składniki połączone `+`, opcjonalnie w nawiasie ze wspólnym mianownikiem („(50 mg + 7,5 mg)/5 ml”);
  - cokolwiek innego (średnik, zakres, brak liczby, `null`, pusty tekst) → `null`.
- Jednostka porównywana po `toLowerCase()` i usunięciu kropek; masa: g ×1000, mg ×1, mcg / µg / mikrogram* ×0,001 → jednostka „mg”.
- `signature`: jednostki w kolejności składników z separatorami `+`, `/`, nawiasem wspólnego mianownika (np. `mg`, `mg/ml`, `mg+mg`, `(mg+mg)/ml`); porównanie zwykłym porównaniem napisów (`<`), nie collatorem.
- `values`: dla każdego składnika wartość, a po niej wartość jego mianownika (jeśli jest); na końcu wartość wspólnego mianownika; porównanie leksykograficzne, krótsza krotka przy równym prefiksie pierwsza.
- `compareEntries`: wycofany → długość nazwy → nazwa → (parsowalna przed `null`) → `signature` → `values` → `collator.compare(strength)` → id.

### Success Criteria:

#### Automated Verification:

- Plik wzorcowy zapisany na niezmienionym kodzie: `npm run search:check -- --save` (za zgodą koordynatora)
- Nowe testy kolejności mocy nie przechodzą przed zmianą `src/lib/registry-search.ts`: `npx vitest run --project unit src/lib/registry-search.test.ts`
- Testy jednostkowe, komponentów i rejestru przechodzą: `npx vitest run --project unit --project component --project registry`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

**Implementation Note**: Po fazie 1 i zielonych bramkach pauza na potwierdzenie użytkownika przed fazą 2.

---

## Phase 2: Weryfikacja na pełnym rejestrze

### Overview

Porównanie wyników stałych zapytań z plikiem wzorcowym, przegląd różnic, nowy plik wzorcowy, pomiar wydajności i ręczne sprawdzenie `/szukaj`. Wszystkie kroki na wspólnej bazie i serwerze — każdy za zgodą koordynatora.

### Changes Required:

#### 1. Przegląd różnic i nowy plik wzorcowy

**File**: `.perf/search-golden.json` (poza gitem)

**Intent**: Potwierdzić, że różnice dotyczą tylko kolejności mocy w obrębie tej samej nazwy i — przy zapytaniach z ponad 20 dopasowaniami w poziomie — zestawu widocznych 20 podpowiedzi; żadnej zmiany poziomów ani kolejności nazw. Po przeglądzie zapisać nowy plik wzorcowy.

**Contract**: `npm run search:check` (oczekiwany exit 1 z różnicami), przegląd z użytkownikiem, potem `npm run search:check -- --save`; ta sama `version` listy co w fazie 1. Exit 2 (inna `version`) znaczy, że lista się zmieniła: zapisać wzorzec ponownie na kodzie sprzed zmiany (`git checkout <sha-sprzed-fazy-1> -- src/lib/registry-search.ts`, `--save`, potem przywrócić plik z HEAD; bez `git stash`, bo stos jest wspólny dla worktree) i powtórzyć porównanie.

#### 2. Wydajność

**File**: brak zmian w kodzie

**Intent**: Sprawdzić, że liczenie klucza przy budowie indeksu mieści się w zapasie listy gotowej do wyszukiwania.

**Contract**: `npm run build`, potem `npx wrangler dev -c dist/server/wrangler.json --port 4332 …` i `BASE_URL=http://localhost:4332 npm run perf`; porównanie z przebiegiem na `main` w tym samym ustawieniu (oba w tej sesji); serwer zatrzymany po pomiarze.

### Success Criteria:

#### Automated Verification:

- `npm run search:check` pokazuje tylko różnice kolejności mocy w obrębie nazwy (i wynikający z niej zestaw top 20), po przeglądzie nowy wzorzec zapisany: `npm run search:check -- --save`
- `npm run perf` (port 4332, za zgodą koordynatora): czas gotowości listy nie gorszy niż na `main` o więcej niż szum pomiaru

#### Manual Verification:

- Na `http://localhost:4332/szukaj` zapytanie „duomox” pokazuje 250 mg, 375 mg, 500 mg, 750 mg, 1 g; „abilify” pokazuje tabletki (5, 10, 15, 30 mg) przed roztworami (1 mg/ml, 7,5 mg/ml); „acebis” pokazuje 2,5 mg + 1,25 mg na górze i 10 mg + 10 mg na dole

**Implementation Note**: Testy ręczne wykonuje użytkownik albo agent — decyduje użytkownik.

---

## Testing Strategy

### Unit Tests:

- Kolejność mocy przez publiczne `buildSearchIndex` + `searchVariants` na własnej liście w `src/lib/registry-search.test.ts` (przypadki w fazie 1).
- Istniejące testy kolejności (R5, wycofane, `RegistrySearch.test.tsx`, import, formularz) zostają bez zmian i przechodzą.

### Integration Tests:

- `npm run search:check` na pełnym rejestrze jako porównanie przed/po.

### Manual Testing Steps:

1. Zalogować się na `http://localhost:4332/szukaj` (serwer za zgodą koordynatora).
2. Wpisać „duomox”, „abilify”, „acebis”, „abseamed” i porównać kolejność z „Desired End State”.
3. Wpisać „ibuprom” i sprawdzić, że krótsze nazwy nadal stoją przed dłuższymi.

## Performance Considerations

Klucz liczony raz na wpis (~16 tys. dopasowań regexów przy budowie indeksu w workerze); komparator porównuje tylko napisy i liczby. Zapas ok. 350 ms — `npm run perf` w fazie 2.

## Migration Notes

Brak migracji. Wdrożenie przez zwykły merge (Cloudflare deploy); wycofanie przez revert.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-11, Open Roadmap Question 9)
- Reguła S-01: `context/archive/2026-10-02-registry-search-suggestions/plan.md`
- Komparator: `src/lib/registry-search.ts:80-88`, budowa indeksu: `src/lib/registry-search.ts:96-118`
- Wzór testu z własną listą: `src/lib/registry-search.test.ts:214-245`
- Narzędzie porównania: `scripts/registry-search-check.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguła i testy

#### Automated

- [x] 1.1 Plik wzorcowy zapisany na niezmienionym kodzie
- [x] 1.2 Nowe testy kolejności mocy nie przechodzą przed zmianą
- [x] 1.3 Testy jednostkowe, komponentów i rejestru przechodzą
- [x] 1.4 Lint przechodzi
- [x] 1.5 Typy przechodzą

### Phase 2: Weryfikacja na pełnym rejestrze

#### Automated

- [ ] 2.1 search:check pokazuje tylko różnice kolejności mocy, nowy wzorzec zapisany
- [ ] 2.2 perf w zapasie względem main

#### Manual

- [ ] 2.3 Kolejność mocy na /szukaj dla duomox, abilify, acebis
