---
date: 2026-11-17T12:20:04+01:00
researcher: Claude (Opus 5.5), sesja worktree kit-quantity-semantics
git_commit: 2e99481e498d7261abde7201c82cd51ff21fbd1d
branch: feat/kit-quantity-semantics
repository: mamlek
topic: "S-12: co znaczy ilość w apteczce i jak ją liczyć dla opakowań z liczbą jednostek"
tags: [research, kit, quantity, kit-format, kit-import, medicine-check, registry-packages]
status: complete
last_updated: 2026-11-17
last_updated_by: Claude (Opus 5.5)
---

# Research: jednoznaczna ilość w apteczce (S-12)

**Date**: 2026-11-17T12:20:04+01:00
**Git Commit**: 2e99481 (main w chwili badania, kod nieskomitowany: tylko `context/changes/kit-quantity-semantics/`)
**Branch**: feat/kit-quantity-semantics
**Repository**: mamlek

## Research Question

Co dziś znaczy `kit_items.quantity`, które ścieżki kodu ją ograniczają, formatują i wyświetlają, jak wyglądają opakowania w rejestrze (ile z nich zmieni znaczenie przy regule „ilość w sztukach”) i jakie decyzje produktowe zostają otwarte, w tym pytanie F10 o puste opakowanie.

## Summary

- Dziś `quantity` znaczy „jednostki opakowania” tylko dla opakowań z jednym wpisem `units` i liczbowym `count`; limit to `count`, jednostka to `kind`, a `capacity` jest ignorowane (`src/lib/kit-format.ts:57-71`). Dla opakowań bez `count` (np. „12 tabl.”) nie ma limitu ani słowa jednostki, więc tam ilość w praktyce znaczy sztuki. Ta sama kolumna ma więc dwa znaczenia (potwierdza ryzyko z `roadmap.md:268`).
- Limit jest egzekwowany w API (`src/pages/api/kit/index.ts:52-54`, `import.ts:63-65`, `[id].ts:73-78`) i w UI (formularz, import, lista, panel edycji) przez tę samą funkcję `packQuantity`. Baza ma tylko `check (quantity >= 0)` (`supabase/migrations/20261007120000_kit_items.sql:19`), luka F2 jest przypięta testem.
- Dane rejestru (lokalna baza, pełny rejestr, 71 629 opakowań, SELECT tylko do odczytu): reguła „gdy opakowanie ma `capacity`, ilość to sztuki” **nie pasuje** do 25 210 opakowań z jednym wpisem, `count` i jednostką miary (ml, g, mg…), np. „4 fiol. 5 ml”, „1 butelka 100 ml”: tam sensowną ilością jest liczba fiolek/butelek, nie mililitry. Zmiana znaczenia dotyczy tylko 1 186 opakowań z `count` i policzalnym `capacity_unit` (1 002 z `count = 1`, jak Oxbryta „1 butelka 90 tabl.”, i 184 z `count > 1`, np. „2 inhalatory 60 dawek”).
- Osobna grupa: 42 100 opakowań z jednym wpisem bez `count` i z policzalną jednostką („12 tabl.”) — dziś bez limitu; przy semantyce „sztuki” mogłyby dostać limit = `capacity`. Tu wraca pomysł autora „blister 12 → 14” (ilość ponad pojemność z ostrzeżeniem).
- Dwa dokumenty wskazują przeciwne kierunki: `context/archive/2026-11-04-kit-browse-edit/plan.md:49` opisuje S-12 jako „opakowania zamiast jednostek, jednostka „opakowanie””, a wynik S-12 w `roadmap.md` mówi o tabletkach (sztukach). To decyzja autora, nie researchu.
- Werdykt „Masz ten lek” liczy pozycje, nie ilość: `medicine_check` tylko przekazuje `quantity` (`20261117120100_variant_key_btrim_medicine_check.sql:43,121`), a `src/lib/medicine-check-verdict.ts:60-70` liczy opakowania. F10 (puste opakowanie = zielony werdykt) jest otwarte; jego zmiana dotyka plików S-06.

## Detailed Findings

### Baza i rejestr

- `kit_items.quantity integer check (quantity >= 0)`, nullable (`supabase/migrations/20261007120000_kit_items.sql:19`); limit tylko w API (`:8`); komentarz kolumny: „Units left in the pack (e.g. tablets); NULL when unknown.” (`:34`). Komentarz już dziś mówi „tabletki”, kod robi co innego.
- Opakowanie to `registry_packages.units` jsonb: tablica `{count, kind, capacity, capacity_unit, info}` (`20261001120000_registry_tables.sql:97,111`); wartości są tekstem (np. `"count":"1"`, `"capacity":"0,5"`).
- `registry_variant_packages` i `medicine_check` zwracają `units` w całości (`20261117120000_variant_key_btrim.sql:145,159`; `20261117120100_variant_key_btrim_medicine_check.sql:47,120`), więc nowa reguła może zostać po stronie TS bez zmiany funkcji SQL.

### Kształty opakowań w rejestrze (lokalna baza, 2026-11-17, read-only)

Klasyfikacja jednostek jest moja, nie rejestru. Jako „policzalne” przyjąłem: `tabl.`, `kaps.`, `szt.`, `pastylek`, `pastylki`, `plastrów`, `plastry`, `plaster`, `tabletek`, `dawek`, `dawka`, `Systemów`, `Systemy`. Wątpliwe: `dawek`/`dawka` (inhalatory — czy użytkownik liczy dawki?), `Systemów`/`Systemy`; warianty pisowni (`tabl.`/`tabletek`, `plastrów`/`plastry`/`plaster`) trzeba ujednolicić w słowie jednostki.

| Kształt (opakowania z jednym wpisem `units`, chyba że zaznaczono) | Liczba | Dziś                                    | Przy „sztukach” tylko dla jednostek policzalnych |
| ----------------------------------------------------------------- | -----: | --------------------------------------- | ------------------------------------------------ |
| wszystkie opakowania                                              | 71 629 |                                         |                                                  |
| więcej niż jeden wpis `units` (np. amp.-strzyk. + igła)           |  1 533 | bez limitu, bez jednostki               | bez zmian                                        |
| `count` + policzalna `capacity_unit`, `count = 1`                 |  1 002 | limit 1, jednostka `kind` („1 butelka”) | limit = `capacity` (np. 90 tabl.)                |
| `count` + policzalna `capacity_unit`, `count > 1`                 |    184 | limit `count`                           | limit = `count × capacity`                       |
| `count` + jednostka miary (ml, g, mg, …)                          | 25 210 | limit `count`, jednostka `kind`         | bez zmian (liczba fiolek/butelek)                |
| `count` bez `capacity` (np. „10 sasz.”)                           |  1 555 | limit `count`                           | bez zmian                                        |
| `count` + `capacity` bez jednostki                                |      4 | limit `count`                           | bez zmian                                        |
| bez `count`, policzalna jednostka („12 tabl.”)                    | 42 100 | bez limitu, bez jednostki               | do decyzji: limit = `capacity` i słowo jednostki |
| bez `count`, jednostka miary                                      |     41 | bez limitu                              | bez zmian                                        |

- Najczęstsze kształty w grupie 1 002: „1 butelka 30 tabl.” (115), „1 butelka 100 tabl.” (57), „1 inhalator 60 dawek” (51), „1 poj. 120 dawek” (46).
- 3 464 wpisy mają `capacity` niecałkowite (przecinek dziesiętny); 10 najczęstszych wartości to wszystkie ml („0,5 ml” 883). Nie sprawdzałem, czy jakaś wartość niecałkowita ma jednostkę policzalną — do sprawdzenia przy planie (iloczyn `count × capacity` musi być liczbą całkowitą).

### Logika (`src/lib`)

- `MAX_QUANTITY = 100000` (`kit-format.ts:8`).
- `packLabel` (`kit-format.ts:23-33`) składa „<count> <kind> <capacity> <capacity_unit>” — etykieta opakowania już pokazuje „1 butelka 90 tabl.”, problem jest tylko w ilości.
- `packQuantity` (`kit-format.ts:57-71`): limit i jednostka tylko dla jednego wpisu z liczbowym `count > 0`; `capacity` pomijane.
- `parseQuantityInput` (`kit-format.ts:78-100`) i `formatQuantity` (`kit-format.ts:172-181`: „12 z 30 sasz.”, „12”, „nieznane”).
- `kit-request.ts:12,28`: zod `int().min(0).max(MAX_QUANTITY).nullable().optional()` — bez limitu opakowania (ten jest w handlerach).
- Import CSV: kolumna `ilosc` → `quantity` (`kit-import-csv.ts:51,60,153-161`); powody blokujące `invalid-quantity` i `quantity-over-pack` (`kit-import.ts:230-239`).
- Prompt czatu i pomoc importu: „ilosc — ile sztuk zostało, same cyfry” (`src/components/kit/KitImport.tsx:38,151`) — już dziś prosi o sztuki, więc przy semantyce „sztuki” prompt jest zgodny, a przy semantyce „opakowania” trzeba go zmienić.

### API

- `POST /api/kit`: 400 `Quantity exceeds the pack size (${max})` (`src/pages/api/kit/index.ts:52-54`).
- `POST /api/kit/import`: ta sama kontrola na pozycję, odrzucenie całej strony z `index` (`import.ts:63-65`).
- `PATCH /api/kit/[id]`: kontrola wobec nowego opakowania także przy zmianie samego opakowania (`[id].ts:73-78`).

### UI

- Formularz: etykieta „Ilość w opakowaniu (opcjonalnie)” (`KitAddForm.tsx:241`), limit z `packQuantity` (`:67,73`).
- `QuantityInput` dopisuje „z {max} {unit}” (`kit-fields.tsx:79-97`) — dla Oxbryty „z 1 butelka”.
- Lista: „Ilość:” i kontrola limitu (`KitList.tsx:66-73,97`), „Opakowanie puste” przy 0 (`:218-220`).
- `KitItemDetails.tsx:37-38`: „Ilość: {formatQuantity}” + „ · puste”. **Ten komponent jest używany też w wyniku sprawdzenia na `/szukaj`** (`MedicineCheckResult.test.tsx:96-103`), więc zmiana `formatQuantity` zmienia ekran wyszukiwania (pliki S-06).
- Panel edycji: kontrola limitu (`KitItemEdit.tsx:116,134`), pole `:269-286`.
- Import: komunikaty „Ilość większa niż w opakowaniu (najwyżej ${packMax})…”, „Najwyżej {packMax} w opakowaniu” (`KitImportRow.tsx:33-34,317-319,341-352`).

### Werdykt i puste opakowanie (F10)

- `medicine_check` nie filtruje po ilości (`20261117120100_variant_key_btrim_medicine_check.sql:43,121`); `medicine-check-verdict.ts:60-70` liczy „N opakowań”. Puste opakowanie daje zielone „Masz ten lek · 1 opakowanie”.

## Code References

- `src/lib/kit-format.ts:57-71` — `packQuantity`, źródło dwóch znaczeń ilości
- `src/lib/kit-format.ts:172-181` — `formatQuantity`
- `src/components/kit/kit-fields.tsx:79-97` — `QuantityInput` z sufiksem „z N jednostka”
- `src/pages/api/kit/index.ts:52-54`, `src/pages/api/kit/import.ts:63-65`, `src/pages/api/kit/[id].ts:73-78` — limit w API
- `src/lib/kit-import.ts:230-239` — blokada `quantity-over-pack`
- `src/components/kit/KitImport.tsx:38,151` — prompt „ile sztuk zostało”
- `supabase/migrations/20261007120000_kit_items.sql:8,19,34` — kolumna, brak limitu w bazie, komentarz
- `src/lib/medicine-check-verdict.ts:60-70` — werdykt liczy opakowania

## Testy, które przypinają dzisiejszą semantykę

- `src/lib/kit-import.test.ts:528-538` (blokada ponad opakowanie po obu stronach granicy)
- `src/components/kit/KitList.test.tsx:101,315,373` („z 30 tabletki”, 400 „Quantity exceeds the pack size”)
- `src/components/kit/KitItemEdit.test.tsx:105,353`
- `tests/api/kit-input.test.ts:137,299,468,649` — granice z `d.sized.size + 1`; `sized` wybiera najniższe `id` opakowania z liczbowym `count` 3–99 999 (`tests/api/helpers.ts:183-190`), więc przy nowej regule zapytanie musi liczyć limit tak samo jak `packQuantity`.
- `tests/db/kit-access.test.ts:276-291` — luka F2 (ilość ponad opakowanie przyjęta przez bazę)
- Prawdopodobnie też: `kit-format.test.ts`, `KitAddForm.test.tsx`, `KitImport.test.tsx`, `scripts/smoke.mjs`, `scripts/ui-shots.mjs` (nie czytałem w całości).

## Architecture Insights

- Jedna funkcja (`packQuantity`) zasila API, formularz, import, listę, panel edycji i wynik sprawdzenia — zmiana reguły w jednym miejscu zmienia wszystkie ekrany i granice testów API.
- Wariant „reguła w TS” (sztuki gdy `capacity_unit` policzalne) nie wymaga zmiany schematu; wariant „kolumna jednostki ilości” wymaga migracji `kit_items` (timestamp po `20261117120100`) i zmian w zod, serwisie i typach.

## Historical Context (from prior changes)

- `context/archive/2026-10-07-add-medicine-to-kit/plan.md:47` — reguła S-02: limit = `count` jedynego wpisu, jednostka = `kind`; `capacity` nieomówione (żaden dokument nie mówi, dlaczego je pominięto).
- `context/archive/2026-10-07-add-medicine-to-kit/reviews/impl-review.md` F1/F2 — `MAX_QUANTITY` jako ochrona; luka F2 (limit tylko w API) zaakceptowana, odłożona 2026-10-17.
- `context/foundation/prd.md:152,155` — FR-003 „pozostała ilość; jednostka i wielkość opakowania pochodzą z rekordu rejestru”; v3: „górny limit to wielkość opakowania z rejestru, a gdy rejestr jej nie podaje — 100000”. PRD nie rozstrzyga sztuk vs opakowań.
- `context/foundation/roadmap.md:268` — zgłoszenie z testu ręcznego S-04 (2026-11-03): Oxbryta przyjmuje najwyżej 1.
- `context/archive/2026-11-04-kit-browse-edit/plan.md:49` — „Semantyka ilości z S-12 (opakowania zamiast jednostek, jednostka „opakowanie”)” — **sprzeczne** z wynikiem S-12 w roadmapie (sztuki).
- `context/archive/2026-11-04-kit-browse-edit/plan.md:53` — puste opakowanie nadal liczy się jako „masz już”, decyzja do ewentualnej zmiany w S-12.
- `context/audits/prd-conformance/2026-11-16.md:177-190` — F10, bez konkretnej reguły; Unknown dopisane do S-08 „(ewentualnie w S-12)” (`roadmap.md:214`).

## Related Research

- `context/archive/2026-11-04-kit-browse-edit/research.md:131,133` — pytania o kolejność S-05/S-12 i o ilość 0 w werdykcie.

## Open Questions (decyzje autora)

1. **Kierunek (blokujące):** ilość w sztukach dla opakowań z policzalną `capacity_unit` (wynik S-12 w roadmapie) czy w opakowaniach (S-05 `plan.md:49`)?
2. **Mechanizm:** reguła w TS bez migracji (sztuki, gdy `capacity_unit` z listy policzalnych) czy nowa kolumna jednostki ilości w `kit_items`?
3. **Lista jednostek policzalnych:** czy `dawek`/`dawka` (inhalatory) i `Systemów` liczyć jako sztuki?
4. **Opakowania bez `count` („12 tabl.”, 42 100):** dodać limit = `capacity` i słowo jednostki, czy zostawić bez limitu?
5. **Ilość ponad pojemność:** blokada (dziś) czy ostrzeżenie (pomysł „blister 12 → 14”)?
6. **Istniejące wiersze na produkcji:** czy są pozycje na 1 186 opakowaniach z `count` + jednostką policzalną (wartość „1” znaczyłaby dziś „1 butelka”)? Lokalnie 0 z 194 wierszy (baza testowa, niereprezentatywna). Potrzebny SELECT tylko do odczytu na produkcji, wykonany przez autora.
7. **F10:** czy S-12 zmienia werdykt dla pustego opakowania? Dotyka `medicine-check-verdict.ts` / `medicine_check` (teren S-06); naturalniej w S-08 razem z „wszystkie przeterminowane”.

## Production data check (faza 1, krok autora)

Przed merge autor uruchamia na produkcji poniższe zapytania (tylko odczyt, np. w SQL Editor Supabase albo w transakcji `begin read only`). Agent ich na produkcji nie uruchamia; lokalnie zostały sprawdzone tylko pod kątem składni.

1. Wiersze `kit_items` na opakowaniach, którym zmienia się znaczenie ilości: jeden wpis `units`, `count` i `capacity` jako dodatnie liczby całkowite, `capacity_unit` ze zbioru jednostek liczonych w sztukach (ten sam co w `packQuantity`). Dotąd ilość znaczyła tu `kind` (np. „1” = 1 butelka), po zmianie znaczy sztuki (1 tabletka).

```sql
select pk.units->0->>'count' as count, pk.units->0->>'kind' as kind,
       pk.units->0->>'capacity' as capacity, pk.units->0->>'capacity_unit' as capacity_unit,
       k.quantity, count(*) as rows, count(distinct k.user_id) as users
  from kit_items k
  join registry_packages pk on pk.id = k.package_id
 where jsonb_array_length(pk.units) = 1
   and btrim(coalesce(pk.units->0->>'count', '')) ~ '^0*[1-9][0-9]*$'
   and btrim(coalesce(pk.units->0->>'capacity', '')) ~ '^0*[1-9][0-9]*$'
   and lower(btrim(pk.units->0->>'capacity_unit')) in
       ('tabl.', 'tabletek', 'kaps.', 'szt.', 'pastylek', 'pastylki', 'plastrów', 'plastry', 'plaster', 'systemów', 'systemy')
 group by 1, 2, 3, 4, 5
 order by rows desc;
```

2. Wiersze z ilością 0 (puste opakowania, istotne dla fazy 3):

```sql
select count(*) as rows, count(distinct user_id) as users from kit_items where quantity = 0;
```

Jak czytać wynik: brak wierszy w zapytaniu 1 oznacza, że poprawka danych nie jest potrzebna. Wiersze z ilością równą `count` (zwykle 1) najpewniej znaczą „pełne opakowanie” i po zmianie pokazałyby 1 tabletkę: autor decyduje, czy je poprawić (np. ilość = `count × capacity`) albo zostawić.
