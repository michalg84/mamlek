# Jednoznaczna ilość w apteczce — plan implementacji

## Overview

Ilość leku w apteczce (`kit_items.quantity`) ma znaczyć zawsze to, co użytkownik liczy: sztuki (tabletki, kapsułki, plastry), gdy rejestr opisuje opakowanie jednostką liczoną w sztukach. Dziś dla „1 butelka po 90 tabl.” limit to 1 (butelka), a dla „12 tabl.” limitu nie ma i ilość jest w tabletkach — ta sama kolumna znaczy co innego zależnie od leku (S-12, zgłoszenie z ręcznego testu S-04). Przy okazji wycinek zamyka F10 z audytu 2026-11-16: puste opakowanie (ilość 0) przestaje dawać werdykt „Masz ten lek”.

## Current State Analysis

- `packQuantity` (`src/lib/kit-format.ts:57-71`) zwraca `{unit: kind, max: count}` tylko dla opakowania z jednym wpisem `units` i dodatnim całkowitym `count`; `capacity` i `capacity_unit` ignoruje. Opakowania bez `count` (np. „12 tabl.”) nie mają limitu ani jednostki.
- Limit „wielkość opakowania” sprawdzają trzy endpointy i zwracają 400 `Quantity exceeds the pack size`: `src/pages/api/kit/index.ts:52-54`, `src/pages/api/kit/import.ts:63-65`, `src/pages/api/kit/[id].ts:73-78`. Baza limitu nie zna (luka F2 w `tests/db/kit-access.test.ts:276-291`); kolumna ma tylko `check (quantity >= 0)` (`supabase/migrations/20261007120000_kit_items.sql:19`), komentarz kolumny: „Units left in the pack (e.g. tablets); NULL when unknown.” (`:34`).
- zod: `int().min(0).max(MAX_QUANTITY).nullable().optional()` w `src/lib/kit-request.ts:12,28`, `MAX_QUANTITY = 100000`.
- Import CSV blokuje wiersz powodem `quantity-over-pack` (`src/lib/kit-import.ts:230-239`, komunikaty w `KitImportRow.tsx:317-352`).
- Formularz dodawania: etykieta „Ilość w opakowaniu (opcjonalnie)” (`KitAddForm.tsx:241`), pole `QuantityInput` z sufiksem „z {max} {unit}” (`kit-fields.tsx:79-97`). Lista: pole ilości z zapisem (`KitList.tsx:56-97`), przy 0 napis „Opakowanie puste” + „Usuń” (`:218-229`), dialog „Usunąć z apteczki?” (`:276-310`). Panel edycji: `KitItemEdit.tsx:116,134,269-286`.
- Werdykt: `checkVerdict` (`src/lib/medicine-check-verdict.ts`) dzieli pozycje na `variants` i `same` po `match` i nie patrzy na ilość, więc puste opakowanie daje „Masz ten lek · 1 opakowanie”. `MedicineCheckResult.tsx` pokazuje sekcje „W apteczce” i „Także z tą samą substancją czynną”.
- Dane rejestru (lokalnie, 71 629 opakowań): jedno-wpisowe z `count` i jednostką liczoną w sztukach — 1 186 (1 002 z `count = 1`, 184 z `count > 1`); bez `count` z jednostką liczoną w sztukach („12 tabl.”) — 42 100; z jednostką miary (ml, g, mg…) — 25 210. Lokalnie 194 wiersze `kit_items`, żaden na opakowaniu z `count` + jednostką liczoną w sztukach. Szczegóły: `research.md`.

## Desired End State

- Dla opakowania z jednym wpisem `units`, którego `capacity_unit` jest jednostką liczoną w sztukach, ilość jest w sztukach: limit `count × capacity` (albo samo `capacity`, gdy `count` brak), jednostka z `capacity_unit`. „1 butelka po 90 tabl.” → „z 90 tabl.”, „2 blistry po 10 tabl.” → „z 20 tabl.”, „12 tabl.” → „z 12 tabl.”. Pozostałe opakowania (ml, g, dawki, kilka wpisów) zostają przy dzisiejszej regule.
- Ilość ponad limit opakowania zapisuje się (do `MAX_QUANTITY`) z widocznym ostrzeżeniem „więcej niż w opakowaniu”; żaden endpoint nie zwraca już 400 `Quantity exceeds the pack size`, import nie blokuje wiersza.
- Przy dodawaniu (formularz, `POST /api/kit`, import) ilość 0 jest odrzucana; `PATCH` nadal przyjmuje 0.
- Zapisanie ilości 0 na liście lub w panelu edycji otwiera dialog „Usunąć z apteczki?”; „Anuluj” zostawia pozycję z ilością 0.
- Werdykt na `/szukaj` nie liczy pustych opakowań; gdy pasują tylko puste, werdykt jest „Nie masz tego leku”, a puste opakowania stoją pod nim w osobnej sekcji „Puste opakowania”.
- PRD v3, roadmapa i AGENTS.md opisują nową regułę.

Weryfikacja: `npm test`, `npx astro check`, `npm run lint`, `npm run test:api` i `npm run test:db` (za zgodą koordynatora) oraz ręczny przegląd formularza, importu, listy i `/szukaj` na porcie 4331.

### Key Discoveries:

- `packQuantity` jest jedynym źródłem limitu dla API (`index.ts`, `import.ts`, `[id].ts`), formularza, importu (`context.packMax`), listy i panelu edycji — zmiana reguły w jednym miejscu przechodzi wszędzie (`src/lib/kit-format.ts:57-71`).
- `formatQuantity` (`kit-format.ts:172-181`) i `KitItemDetails` (`KitItemDetails.tsx:37-38`) są używane także przez `MedicineCheckResult` na `/szukaj` — nowy opis ilości pojawi się więc też w wyniku sprawdzenia.
- Granice w `tests/api/helpers.ts:183-190` (`sized`) wybierają opakowanie po `units->0->>'count'` między 3 a 99999 — po zmianie reguły trzeba je liczyć tą samą regułą co `packQuantity`, inaczej testy API pomylą limit.
- Wartości w `units` to tekst (`"90"`, `"0,5"`); 3 464 opakowania mają ułamkową `capacity` (próbka: wszystkie w ml) — reguła musi przyjmować tylko dodatnią liczbę całkowitą.

## What We're NOT Doing

- Bez nowej kolumny (np. jednostki ilości) i bez zmiany danych w `kit_items`; jedyna migracja zmienia komentarz kolumny.
- Bez zmiany SQL `medicine_check`, kształtu odpowiedzi RPC i sygnatur `parseMedicineCheck` / `checkVerdict` (prośba koordynatora: S-06 zmienia te same pliki i merguje po S-12).
- Bez sztuk dla dawek (inhalatory, „dawek”, „dawka”) i jednostek miary (ml, g, mg) — tam ilość zostaje jak dziś.
- Bez reguły „wszystkie przeterminowane” w werdykcie — to S-08.
- Bez pola notatki przy leku (pomysł autora na później).
- Bez zmiany promptu dla czatu w imporcie („ile sztuk zostało”) — po zmianie jest zgodny z regułą.

## Implementation Approach

Reguła siedzi w TS: `packQuantity` rozpoznaje jednostki liczone w sztukach po `capacity_unit` i liczy limit w sztukach. Ponieważ wszystkie warstwy czytają limit z `packQuantity`, faza 1 zmienia samą regułę i jej testy. Faza 2 zamienia twardy limit na ostrzeżenie: zdejmuje 400 z API, a w UI i imporcie pokazuje ostrzeżenie zamiast blokady. Faza 3 domyka puste opakowanie (minimum 1 przy dodawaniu, pytanie o usunięcie, werdykt bez pustych) i dokumentację — dwa osobne commity w jednej fazie (decyzja autora).

## Critical Implementation Details

- **Zbiór jednostek liczonych w sztukach** to stała w `kit-format.ts` porównywana po `trim()` i bez rozróżniania wielkości liter: `tabl.`, `tabletek`, `kaps.`, `szt.`, `pastylek`, `pastylki`, `plastrów`, `plastry`, `plaster`, `Systemów`, `Systemy`. Bez `dawek` / `dawka`. Jednostka do wyświetlenia to `capacity_unit` z rejestru (np. „tabl.”).
- **Zasięg zmiany werdyktu (S-06 merguje po S-12):** `checkVerdict` filtruje na wejściu pozycje z `quantity === 0`, a puste opakowania zwraca nowa, osobna funkcja (np. `emptyPacks(result)`) w `medicine-check-verdict.ts`. W `MedicineCheckResult.tsx` sekcja „Puste opakowania” to osobny komponent dopisany pod istniejącymi sekcjami, bez przepisywania obecnych bloków; ogłoszenie `sr-only` dostaje jedno zdanie o pustych opakowaniach doklejone na końcu. `CheckVerdict` i sygnatury bez zmian.
- **Kolejność wdrożenia migracji komentarza:** merge, potem ręczny `npx supabase db push` (jak przy innych migracjach). Timestamp `20261117120200` — po `20261117120100` i przed migracją S-06 (uzgodnione z koordynatorem).
- **Zapis 0, potem pytanie:** na liście i w panelu edycji 0 najpierw się zapisuje (PATCH), a dopiero po udanym zapisie otwiera się dialog usuwania; „Anuluj” nic nie cofa. Dzięki temu nie ma stanu, w którym pole pokazuje 0, a baza starą ilość.

## Phase 1: Ilość w sztukach

### Overview

Nowa reguła limitu i jednostki w `packQuantity`; wszystkie warstwy dostają ją bez zmian w swoim kodzie. Testy przypięte do starej reguły przechodzą na nową.

### Changes Required:

#### 1. Reguła ilości

**File**: `src/lib/kit-format.ts`

**Intent**: `packQuantity` dla opakowania z jednym wpisem `units` i `capacity_unit` z zbioru jednostek liczonych w sztukach zwraca limit w sztukach i jednostkę z `capacity_unit`; w pozostałych przypadkach zachowuje dzisiejszą regułę.

**Contract**: `packQuantity(units)` zwraca `{ unit: string; max: number } | null` (sygnatura bez zmian). Nowa gałąź: `capacity` dodatnia liczba całkowita, `capacity_unit` w zbiorze → `max = (count ?? 1) × capacity`, `unit = capacity_unit`; gdy `count` jest, ale nie jest dodatnią liczbą całkowitą, albo `capacity` nie jest liczbą całkowitą (np. „0,5”) → stara reguła. Iloczyn większy niż `MAX_QUANTITY` przycina się do `MAX_QUANTITY`.

#### 2. Testy reguły i opisu ilości

**File**: `src/lib/kit-format.test.ts`

**Intent**: Przypadki z kształtów z rejestru: „1 butelka po 90 tabl.” → 90 tabl., „2 blistry po 10 tabl.” → 20 tabl., „12 tabl.” → 12 tabl., „1 inhalator po 200 dawek” → stara reguła, „1 butelka po 100 ml” → stara reguła, ułamkowa `capacity`, kilka wpisów `units`, wielkość liter i spacje w `capacity_unit`. `formatQuantity` daje „8 z 12 tabl.”.

**Contract**: Wartości oczekiwane wpisane ręcznie z kształtu `units`, nie liczone kodem pod testem.

#### 3. Testy komponentów i importu przypięte do starej reguły

**File**: `src/lib/kit-import.test.ts`, `src/components/kit/KitAddForm.test.tsx`, `src/components/kit/KitList.test.tsx`, `src/components/kit/KitItemEdit.test.tsx`, `src/components/kit/KitImport.test.tsx`

**Intent**: Fixtury opakowań, które opisywały limit przez `count`, dostają kształt zgodny z nową regułą albo nowe oczekiwania (np. sufiks „z 90 tabl.” zamiast „z 1 butelka”). Asercje zmieniają się tylko tam, gdzie zmienia się wymaganie.

**Contract**: Brak nowych plików; liczba testów nie maleje.

#### 4. Granice testów API

**File**: `tests/api/helpers.ts`

**Intent**: `sized` wybiera opakowanie z limitem liczonym tą samą regułą co `packQuantity` (np. jedno-wpisowe z `capacity_unit` w zbiorze), a limit dla testów bierze z `packQuantity` na `units` tego opakowania, nie z `units->0->>'count'`.

**Contract**: `d.sized.size` = `packQuantity(units).max`; zapytanie tylko SELECT.

#### 5. Sprawdzenie danych na produkcji

**File**: — (krok autora)

**Intent**: Przed merge autor uruchamia na produkcji SELECT tylko do odczytu: ile wierszy `kit_items` stoi na opakowaniach, którym zmienia się znaczenie ilości (jeden wpis `units` z `count` i jednostką liczoną w sztukach), z jakimi ilościami, oraz ile wierszy ma ilość 0. Wynik decyduje, czy potrzebna jest ręczna poprawka danych (np. ilość „1” = 1 butelka).

**Contract**: Zapytanie wpisane do `research.md` lub notatki wdrożenia; agent go nie uruchamia na produkcji.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe i komponentów przechodzą: `npm test`
- Typy przechodzą: `npx astro check`
- Lint przechodzi: `npm run lint`
- Testy API przechodzą na serwerze z portu 4331 (za zgodą koordynatora): `BASE_URL=http://localhost:4331 npm run test:api`

#### Manual Verification:

- Formularz dodawania na `http://localhost:4331/apteczka` dla Oxbryty („1 butelka po 90 tabl.”) pokazuje „z 90 tabl.” i przyjmuje 90
- Lek z opakowaniem „12 tabl.” pokazuje „z 12 tabl.”, a syrop (ml) wygląda jak przed zmianą
- Autor uruchomił SELECT na produkcji i zdecydował o ewentualnej poprawce danych

**Implementation Note**: Po zielonych testach automatycznych zatrzymaj się na potwierdzenie testów ręcznych przez człowieka przed fazą 2.

---

## Phase 2: Ponad pojemność — ostrzeżenie zamiast blokady

### Overview

Ilość ponad limit opakowania zapisuje się z ostrzeżeniem. API przestaje odrzucać, import przestaje blokować, pola ilości pokazują ostrzeżenie.

### Changes Required:

#### 1. Endpointy

**File**: `src/pages/api/kit/index.ts`, `src/pages/api/kit/import.ts`, `src/pages/api/kit/[id].ts`

**Intent**: Usunięcie sprawdzenia `quantity > packQuantity(...).max` i odpowiedzi 400 `Quantity exceeds the pack size`. Górną granicą zostaje `MAX_QUANTITY` z zod.

**Contract**: Brak 400 z tym komunikatem; pozostałe walidacje i kody bez zmian. Jeśli po usunięciu endpoint nie potrzebuje już opakowania do niczego innego, nie dodaje zapytań.

#### 2. Ostrzeżenie w polu ilości

**File**: `src/components/kit/kit-fields.tsx` (+ użycia w `KitAddForm.tsx`, `KitList.tsx`, `KitItemEdit.tsx`)

**Intent**: `QuantityInput` przy wartości większej niż `max` pokazuje pod polem ostrzeżenie „Więcej niż w opakowaniu ({max} {unit})” w stylu ostrzeżenia (rola `warning`), połączone z polem przez `aria-describedby`; zapis nie jest blokowany. Formularze i lista przestają traktować przekroczenie jako błąd.

**Contract**: Kolory tylko z klas ról (`text-warning-foreground` / `bg-warning`); `npm run ui:scan` czysty.

#### 3. Import

**File**: `src/lib/kit-import.ts`, `src/components/kit/KitImportRow.tsx`

**Intent**: `quantity-over-pack` przestaje być powodem blokującym w `rowIssues`; wiersz pokazuje to samo ostrzeżenie jako informację, a strona da się zapisać.

**Contract**: Typ `RowIssue` bez `quantity-over-pack` (albo osobna funkcja ostrzeżeń wiersza); `toImportItem` bez zmian.

#### 4. Komentarz kolumny

**File**: `supabase/migrations/20261117120200_kit_quantity_comment.sql`

**Intent**: Nowy komentarz `kit_items.quantity`: ilość w sztukach, gdy opakowanie liczy się w sztukach, inaczej w jednostkach opakowania; NULL = nieznana; limit opakowania to ostrzeżenie w aplikacji, nie ograniczenie bazy.

**Contract**: Tylko `comment on column`; bez zmian schematu i danych. Nie dotyka funkcji importera, więc nie wchodzi do `REGISTRY_MIGRATIONS`.

#### 5. Testy

**File**: `tests/api/kit-input.test.ts`, `tests/db/kit-access.test.ts`, testy komponentów i `src/lib/kit-import.test.ts`

**Intent**: Testy API „ilość ponad opakowanie → 400” stają się „ilość ponad opakowanie → zapisana” dla `POST`, importu i `PATCH`; `MAX_QUANTITY + 1` nadal 400. Opis F2 w `kit-access.test.ts` przestaje mówić o luce (to reguła). Testy komponentów: ostrzeżenie widoczne, zapis wysłany. Import: wiersz ponad limit gotowy do zapisu.

**Contract**: Obie strony każdej granicy (`max`, `max + 1`, `MAX_QUANTITY`, `MAX_QUANTITY + 1`).

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe i komponentów przechodzą: `npm test`
- Typy przechodzą: `npx astro check`
- Lint i skan UI przechodzą: `npm run lint` i `npm run ui:scan`
- Migracja wchodzi na lokalną bazę (za zgodą koordynatora): `npx supabase migration up`
- Testy bazy przechodzą (za zgodą koordynatora): `npm run test:db`
- Testy API przechodzą (za zgodą koordynatora): `BASE_URL=http://localhost:4331 npm run test:api`

#### Manual Verification:

- Na `http://localhost:4331/apteczka` ilość 14 dla opakowania „12 tabl.” zapisuje się, a pole pokazuje ostrzeżenie „Więcej niż w opakowaniu”
- Import CSV z ilością ponad opakowanie (`http://localhost:4331/apteczka/import`) pokazuje ostrzeżenie i pozwala zapisać stronę
- Panel edycji przyjmuje ilość ponad limit z tym samym ostrzeżeniem

**Implementation Note**: Po zielonych testach automatycznych zatrzymaj się na potwierdzenie testów ręcznych przez człowieka przed fazą 3.

---

## Phase 3: Puste opakowanie i dokumentacja

### Overview

Puste opakowanie nie wchodzi do apteczki przy dodawaniu, przy zużyciu prowadzi do pytania o usunięcie i nie daje werdyktu „Masz ten lek”. Dokumentacja opisuje nową regułę. Dwa osobne commity: najpierw kod z testami, potem dokumentacja.

### Changes Required:

#### 1. Minimum 1 przy dodawaniu

**File**: `src/lib/kit-request.ts`, `src/components/kit/KitAddForm.tsx`, `src/lib/kit-import.ts`, `src/components/kit/KitImportRow.tsx`

**Intent**: Schemat `POST /api/kit` i elementów importu przyjmuje ilość od 1 (`null` nadal dozwolone); schemat `PATCH` zostaje od 0. Formularz pokazuje błąd przy 0. Import blokuje wiersz z 0 nowym powodem z komunikatem „Puste opakowanie — pomiń wiersz”.

**Contract**: Osobne schematy ilości dla dodania (`min(1)`) i edycji (`min(0)`); nowy `RowIssue` np. `empty-pack`. API: 0 przy dodaniu → 400 z czytelnym komunikatem, nic nie zapisane.

#### 2. Zero na liście i w panelu edycji

**File**: `src/components/kit/KitList.tsx`, `src/components/kit/KitItemEdit.tsx`

**Intent**: Po udanym zapisie ilości 0 otwiera się istniejący dialog „Usunąć z apteczki?”; „Usuń” usuwa pozycję, „Anuluj” zostawia ją z ilością 0 i napisem „Opakowanie puste” + „Usuń” jak dziś.

**Contract**: Ten sam dialog i ta sama ścieżka usunięcia co przycisk „Usuń”; fokus po „Anuluj” wraca do pola ilości (lub przycisku, który zapisał).

#### 3. Werdykt bez pustych opakowań

**File**: `src/lib/medicine-check-verdict.ts`, `src/components/registry/MedicineCheckResult.tsx`

**Intent**: `checkVerdict` liczy tylko pozycje z ilością różną od 0 (`null` = nieznana liczy się jako „masz”). Nowa funkcja zwraca puste opakowania; nowy, osobny komponent rysuje je pod istniejącymi sekcjami jako „Puste opakowania” (lista `KitItemDetails`), a ogłoszenie dla czytnika dostaje zdanie o pustych opakowaniach.

**Contract**: `checkVerdict(result): CheckVerdict` i `parseMedicineCheck` bez zmian sygnatury; `CheckVerdict` bez nowych pól. Istniejące bloki JSX nie są przepisywane (rebase S-06).

#### 4. Testy

**File**: `src/lib/medicine-check-verdict.test.ts`, `src/components/registry/MedicineCheckResult.test.tsx`, `src/components/kit/KitList.test.tsx`, `src/components/kit/KitItemEdit.test.tsx`, `src/components/kit/KitAddForm.test.tsx`, `src/lib/kit-import.test.ts`, `tests/api/kit-input.test.ts`

**Intent**: Werdykt: tylko puste pasujące → „Nie masz tego leku” + sekcja „Puste opakowania”; puste i niepuste → liczba opakowań bez pustych; ilość nieznana liczy się. Lista i panel: zapis 0 → dialog, „Anuluj” zostawia 0, „Usuń” usuwa. Dodawanie i import: 0 odrzucone; `PATCH` z 0 nadal 200.

**Contract**: Obie strony granicy (0, 1) przy dodaniu i edycji.

#### 5. Dokumentacja (osobny commit)

**File**: `context/foundation/prd.md`, `context/foundation/roadmap.md`, `AGENTS.md`

**Intent**: PRD v3 (`prd.md:155`): ilość w sztukach dla opakowań liczonych w sztukach, limit opakowania jako ostrzeżenie, 0 tylko po zużyciu (nie przy dodaniu), puste opakowanie nie daje „Masz ten lek”. Roadmapa: rozstrzygnięte niewiadome S-12 i pytanie F10 (część o pustym opakowaniu; „wszystkie przeterminowane” zostaje w S-08). AGENTS.md: opisy `test:api` i `test:db` (koniec luki F2 jako „accepted gap”, ilość ponad opakowanie przyjmowana, 0 odrzucane przy dodaniu).

**Contract**: AGENTS.md po angielsku, `context/` po polsku; `npm run roadmap:sync` po zmianie roadmapy.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe i komponentów przechodzą: `npm test`
- Typy przechodzą: `npx astro check`
- Lint i skan UI przechodzą: `npm run lint` i `npm run ui:scan`
- Testy bazy przechodzą (za zgodą koordynatora): `npm run test:db`
- Testy API przechodzą (za zgodą koordynatora): `BASE_URL=http://localhost:4331 npm run test:api`

#### Manual Verification:

- Na `http://localhost:4331/apteczka` wpisanie 0 i zapis otwiera „Usunąć z apteczki?”; „Anuluj” zostawia „Opakowanie puste”, „Usuń” usuwa
- Formularz dodawania nie przyjmuje 0, import blokuje wiersz z 0 komunikatem „Puste opakowanie — pomiń wiersz”
- Na `http://localhost:4331/szukaj` lek, którego jedyne opakowanie jest puste, daje „Nie masz tego leku” i sekcję „Puste opakowania”; czytnik ekranu ogłasza to zdanie
- PRD, roadmapa i AGENTS.md opisują nową regułę

**Implementation Note**: Po zielonych testach automatycznych zatrzymaj się na potwierdzenie testów ręcznych przez człowieka.

---

## Testing Strategy

### Unit Tests:

- `packQuantity` na kształtach z rejestru (butelka, blistry, bez `count`, dawki, ml, ułamek, kilka wpisów, wielkość liter).
- `rowIssues`: ponad limit nie blokuje, 0 blokuje.
- `checkVerdict` i funkcja pustych opakowań: tylko puste, puste + niepuste, ilość nieznana.

### Integration Tests:

- `test:api`: ponad limit zapisany (`POST`, import, `PATCH`), `MAX_QUANTITY + 1` → 400, 0 przy dodaniu → 400, 0 w `PATCH` → 200.
- `test:db`: F2 jako reguła, nie luka.

### Manual Testing Steps:

1. Dodaj Oxbrytę („1 butelka po 90 tabl.”) z ilością 90 — zapis bez ostrzeżenia, lista „90 z 90 tabl.”.
2. Zmień ilość na 95 — zapis z ostrzeżeniem.
3. Zmień ilość na 0 — dialog; „Anuluj” — „Opakowanie puste”; sprawdź lek na `/szukaj` — „Nie masz tego leku” + „Puste opakowania”.
4. Zaimportuj CSV z wierszami 0 i ponad limit — 0 blokuje, ponad limit ostrzega.

## Performance Considerations

Bez wpływu: reguła działa na już pobranym `units`, werdykt filtruje listę pozycji użytkownika w pamięci.

## Migration Notes

- Migracja tylko z komentarzem: merge, potem ręczny `npx supabase db push`; rollback przywraca poprzedni komentarz z `20261007120000_kit_items.sql:34`.
- Istniejące wiersze na opakowaniach z `count` + jednostką liczoną w sztukach zmieniają znaczenie (np. „1” = 1 butelka teraz czyta się jako 1 tabletka). Lokalnie takich wierszy nie ma; produkcję sprawdza autor SELECT-em z fazy 1 i decyduje o poprawce przed merge.

## References

- Related research: `context/changes/kit-quantity-semantics/research.md`
- Reguła ilości: `src/lib/kit-format.ts:57-71`, `:172-181`
- Werdykt: `src/lib/medicine-check-verdict.ts`, `src/components/registry/MedicineCheckResult.tsx`
- Pytanie F10: `context/foundation/roadmap.md:214`
- Poprzedni plan listy: `context/archive/2026-11-04-kit-browse-edit/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Ilość w sztukach

#### Automated

- [x] 1.1 Testy jednostkowe i komponentów przechodzą: `npm test`
- [x] 1.2 Typy przechodzą: `npx astro check`
- [x] 1.3 Lint przechodzi: `npm run lint`
- [ ] 1.4 Testy API przechodzą na serwerze z portu 4331 (za zgodą koordynatora)

#### Manual

- [x] 1.5 Formularz dodawania dla Oxbryty pokazuje „z 90 tabl.” i przyjmuje 90
- [x] 1.6 Lek „12 tabl.” pokazuje „z 12 tabl.”, syrop (ml) bez zmian
- [ ] 1.7 Autor uruchomił SELECT na produkcji i zdecydował o poprawce danych

### Phase 2: Ponad pojemność — ostrzeżenie zamiast blokady

#### Automated

- [ ] 2.1 Testy jednostkowe i komponentów przechodzą: `npm test`
- [ ] 2.2 Typy przechodzą: `npx astro check`
- [ ] 2.3 Lint i skan UI przechodzą
- [ ] 2.4 Migracja wchodzi na lokalną bazę (za zgodą koordynatora)
- [ ] 2.5 Testy bazy przechodzą (za zgodą koordynatora)
- [ ] 2.6 Testy API przechodzą (za zgodą koordynatora)

#### Manual

- [ ] 2.7 Ilość ponad opakowanie zapisuje się z ostrzeżeniem w formularzu i na liście
- [ ] 2.8 Import CSV z ilością ponad opakowanie ostrzega i pozwala zapisać stronę
- [ ] 2.9 Panel edycji przyjmuje ilość ponad limit z ostrzeżeniem

### Phase 3: Puste opakowanie i dokumentacja

#### Automated

- [ ] 3.1 Testy jednostkowe i komponentów przechodzą: `npm test`
- [ ] 3.2 Typy przechodzą: `npx astro check`
- [ ] 3.3 Lint i skan UI przechodzą
- [ ] 3.4 Testy bazy przechodzą (za zgodą koordynatora)
- [ ] 3.5 Testy API przechodzą (za zgodą koordynatora)

#### Manual

- [ ] 3.6 Zapis 0 otwiera dialog usuwania; „Anuluj” zostawia puste opakowanie, „Usuń” usuwa
- [ ] 3.7 Dodawanie i import odrzucają ilość 0
- [ ] 3.8 Na /szukaj puste opakowanie daje „Nie masz tego leku” i sekcję „Puste opakowania”
- [ ] 3.9 PRD, roadmapa i AGENTS.md opisują nową regułę
