<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Withdrawn medicine in kit

- **Plan**: context/changes/withdrawn-medicine-in-kit/plan.md
- **Scope**: Full plan (5.6 to krok autora po merge'u, nieodhaczony)
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-11-16
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

Bramki uruchomione w przeglądzie:

- lint: PASS;
- `npx astro check`: PASS (0 błędów);
- vitest unit + component + registry: PASS (640/640);
- `ui:scan`: PASS (0 trafień);
- `test:db`: PASS (97/97).

`registry-import-check`, `smoke` i `test:api` wymagają bazy z fixture'ami, a lokalna baza ma teraz pełny rejestr. Nie uruchomiono ich ponownie. Przeszły w fazie 5 (5.2) w tej samej sesji, na tym samym kodzie.

Testy ręczne 3.6, 4.5 i 5.5 wykonał agent na prośbę użytkownika. Zrzuty są w scratchpadzie sesji. 5.6 czeka na autora.

## Findings

### F1 — `getPackage` gubi przyczynę błędu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/kit.ts:98
- **Detail**: Funkcja została w tej zmianie przepisana, ale `throw new Error(...)` nadal nie dostaje `{ cause: error }`. Siostrzana `getPackages` w tym samym pliku (:122) już je przekazuje. Twarda reguła z CLAUDE.md mówi: „no dropped error causes”. Luka była już na `main` (:75).
- **Fix**: Dopisać `{ cause: error }` do `throw` w `getPackage`.
- **Decision**: FIXED

### F2 — Test syntetyczny nie przypina kolejności kluczy przedstawiciela

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/registry-import-check.mjs:52-70
- **Detail**: Plan wymaga kolejności `(removed_at is not null), IR, id`. Wiersze 900000001–003 wybierają 900000003 przy obu kolejnościach, także przy zamienionej `IR, removed, id`, więc zamiana kluczy przejdzie niezauważona. Gałąź 1.2 łapała tylko całkowite usunięcie klucza. Rozstrzyga dopiero wariant, który ma tylko aktywny produkt IR i wycofany nie-IR: przy dobrej kolejności przedstawicielem jest produkt IR z krotką 6-elementową, a przy złej wycofany z `true`.
- **Fix**: Dodać wiersze 900000005 (aktywny, IR) i 900000006 (wycofany, NAR) jako jeden wariant i oczekiwać id 900000005 z krotką długości 6.
- **Decision**: FIXED (check przechodzi; przy zamienionej kolejności kluczy w funkcji, w wycofanej transakcji, przedstawicielem zostaje 900000006 z `true`, więc check jest czerwony)

### F3 — `uniquePacks` chowa wycofany bliźniak aktywnego opakowania

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/components/hooks/useVariantPackages.ts:47 (src/lib/kit-format.ts:41)
- **Detail**: `uniquePacks` zwija opakowania po kluczu `productId|label`, bez `withdrawn`. RPC zwraca aktywne pierwsze, więc wycofane opakowanie tego samego produktu z tą samą etykietą znika w dodawaniu i imporcie. Nie liczy się przy tym do reguły `packages.length === 1`, choć plan mówi „licząc też wycofane”. Wariant z jednym aktywnym opakowaniem i jego wycofanym bliźniakiem wybiera więc aktywne sam. W edycji pozycja na takim ukrytym opakowaniu trafia do gałęzi przypinania „obecne”, co opisuje komentarz w `KitItemEdit.tsx:54-58`. Zachowanie jest rozsądne, bo etykieta jest ta sama, a `medicine_check` dopasowuje po wariancie. Plan go jednak nie omawia i żaden test nie przepuszcza takiego bliźniaka przez `uniquePacks`.
- **Fix A ⭐ Recommended**: Zostawić zachowanie, dopisać je do planu (ADAPT) i przypiąć testem `KitAddForm`/`KitItemEdit` z bliźniakiem w atrapie RPC.
  - Strength: Sens jest zachowany, bo identyczne etykiety nie dają użytkownikowi realnego wyboru, a test zabezpieczy regułę przed przypadkową zmianą.
  - Tradeoff: Plan zmienia się po fakcie. Pozycja dodana teraz zawsze dostaje aktywny GTIN, nawet gdy ktoś ma w ręku wycofany.
  - Confidence: HIGH — komentarz w `KitItemEdit` już zakłada ten przypadek.
  - Blind spot: Nie sprawdzono, jak często taki bliźniak występuje w pełnym rejestrze (lokalnie 0 wycofanych).
- **Fix B**: Dodać `withdrawn` do klucza `uniquePacks`, żeby bliźniak był widoczny z oznaczeniem „wycofane”.
  - Strength: Dosłownie spełnia plan („licząc też wycofane”) i pozwala zapisać dokładny GTIN.
  - Tradeoff: Na liście pojawią się dwie identyczne etykiety, różne tylko oznaczeniem, a auto-wybór dla takich wariantów zniknie.
  - Confidence: MED — trzeba przejrzeć wszystkie miejsca, gdzie wołany jest `uniquePacks` (także `KitItemEdit`).
  - Blind spot: Wpływ na wiersze importu CSV z dużą liczbą opakowań.
- **Decision**: FIXED (Fix A: ADAPT w planie; testy z bliźniakiem w `KitAddForm.test.tsx` i `KitItemEdit.test.tsx` są czerwone po dodaniu `withdrawn` do klucza `uniquePacks`)

### F4 — Nieaktualne komentarze „active pack”

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/hooks/useVariantPackages.ts:16, src/lib/kit-request.ts:8
- **Detail**: „Loads the active packs of the variant…” oraz „One kit item: an active pack, …” przeczą nowemu zachowaniu, w którym wycofane opakowania są na liście i są przyjmowane.
- **Fix**: Poprawić oba komentarze na „packs of the variant, active and withdrawn” / „a pack (active or withdrawn)”.
- **Decision**: FIXED

### F5 — Decyzja o `REGISTRY_MIGRATIONS` bez ADAPT w planie

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/withdrawn-medicine-in-kit/plan.md:155 (tests/db/registry-import-fixtures.ts:16-23)
- **Detail**: Plan prosi o zapisanie decyzji jako ADAPT. Migracja trafiła do listy z komentarzem i opisem w AGENTS.md, ale ADAPT w planie brak. Strażnik (`registry-import.test.ts:351`, regex `auth.|kit_items`) przepuściłby też pominięcie tej migracji, bo jej nagłówek wspomina `kit_items`. Nowe zdanie w AGENTS.md („so must one that redefines a function the importer calls”) stoi zaraz po „(a guard test fails otherwise)”, a tej reguły żaden test nie egzekwuje.
- **Fix**: Dopisać ADAPT do sekcji fazy 1 w planie i w AGENTS.md zaznaczyć, że ta druga reguła jest ręczna (strażnik jej nie sprawdza).
- **Decision**: FIXED

### F6 — Etykieta „wycofany z rejestru” zdefiniowana w trzech miejscach

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/registry/MedicineSuggest.tsx:222, src/components/registry/RegistrySearch.tsx:26, src/components/kit/KitImportRow.tsx (`WithdrawnVariantNote`)
- **Detail**: Ten sam tekst ma różne rozmiary: `text-xs` w podpowiedziach i `text-sm` gdzie indziej. Dla opakowań powstał wspólny `WithdrawnPackMark` w `kit-fields.tsx`, a dla wariantu nie. Częściowo to celowe, bo podpowiedź jest gęstsza, ale tekst jest kopiowany.
- **Fix**: Wydzielić wspólny `WithdrawnVariantNote` (z opcjonalnym rozmiarem) i użyć go w trzech miejscach.
- **Decision**: FIXED (`src/components/registry/WithdrawnVariantNote.tsx`, nie `kit-fields.tsx`, żeby komponenty `registry/` nie importowały z `kit/`; użyty w czterech miejscach, także w `KitItemDetails`; rozmiary bez zmian)

## Triage

Wszystkie 6 ustaleń poprawione (F3 według Fix A). Po poprawkach: lint PASS, `ui:scan` PASS, `npx astro check` PASS (0 błędów), vitest unit + component + registry PASS (642/642).
