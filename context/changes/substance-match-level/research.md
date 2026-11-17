---
date: 2026-11-17T12:23:52+01:00
researcher: Claude (Opus 5.5), sesja worktree substance-match-level
git_commit: 2e99481e498d7261abde7201c82cd51ff21fbd1d
branch: feat/substance-match-level
repository: mamlek
topic: "S-06: poziom dopasowania substancji czynnych (precyzyjny / zawiera wszystkie / zawiera jeden) — punkt wyjścia w kodzie i danych"
tags: [research, medicine-check, substance-match-level, szukaj, rpc, registry]
status: complete
last_updated: 2026-11-17
last_updated_by: Claude (Opus 5.5)
---

# Research: poziom dopasowania substancji czynnych (S-06)

**Date**: 2026-11-17T12:23:52+01:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 2e99481
**Branch**: feat/substance-match-level
**Repository**: mamlek

## Research Question

Co trzeba wiedzieć przed planem S-06 (FR-016, US-01): jak dziś działa reguła i ścieżka sprawdzenia, gdzie wejdzie wybrany poziom, jak trzy poziomy zachowują się na pełnym rejestrze, co z nazwą powszechną (NPS) w poziomach (audyt F6, pytania 8 i 10 roadmapy) i jakie decyzje produktowe zostają dla autora.

## Summary

1. **Reguła jest w jednym RPC.** `public.medicine_check(bigint)` (`supabase/migrations/20261117120100_variant_key_btrim_medicine_check.sql:19-136`) zwraca `match: 'variant' | 'substance'` i `matchedBy`. „Substance” to dziś równość zbioru części NPS **albo** równość zbioru substancji (`:80-85`). Jedyny wywołujący w `src/` to `src/lib/services/medicine-check.ts:12`, przez `GET /api/kit/check?product=` (`src/pages/api/kit/check.ts:6,24-27`). Hook `useMedicineCheck.ts:35` wysyła tylko `product`. Ekran nie czyta `matchedBy` (jedyne wystąpienie w `src/` to typ `src/types.ts:127`).
2. **Nie ma miejsca na preferencje.** Nie ma tabeli ustawień, `localStorage`, cookies z preferencjami ani stanu w URL na `/szukaj`. Stan wyszukiwania żyje w React (`RegistrySearch.tsx:46-52`). Jest `src/components/ui/radio-group.tsx`, gotowy do przełącznika poziomu.
3. **Twierdzenie roadmapy „dla leków jednoskładnikowych wszystkie poziomy dają ten sam wynik” (`roadmap.md:188`) jest nieprawdziwe dla definicji z PRD.** „Zawiera wszystkie” = posiadany lek ⊇ szukany (`prd.md:269-270`). Dla leku jednoskładnikowego X to też każdy lek złożony z X. Pomiar (tylko zbiory substancji, warianty): 4 431 z 12 299 wariantów jednoskładnikowych ma więcej trafień przy „zawiera wszystkie” niż przy „precyzyjnym”. „Zawiera jeden” = „zawiera wszystkie” dla jednego składnika (0 różnic).
4. **Ścieżka po NPS niesie dużą część dzisiejszych dopasowań.** Wśród par wariantów, które dziś dają „ta sama substancja”, 82 554 pasują tylko po NPS, 7 236 tylko po zbiorze substancji, 383 450 obiema drogami. Wyjęcie NPS z „precyzyjnego” usunęłoby ok. 17% dzisiejszych dopasowań, głównie tej samej substancji zapisanej inaczej (sól / zasada, łacina / polski / angielski).
5. **Przegląd nazw z pytania 8 (część S-06 według `prd.md:258-260`).** Na dzisiejszej bazie to 312 nazw i 482 pary różnych, rozłącznych zbiorów substancji (inna jednostka niż „351 nazw / 9 236 par”, patrz Open Questions). Przejrzałem pełną listę par bez wspólnego rdzenia (184 nazwy). Prawie wszystkie to ta sama substancja zapisana inaczej. Wyjątki: NPS `-` (2 produkty, łączy „Krople żołądkowe z papaweryną” z wodą leczniczą „Zdrój”) to prawdziwy ogólnik spoza listy w `medicine_check_is_generic`. Do tego kilka mieszanin roślinnych i bakteryjnych o innym składzie pod jedną NPS (np. `hederae helicis folii extractum siccum` z dodatkiem lukrecji, `lactobacillus delbrueckii + fermentum` vs `lactobacillus acidophilus`).
6. **„Zawiera wszystkie” i „zawiera jeden” po samych nazwach substancji są wrażliwe na zapis.** Ta sama substancja w innej soli (`metformini hydrochloridum` / `metforminum`) nie przecina się po nazwie. Poziomy luźne muszą więc też mieć określoną ścieżkę po NPS (podzbiór / przecięcie części NPS), inaczej „luźniejszy” poziom może nie objąć dopasowania z „precyzyjnego”. Monotoniczność (precyzyjny ⊆ zawiera wszystkie ⊆ zawiera jeden) jest do zapewnienia w regule i do przypięcia testem.
7. **Skala przy lekach złożonych.** 2 642 warianty złożone: mediana trafień 4 (precyzyjny), 4 (zawiera wszystkie), 63 (zawiera jeden), maksimum 493 przy „zawiera jeden”. 622 warianty złożone nie mają żadnego trafienia przy „precyzyjnym”. „Zawiera wszystkie” ratuje 48 z nich, „zawiera jeden” 574.

## Detailed Findings

### Ścieżka sprawdzenia (kod)

- Ekran: `src/pages/szukaj.astro:54` montuje `RegistrySearch`. `RegistrySearch.tsx:71` renderuje `<MedicineCheckResult key={selected.id} …>`, więc wynik montuje się od nowa przy każdym wyborze. Zmiana poziomu przy wybranym leku wymaga ponownego zapytania (klucz albo parametr hooka).
- Hook: `src/components/hooks/useMedicineCheck.ts:24-64` przerywa poprzednie zapytanie przy zmianie `productId` i ma licznik ponowień. Poziom musi wejść do jego zależności, inaczej wróci problem nieaktualnego werdyktu (testy `RegistrySearch.test.tsx:216-326`).
- API: `src/pages/api/kit/check.ts:6` waliduje `product` zodem z `astro/zod`; 400 / 401 / 404 / 500 / 503 (`:17-38`). Nowy parametr poziomu potrzebuje walidacji enum i domyślnej wartości.
- Serwis: `src/lib/services/medicine-check.ts:12` wywołuje `rpc("medicine_check", { p_product_id })` i rzutuje wynik bez walidacji. Kształt odpowiedzi sprawdza dopiero `parseMedicineCheck` (`src/lib/medicine-check-verdict.ts:47-58`). Nie sprawdza `matchedBy`.
- Werdykt: `checkVerdict` (`medicine-check-verdict.ts:74-97`): „Masz ten lek”, „Masz lek z tą samą substancją czynną”, „Nie masz tego leku” (+ „Ani leku z tą samą substancją czynną” przy `comparable`).
- Komunikaty: `MedicineCheckResult.tsx:17` CAUTION („Ten sam skład czynny nie oznacza, że leki można zamieniać. Zapytaj farmaceutę lub lekarza.”), ogłoszenie `sr-only` zbudowane w `:93-95`, wyświetlane w `:132`.

### Reguła w bazie

- Zbiory: `medicine_check_common_name_set` (NPS rozbita po „+”) i `medicine_check_substance_set` (`20261010120000_medicine_check.sql:61-100`). Każda część-ogólnik zeruje cały zbiór, pusty zbiór nie pasuje do niczego.
- Ogólniki: lista 7 wartości + przedrostki „produkt ” / „preparat ” (`20261010120000_medicine_check.sql:37-56`). `-` nie jest na liście.
- Wariant (`variant`) jest niezależny od poziomu; poziom dotyczy tylko gałęzi `substance` (`…120100:77-85`).
- Kolejność elementów: warianty pierwsze, potem data ważności (`…120100:131`).
- Uprawnienia: execute tylko `authenticated` (CREATE OR REPLACE je zachowuje, `…120100:7-8`). Dodanie parametru zmienia sygnaturę: `create or replace` z innym zestawem argumentów tworzy **nową** funkcję (przeciążenie), więc migracja musi albo usunąć starą, albo dodać parametr z wartością domyślną przez `drop function` + `create` i powtórzyć `revoke`/`grant` (tak jak `registry_variant_packages` w `AGENTS.md`, rollback S-13).
- Inni wywołujący RPC: `tests/db/*` (`checkAs` w `tests/db/medicine-check-fixtures.ts:161-167`, `kit-access.test.ts:210`, `variant-key.test.ts:134,142,173`). Parametr z wartością domyślną zostawia je bez zmian.

### Pomiar na pełnym rejestrze (lokalna baza, tylko odczyt)

Stan bazy w chwili pomiaru: wersja listy 1794911068, stan rejestru 2026-11-16 (`snapshot_date` 2026-11-15T23:00Z), 20 351 produktów, 16 273 warianty, ostatnia migracja `20261117120100`, 194 pozycje w `kit_items`. Zapytania uruchomione w `BEGIN READ ONLY … ROLLBACK`. Liczby dla wariantów biorą zbiory z najmniejszego `id` wariantu (reprezentant), jak w regule.

- Liczności zbiorów (produkty): `ss=1, cs=1` 15 900; `ss=2, cs=2` 2 375; `ss=3, cs=3` 564; `ss=0, cs=1` 563 (brak substancji, tylko NPS); `ss=0, cs=0` 364. Produkty z ≥4 substancjami często mają pustą NPS (ogólnik), np. `ss=4..10, cs=0` ≈ 200.
- Poziomy, tylko po zbiorach substancji (porównanie z innymi wariantami):
  - jednoskładnikowe (12 299): `zawiera wszystkie > precyzyjny` w 4 431; `zawiera jeden > zawiera wszystkie` w 0; mediana 16 / 19 / 19.
  - złożone (2 642): `zawiera wszystkie > precyzyjny` w 668; `zawiera jeden > zawiera wszystkie` w 2 589; mediana 4 / 4 / 63; max przy „zawiera jeden” 493; bez trafienia przy precyzyjnym 622.
- Udział ścieżek dziś: pary wariantów tylko po NPS 82 554, tylko po substancjach 7 236, obiema 383 450.

### Przegląd nazw z pytania 8 i 10

- Zapytanie: kopia sekcji 3 z `context/archive/2026-10-10-testing-check-verdict-correctness/placeholder-measurement.sql:31-84`, z klasyfikacją par: wspólny rdzeń (jedna nazwa zawiera drugą po zdjęciu przedrostka cyfrowego) albo to samo pierwsze słowo.
- Wynik: 312 nazw, 482 pary; 92 nazwy, gdzie każda para ma wspólny rdzeń; 112, gdzie każda ma to samo pierwsze słowo; 184 pozostałe. Przejrzałem wszystkie 184 (po jednej parze na nazwę).
- Ocena: sól / zasada z innym rdzeniem (`natrii alendronas` / `acidum alendronicum`), język (`kwas acetylosalicylowy`, `cyclophosphamide`), synonimy (`adrenalinum` / `epinephrinum`, `matricariae flos` / `chamomillae anthodium`). Te łączą tę samą substancję, więc ścieżka po NPS działa zgodnie z zamiarem D1.
- Do decyzji: NPS `-` (2 produkty) — kandydat na listę ogólników. Mieszaniny o innym składzie pod jedną NPS (bluszcz + lukrecja, szczepy Lactobacillus, maść z ichtiolem i cynkiem pod `tormentillae unguentum compositum`, `paroxetinum` z substancją pomocniczą na liście substancji) — przy „precyzyjnym” po NPS dają „ta sama substancja”.
- Pytanie 10 (inne kształty ogólników, np. „Species sedativae”): w tej liście nie znalazłem nowego kształtu poza `-`. Sprawdzałem tylko nazwy z rozłącznymi zbiorami substancji. Nazwy, których produkty nie mają substancji wcale (`ss=0, cs≥1`, 583 produkty), ta metoda nie widzi.

### Testy, które przypinają regułę

- `tests/db/medicine-check.test.ts`: tabela przypadków `it.each` (`:766-775`). G14 (`:343-361`, przypadki `:667,675`) przypina, że ścisły podzbiór i nadzbiór nigdy nie pasują. Przy „zawiera wszystkie” nadzbiór zacznie pasować, przy „zawiera jeden” oba. G18 (`:708`) przypina dopasowanie po NPS przy niezwiązanych substancjach, G19 (`:716`) `matchedBy = common_name`, gdy pasują oba.
- `src/lib/medicine-check-verdict.test.ts`, `MedicineCheckResult.test.tsx` (CAUTION i ogłoszenie `:59-87`), `RegistrySearch.test.tsx` (nieaktualny werdykt), `tests/api/kit-input.test.ts:341-359` (walidacja `product`), `scripts/ui-shots.mjs:22,180,285-303` (stany `check-*`; glob `**/api/kit/check**` przyjmie nowy parametr).

### Nakładanie się z innymi wycinkami

- S-12 (`kit-quantity-semantics`): `MedicineCheckResult.tsx:4,7` importuje `KitItemDetails` i `todayIso` z `@/lib/kit-format`; `KitItemDetails` używa `formatExpiry`, `formatQuantity`, `isExpired`, `packLabel`. CTE `kit` w RPC czyta `quantity`, `expires_on`, `expiry_precision` z `kit_items` (`…120100:39-58`). Zmiana kolumn `kit_items` w S-12 i nowa definicja `medicine_check` w S-06 dotkną tej samej funkcji: kto merguje drugi, musi wziąć ciało RPC z migracji pierwszego.
- S-11 (`registry-search.ts`): ścieżka sprawdzenia go nie importuje. `MedicineSuggest` (wspólny z formularzami apteczki) używa workera wyszukiwania; S-06 nie musi go zmieniać, chyba że przełącznik poziomu trafi do tego komponentu.

## Code References

- `supabase/migrations/20261117120100_variant_key_btrim_medicine_check.sql:19-136` — aktualna definicja `medicine_check`
- `supabase/migrations/20261010120000_medicine_check.sql:37-100` — ogólniki i funkcje zbiorów
- `src/pages/api/kit/check.ts:6-38` — walidacja i kody odpowiedzi
- `src/lib/services/medicine-check.ts:12` — wywołanie RPC
- `src/components/hooks/useMedicineCheck.ts:24-64` — zapytanie, przerwanie, ponowienie
- `src/lib/medicine-check-verdict.ts:30-97` — parser i werdykt
- `src/components/registry/MedicineCheckResult.tsx:17-19,93-132` — zastrzeżenie i ogłoszenie
- `src/components/registry/RegistrySearch.tsx:46-71` — stan ekranu
- `src/types.ts:121-155` — typy odpowiedzi
- `src/components/ui/radio-group.tsx` — gotowy komponent na przełącznik
- `tests/db/medicine-check.test.ts:343-361,667-716,766-775` — G14, G18, G19

## Architecture Insights

- Plan `medicine-check` zostawił funkcje zbiorów osobno, „żeby S-06 mógł dodać parametr poziomu” (`context/archive/2026-10-09-medicine-check/plan.md:62,95`). Poziom naturalnie wchodzi jako parametr RPC z wartością domyślną, a porównanie `=` zamienia się na `=` / `@>` / `&&` zależnie od poziomu, dla obu ścieżek.
- Odpowiedź warto rozszerzyć o użyty poziom (echo), żeby ekran i testy nieaktualnego werdyktu mogły sprawdzić, że wynik pasuje do bieżącego poziomu, a nie tylko do `productId`.
- Kolejność elementów ma dziś dwa poziomy (wariant, potem data). Przy „zawiera jeden” wyników może być dziesiątki; do decyzji, czy sortować też po sile dopasowania (dokładny zbiór przed nadzbiorem przed przecięciem).

## Historical Context (from prior changes)

- `context/archive/2026-10-09-medicine-check/research.md:43-46` — D1 (NPS albo substancje, ogólniki), D2 (import równoległy), D3 (wycofane), D4 (ekran na `/szukaj`).
- `context/archive/2026-10-09-medicine-check/research.md:138` i `prd.md:254` — bezpiecznik „fałszywe wskazanie gorsze niż brak odpowiedzi”.
- `context/archive/2026-10-09-medicine-check/reviews/impl-review.md:62,111-119` — F2 (ogłoszenie) i F6 (`role="status"` zdjęte, czytnik ekranu niesprawdzony); przekazane S-06 (`roadmap.md:187`).
- `context/archive/2026-10-10-testing-check-verdict-correctness/research.md:265` — brak opisu, jak „NPS albo substancje” przekłada się na „zawiera wszystkie / jeden”; nadal otwarte.
- `context/archive/2026-10-10-testing-check-verdict-correctness/plan.md:38,45,310` — pomysł pokazania `matchedBy`; `common_name` wygrywa, gdy pasują oba.
- `context/archive/2026-10-10-testing-check-verdict-correctness/placeholder-measurement.md:19,115` — 309 nazw (2026-10-08), decyzja „odłożone”.
- `context/archive/2026-11-01-csv-kit-import/plan.md:37` — świadomie bez `localStorage` na szkic importu (jedyny precedens dotyczący zapisu stanu w przeglądarce).
- `context/archive/2026-11-17-variant-key-btrim/plan.md:45,56` — logika substancji zostawiona S-06; na wspólnej bazie migracje przez `npx supabase migration up`, nie `db reset`.
- `roadmap.md:367` wskazuje `context/changes/testing-check-verdict-correctness/placeholder-measurement.md`; plik jest dziś w `context/archive/2026-10-10-…` (nieaktualna ścieżka).

## Related Research

- `context/archive/2026-10-09-medicine-check/research.md`
- `context/archive/2026-10-10-testing-check-verdict-correctness/research.md`

## Open Questions

Decyzje autora (do planu):

1. **NPS w poziomach.** Czy „precyzyjny” = dokładny zbiór substancji **albo** dokładny zbiór części NPS (jak dziś)? Za: 82 554 par tylko po NPS, prawie zawsze ta sama substancja. Przeciw: dosłowne brzmienie FR-016 („dokładna zgodność zestawu”) i kilka mieszanin. Jak NPS wchodzi do „zawiera wszystkie” (części NPS ⊇) i „zawiera jeden” (części NPS ∩)?
2. **Domyślny poziom** (pytanie 4). Dane: „zawiera wszystkie” dodaje trafienia w 36% wariantów jednoskładnikowych (np. ibuprofen → leki złożone z ibuprofenem), „zawiera jeden” przy złożonych podnosi medianę z 4 do 63.
3. **Gdzie zapamiętać poziom**: tylko stan ekranu (reset po odświeżeniu), `localStorage`, parametr URL czy kolumna/tabela na koncie (migracja + RLS).
4. **Jak opisać poziomy laikowi** (uwaga Socratesa) i czy przy wyniku pokazywać, przez co pasuje (`matchedBy`, nadzbiór / przecięcie), skoro przy „zawiera jeden” użytkownik zobaczy leki o różnym składzie pod jednym tytułem.
5. **Tytuł werdyktu i zastrzeżenie przy poziomach luźnych.** „Masz lek z tą samą substancją czynną” przy „zawiera jeden” jest nieprecyzyjny (posiadany lek ma _jedną z_ substancji). Treść zastrzeżenia prawnego (pytanie 6) jest nadal nierozstrzygnięta.
6. **Ogólnik `-`** i mieszaniny o innym składzie pod jedną NPS: dopisać `-` do listy ogólników w tej zmianie?
7. **Czy roadmapa ma poprawić zdanie** „dla leków jednoskładnikowych wszystkie poziomy dają ten sam wynik” (`roadmap.md:188`)?

Luki:

- Liczby 351 nazw / 9 236 par (2026-11-16) liczą pary produktów; mój przegląd liczy pary różnych zbiorów (312 / 482). Nie odtworzyłem dokładnie liczby 351 — możliwa różnica stanu bazy (zmiana wariantów po S-14) albo inny sposób liczenia; dla decyzji 1 i 6 nie ma to znaczenia.
- Pomiar poziomów liczy tylko zbiory substancji; skutek ścieżki NPS przy poziomach luźnych zależy od decyzji 1 i nie jest zmierzony.
- Czytnik ekranu (F2/F6 z impl-review) wymaga testu ręcznego — nie do zbadania w researchu.
