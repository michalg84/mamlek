---
date: 2026-11-18T11:13:05+01:00
researcher: Claude (Opus 5.5), sesja S-08
git_commit: 48e3f760b9cc29113c6c61ff1925af22b4255dbe
branch: feat/expiry-warning
repository: mamlek
topic: "S-08 expiry-warning: gdzie i jak dziś aplikacja pokazuje datę ważności, i co trzeba zmienić, żeby ostrzegała przed jej końcem na liście apteczki i przy wyniku sprawdzenia"
tags: [research, kit-list, medicine-check, expiry, verdict]
status: complete
last_updated: 2026-11-18
last_updated_by: Claude (Opus 5.5)
---

# Research: ostrzeżenie o kończącej się dacie ważności (S-08)

## Research Question

Roadmapa S-08 (FR-014): użytkownik widzi ostrzeżenie o zbliżającym się końcu ważności leku — razem z datą — na liście apteczki i przy wyniku sprawdzenia. Co dziś istnieje (dane, logika „przeterminowany”, miejsca wyświetlania, testy), gdzie wpiąć ostrzeżenie i jakie decyzje produktowe zostają otwarte (próg; werdykt przy przeterminowanych opakowaniach).

## Summary

- Data ważności jest już zapisywana i wyświetlana. W obu miejscach (lista apteczki i wynik sprawdzenia) pokazuje ją jeden komponent `KitItemDetails` (`src/components/kit/KitItemDetails.tsx:23-48`), który dziś dopisuje tylko „· przeterminowany” (`:43`) na podstawie `isExpired` (`src/lib/kit-format.ts:230-232`). Ostrzeżenie „kończy się ważność” można więc dodać w jednym miejscu i pojawi się w obu widokach.
- Wszystkie trzy ścieżki zapisu (`POST /api/kit`, import, `PATCH`) zapisują datę z dokładnością do miesiąca jako ostatni dzień miesiąca (`src/pages/api/kit/index.ts:57-58`, `src/pages/api/kit/import.ts:71-72`, `src/pages/api/kit/[id].ts:77-78`, `expiryToDate` w `src/lib/kit-format.ts:192`). Precyzja `day` istnieje w typie i bazie, ale żadna z tych ścieżek jej nie zapisuje. Próg „N dni” przy dacie miesięcznej działa więc względem końca miesiąca.
- `today` jest już przekazywane do `KitItemDetails` w obu widokach: na liście z serwera (`todayIso("Europe/Warsaw")`, `src/pages/apteczka.astro:115`), po hydracji z przeglądarki (`src/components/kit/KitList.tsx:348-352`); przy wyniku sprawdzenia z przeglądarki (`src/components/registry/MedicineCheckResult.tsx:115`). Nowa funkcja „kończy się wkrótce” potrzebuje tylko `expiresOn`, `today` i progu — bez zmian w API ani bazie.
- Werdykt (`checkVerdict`, `src/lib/medicine-check-verdict.ts:87-115`) nie patrzy na datę: pomija tylko puste opakowania (`quantity === 0`, `:76-78`, `:91`). Opakowanie przeterminowane (i każde inne) liczy się do „Masz ten lek”. Komunikat dla czytnika ekranu (`MedicineCheckResult.tsx:117-121`) nie wspomina o dacie.
- RPC `medicine_check` już sortuje pozycje po najbliższej dacie ważności w obrębie siły dopasowania (`supabase/migrations/20261118120000_medicine_check_match_level.sql:198`), więc pierwsze pozycje w każdej grupie wyniku to te, które kończą się najwcześniej. Lista apteczki sortuje od najnowszych (`src/lib/services/kit.ts:199-210`), nie po dacie.
- Otwarte decyzje produktowe (do planu): (1) próg ostrzeżenia, (2) czy i jak werdykt reaguje, gdy wszystkie / część pasujących opakowań są przeterminowane (lub kończą się), (3) czy ostrzeżenie ma być ogłaszane czytnikiem ekranu przy wyniku sprawdzenia.

## Detailed Findings

### Dane i zapis daty

- Typ pozycji: `expiresOn: string | null`, `expiryPrecision: "month" | "day" | null` (`src/types.ts:75-76` dla `KitItem`, `:144-145` dla `MedicineCheckItem`).
- Zapis: każda z trzech ścieżek API ustawia `expiry_precision: "month"` i `expiresOn = expiryToDate(month, year)` albo `null` (odnośniki w Summary). `isExpired` opisuje, że dla precyzji miesięcznej `expiresOn` to ostatni dzień miesiąca, więc opakowanie jest ważne do końca tego miesiąca (`src/lib/kit-format.ts:226-232`).
- Wyświetlanie: `formatExpiry` daje „MM/RRRR” dla miesiąca, „DD.MM.RRRR” dla dnia, „nieznane” dla `null` (`src/lib/kit-format.ts:197-204`).
- Nieznana data nigdy nie jest przeterminowana (`isExpired`, `:228`); analogicznie nie powinna dawać ostrzeżenia (wniosek, nie zapis w kodzie).

### Wspólny opis pozycji — `KitItemDetails`

- Używany przez listę (`src/components/kit/KitList.tsx:217-230`) i przez wynik sprawdzenia (`src/components/registry/MedicineCheckResult.tsx:33-43`, także w sekcji „Puste opakowania”, `:46-59`).
- Linia daty: `Ważny do: {formatExpiry(...)}` plus `· przeterminowany` w klasie `text-destructive` (`KitItemDetails.tsx:41-44`). To jedyne miejsce w `src/`, które dziś oznacza datę (przeszukane `src/` pod kątem `expir|ważno|przetermin`).
- Wzorzec etykiety stanu w tej samej linii już istnieje dla ilości: `· puste` (`:37-38`) i dla wycofanego leku (`WithdrawnVariantNote`, `:45`).

### Lista apteczki

- `apteczka.astro` renderuje `KitList` z `today={todayIso("Europe/Warsaw")}` (`src/pages/apteczka.astro:115`); wyspa po hydracji bierze datę przeglądarki przez `useSyncExternalStore` (`KitList.tsx:344-352`).
- Kolejność: `listKitItems` sortuje `created_at desc, id desc` (`src/lib/services/kit.ts:199-210`). Zmiana kolejności nie jest w opisie S-08.
- Test istniejący: „marks an expired pack and leaves a valid one unmarked” (`src/components/kit/KitList.test.tsx:108`), z udawanym `Date` (AGENTS.md, opis `npm test`).

### Wynik sprawdzenia i werdykt

- `checkVerdict` dzieli pozycje (bez pustych) na `variants` i `same`; tytuł „Masz ten lek · N opakowań” liczy wszystkie niepuste warianty, w tym przeterminowane (`src/lib/medicine-check-verdict.ts:87-97`).
- Kolor werdyktu wynika tylko z `kind` (`MedicineCheckResult.tsx:23-27`: variant = `bg-success`, substance = `bg-warning`, none = `bg-muted`).
- Live region: tytuł, szczegół, zastrzeżenie, notka „uncomparable” i liczba pustych opakowań (`MedicineCheckResult.tsx:117-121`, `emptyPacksAnnouncement` `:62-64`). Brak informacji o dacie.
- Wzorzec z S-12 dla pustych opakowań: wyjęte z werdyktu, pokazane osobną sekcją „Puste opakowania” i ogłoszone liczbą (`medicine-check-verdict.ts:80-85`, `MedicineCheckResult.tsx:45-64`). To gotowy precedens, gdyby przeterminowane miały być traktowane podobnie.
- `parseMedicineCheck` sprawdza `expiresOn` jako `null | string` (`medicine-check-verdict.ts:40`); `expiryPrecision` nie jest sprawdzane.
- Test DB i test komponentu: werdykt jest przepuszczany przez `parseMedicineCheck` i `checkVerdict` w `npm run test:db` (AGENTS.md), więc zmiana reguły werdyktu w `medicine-check-verdict.ts` wymaga uruchomienia też `test:db` (lokalna baza, za zgodą koordynatora).

### Tokeny

- `--warning` / `--warning-foreground` istnieją w `src/styles/global.css:27-28` (jasny) i `:66-67` (ciemny); `text-destructive` jest już użyty dla „przeterminowany”. Ostrzeżenie może korzystać z istniejących tokenów, bez edycji `global.css` (plik współdzielony z S-15).

## Code References

- `src/lib/kit-format.ts:192` — `expiryToDate` (ostatni dzień miesiąca)
- `src/lib/kit-format.ts:197-204` — `formatExpiry`
- `src/lib/kit-format.ts:211-224` — `todayIso(timeZone?)`
- `src/lib/kit-format.ts:226-232` — `isExpired`
- `src/components/kit/KitItemDetails.tsx:23-48` — wspólny opis pozycji, linia „Ważny do”
- `src/components/kit/KitList.tsx:344-352` — `today` serwer → przeglądarka
- `src/pages/apteczka.astro:115` — `today` z serwera w strefie Europe/Warsaw
- `src/lib/medicine-check-verdict.ts:76-115` — puste opakowania i `checkVerdict`
- `src/components/registry/MedicineCheckResult.tsx:23-27, 108-155` — styl werdyktu, live region, sekcje
- `supabase/migrations/20261118120000_medicine_check_match_level.sql:198` — kolejność pozycji (najbliższa data pierwsza)
- `src/lib/services/kit.ts:199-210` — kolejność listy (najnowsze pierwsze)

## Architecture Insights

- Logika daty jest czystą funkcją na stringach `YYYY-MM-DD` (porównanie leksykograficzne), testowaną w `src/lib/kit-format.test.ts` (projekt `unit`). Nowy predykat „kończy się wkrótce” pasuje do tego samego pliku i stylu.
- Jeden komponent opisu pozycji gwarantuje, że lista i wynik „czytają się tak samo” (komentarz `KitItemDetails.tsx:22`) — ostrzeżenie dodane tam spełnia FR-014 w obu miejscach naraz.
- Zmiana reguły werdyktu (jeśli zapadnie) to kod kliencki (`medicine-check-verdict.ts`), nie RPC — jak przy pustych opakowaniach w S-12; migracja nie jest potrzebna.

## Historical Context (from prior changes)

- `context/archive/2026-10-09-medicine-check/reviews/impl-review.md:82-100` — F4: „Masz ten lek” zostaje zielone, gdy wszystkie pasujące opakowania są przeterminowane; „przeterminowany” nie jest ogłaszany. Decyzja: przeniesione do S-08 (Fix A). Opcja B z tamtego przeglądu: dopisać „przeterminowane” do szczegółu werdyktu, gdy wszystkie warianty są przeterminowane; przypadek mieszany nierozstrzygnięty.
- `context/audits/prd-conformance/2026-11-16.md:177-190` — F10: puste i przeterminowane opakowanie daje zielone „Masz ten lek”; dopisane jako Unknown do S-08.
- `context/archive/2026-11-17-kit-quantity-semantics/plan.md:40` — S-12 rozstrzygnął tylko puste opakowania („Bez reguły »wszystkie przeterminowane« w werdykcie — to S-08”).
- PRD: FR-014 (`context/foundation/prd.md:194-195`), cel „ostrzega … zanim lek się przeterminuje” (`:69`), data z dokładnością do miesiąca (`:155`), okres ostrzeżenia do ustalenia (Open Question, `:364`; roadmapa pytanie 3, `roadmap.md:365`).

## Related Research

- `context/archive/2026-11-17-kit-quantity-semantics/research.md` — reguła pustych opakowań (precedens dla przeterminowanych).
- `context/archive/2026-10-09-medicine-check/` — powstanie werdyktu i `KitItemDetails`.

## Open Questions

1. **Próg ostrzeżenia** (roadmapa pytanie 3). Przy dacie miesięcznej (ostatni dzień miesiąca) próg w dniach i próg w miesiącach dają podobny efekt; do wyboru wartość i sposób liczenia.
2. **Werdykt przy przeterminowanych pasujących opakowaniach** — wszystkie przeterminowane: zostaje zielone z dopiskiem / wyjęte z werdyktu jak puste (S-12) / inny kolor; przypadek mieszany.
3. **Czytnik ekranu** — czy live region przy wyniku sprawdzenia ogłasza przeterminowane / kończące się opakowania (dziś nie ogłasza nawet przeterminowanych).
4. Poza zakresem S-08 wg roadmapy, ale możliwe do zapytania: sortowanie listy apteczki po dacie ważności.
