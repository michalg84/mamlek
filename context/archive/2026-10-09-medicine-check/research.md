---
date: 2026-10-09T21:17:17+02:00
researcher: michalg84 (z Claude Code)
git_commit: fabdb12b26b4f59bab1865bc79cbd6e5f797526f
branch: main
repository: michalg84/mamlek
topic: "S-03 medicine-check: co w kodzie i danych wspiera sprawdzenie leku przeciwko apteczce i co trzeba rozstrzygnąć"
tags: [research, s-03, medicine-check, registry, kit, substances]
status: complete
last_updated: 2026-10-09
last_updated_by: michalg84 (z Claude Code)
last_updated_note: "Dopisane decyzje autora (D1–D4) i pomiar spójności substancji/NPS na pełnym zrzucie 2026-09-23; zamknięte pytania otwarte 1–5."
---

# Research: S-03 — sprawdzenie leku przeciwko apteczce

**Date**: 2026-10-09T21:17:17+02:00
**Researcher**: michalg84 (z Claude Code)
**Git Commit**: fabdb12b26b4f59bab1865bc79cbd6e5f797526f
**Branch**: main
**Repository**: michalg84/mamlek

## Research Question

Wycinek S-03 (`context/foundation/roadmap.md:123-134`): użytkownik wybiera lek z podpowiedzi i widzi „masz ten lek” / „masz lek z tą samą substancją czynną” / „nie masz” — z substancjami, mocą, postacią, ilością i datą ważności po obu stronach oraz zastrzeżeniem przy wyniku „ta sama substancja” (FR-010, FR-011, FR-012, US-01; `context/foundation/prd.md:84-90`, `:165-170`). Pytania:

1. Jak rejestr modeluje substancje czynne, moc, postać i tożsamość leku i czy nadają się do porównania zestawów?
2. Co z istniejącego kodu (podpowiedzi, apteczka, API, widoki) można użyć, a czego brakuje?
3. Jakie wcześniejsze decyzje i odłożone sprawy wiążą S-03?

## Summary

- **„Ten sam lek” jest już zdefiniowany: klucz wariantu**, czyli `lower(name)`, `lower(coalesce(strength,''))`, `lower(coalesce(pharmaceutical_form,''))`. Decyzja S-01: „S-03 rozpozna „ten sam lek" po kluczu wariantu liczonym w bazie, nie po `id`” (`context/archive/2026-10-02-registry-search-suggestions/plan.md:63`). Ten sam klucz liczy istniejące RPC `registry_variant_packages(p_product_id)` (`supabase/migrations/20261007120000_kit_items.sql:89-127`), wykonywalne przez `authenticated`.
- **Pozycja apteczki wskazuje opakowanie, nie produkt** (`kit_items.package_id → registry_packages.id`, `kit_items.sql:18`). Droga do substancji: `kit_items → registry_packages.product_id → registry_product_substances`.
- **Odczyt apteczki nie wystarcza dla S-03.** `listKitItems` (`src/lib/services/kit.ts:117-146`) zwraca nazwę, moc, postać, podmiot, opakowanie, ilość, datę i `withdrawn`, ale nie zwraca substancji, `product_id` ani `common_name`. `/api/kit` eksportuje tylko `POST` (`src/pages/api/kit/index.ts:27`).
- **Podpowiedź ma substancje, ale nie nadaje się do wyliczenia klucza wariantu w przeglądarce.** `MedicineSuggest` emituje `RegistryVariant` z `id` reprezentanta i nazwami jego substancji (`src/types.ts:25-32`, `src/components/registry/MedicineSuggest.tsx:50-55`), lecz moc w liście jest ucięta do 80 znaków z „…” (`supabase/migrations/20261002130000_registry_search_list_version.sql:66`). Porównanie klucza po stronie klienta myliłoby się dla mocy dłuższych niż 80 znaków; porównanie w bazie przez `registry_variant_packages` lub nowe RPC tego problemu nie ma.
- **Substancje to wolny tekst bez identyfikatora i bez normalizacji** (`supabase/migrations/20261001120000_registry_tables.sql:65-75`; parser przepisuje `nazwaSubstancji` bez trim/lowercase, `scripts/lib/rpl-parser.mjs:92-105`). Dokładna równość zestawów (poziom „precyzyjny”) zadziała dla produktów o identycznie zapisanym składzie, ale w zrzucie 2026-09-23: 1 049 produktów nie ma substancji (1 042 z nich ma `nazwaPowszechnieStosowana`), a pisownia tej samej substancji bywa różna („Diosmectitum”/„Diosmectiteum”) — `context/archive/2026-10-01-registry-copy-load/research.md:50-65`. Normalizacja pisowni i fallback na nazwę powszechną zostały odłożone właśnie do S-03/S-06 (`context/archive/2026-10-01-registry-copy-load/plan.md:33`).
- **Proponowany kształt (do decyzji w planie):** jedno zapytanie po wyborze — np. `GET /api/kit/check?product=<id reprezentanta>` wywołujące RPC (security invoker, RLS apteczki działa), które zwraca pozycje apteczki z typem dopasowania i polami do porównania. Jedna podróż do bazy zamiast kilku sekwencyjnych odpowiada ryzyku z pre-mortem w `context/foundation/infrastructure.md:69`.
- **Rozstrzygnięte przez autora 2026-10-09** (sekcja „Decyzje”): „ta sama substancja” = zgodny zestaw z nazwy powszechnej **albo** zgodny zestaw substancji, z wykluczeniem ogólników; import równoległy = „ten sam lek”; wycofane opakowanie w apteczce liczy się, z etykietą; ekran = rozbudowa `/szukaj`. Otwarte pozostają: kolejność wielu dopasowań, prezentacja trzech stanów, domyślny poziom dopasowania (S-06).

## Decyzje (autor, 2026-10-09)

- **D1 — reguła „ta sama substancja czynna” na poziomie precyzyjnym:** pozycja apteczki pasuje, gdy **zestaw części nazwy powszechnej** (NPS rozbita po „+”, trim + lowercase + zwinięte spacje) jest równy zestawowi leku szukanego **albo** gdy równy jest **zestaw nazw substancji** (te same normalizacje). Ogólnik w NPS („Produkt złożony”, „Preparat złożony”, „Homeopatyczny produkt leczniczy”, „Preparat homeopatyczny”, „Preparat ziołowy”, „Produkt ziołowy”, „Produkt homeopatyczny” — lista z pomiaru, nie zamknięta) nigdy nie daje dopasowania po NPS; wtedy liczy się tylko zestaw substancji. Pusty zestaw nigdy nie pasuje. Uzasadnienie: oba pola osobno gubią przypadki soli tej samej substancji (patrz „Pomiar”); wynik i tak brzmi „masz lek z tą samą substancją czynną” z zastrzeżeniem, nie „masz zamiennik”.
- **D2 — import równoległy** (ta sama nazwa, moc, postać, inny importer) = „masz ten lek”, zgodnie z kluczem wariantu z S-01.
- **D3 — wycofane opakowanie w apteczce** nadal liczy się do wyniku (ten sam lek / ta sama substancja), z istniejącą etykietą „wycofany z rejestru”. Plan nie może więc użyć `registry_variant_packages` wprost (filtruje wycofane, `kit_items.sql:118-119`).
- **D4 — ekran:** rozbudowa `/szukaj` o wynik sprawdzenia; `/szukaj` staje się stroną startową i celem przekierowania po zalogowaniu.

## Pomiar spójności substancji i NPS (pełny zrzut 2026-09-23)

Źródło: lokalna kopia `Rejestr_Produktow_Leczniczych_calosciowy_stan_na_dzien_20260923_6.0.0.xml` (poza repo), sparsowana parserem z repo (`scripts/lib/rpl-parser.mjs`, który przepuszcza tylko produkty `rodzajPreparatu="ludzki"`, `:78`); skrypty jednorazowe w katalogu tymczasowym sesji, bez zapisu do bazy. Liczby dotyczą 20 258 produktów ludzkich — dlatego różnią się od liczb z `registry-copy-load/research.md:50-60`, które obejmowały cały zrzut (z weterynaryjnymi).

- Produkty bez substancji: 943; z nich 930 ma NPS niebędącą ogólnikiem.
- Unikalne nazwy substancji: 3 392 surowo, 3 387 po trim + lowercase (zwinięcie spacji nic nie dodaje). Normalizacja scala 5 grup pisowni, dotykających 60 produktów (np. „Sodu fluorek”/„sodu fluorek”). Wniosek: trim + lowercase prawie nic nie daje; problemem nie jest wielkość liter.
- NPS-ogólnik: 690 produktów („Homeopatyczny produkt leczniczy” 244, „Produkt złożony” 197, „Preparat złożony” 90, „Preparat homeopatyczny” 84, „Preparat ziołowy” 41, „Produkt ziołowy” 24, „Produkt homeopatyczny” 10). Brak NPS: 4. Substancja o nazwie „Preparat złożony”: 3 produkty.
- **NPS → substancje się rozjeżdżają:** wśród 1 712 nazw NPS (bez ogólników) występujących w ≥ 2 produktach z substancjami 423 grupy mają różne zestawy substancji surowo, 419 po normalizacji (7 356 produktów w tych 419 grupach). Przykłady: „Atorvastatinum” → substancje „atorvastatinum” 86 / „atorvastatinum calcicum” 42 / „atorvastatinum calcicum trihydricum” 13; „Amlodipinum” → „amlodipinum” 61 / „amlodipini besilas” 18 / „amlodipini maleas” 2; „Ibuprofenum” → „ibuprofenum” 179 / „ibuprofenum lysinum” 3. Część grup to ogólniki zapisane inaczej niż na liście wykluczeń (np. sam NPS ziołowy) — nie wydzielono ich z liczby 419.
- **Substancje → NPS też się rozjeżdżają:** 216 z 3 064 zestawów substancji ma więcej niż jeden zestaw NPS (2 394 produkty). Przykłady: Asbima (NPS „Amlodipinum + Valsartanum”) vs Dafiro (NPS „Amlodipini besilas + Valsartanum”), te same substancje; Neo-Angin tabletki vs Neo-Angin Spray („Mentholum” vs „Levomentholum” w NPS); Metafen (NPS „Ibuprofenum”) vs Lizymax (NPS „Ibuprofenum lysinum”), obie z substancją „ibuprofenum”.
- Liczba części NPS po „+” równa liczbie substancji: 18 729 produktów; różna: 212.
- Przykłady, na których oparto D1 (wynik reguły „jedno lub drugie”): Sortis vs Atoris → ta sama substancja (po NPS); Asbima vs Dafiro, Neo-Angin vs Neo-Angin Spray, Metafen vs Lizymax → ta sama substancja (po substancjach); Smecta bez substancji vs Smecta z „Diosmectitum” → ta sama substancja (po NPS); Afronis vs Aroma-Activ (oba NPS „Preparat złożony”, różne substancje) → nie masz.
- Niezmierzone: odsetek fałszywych wskazań reguły D1 w całym rejestrze (sprawdzono tylko powyższe przykłady) oraz pełna lista ogólników NPS.

## Detailed Findings

### 1. Model rejestru (substancje, moc, postać, tożsamość)

- `registry_products` (`registry_tables.sql:21-39`): PK `id` = RPL `produktLeczniczy@id`; `name`, `common_name`, `strength` (text), `pharmaceutical_form` (text), `atc_codes text[]`, `procedure_type`, `removed_at`. Moc i postać są na poziomie produktu, jako wolny tekst.
- `registry_product_substances` (`:65-75`): PK `(product_id, position)`, `name text not null`, `amount`, `unit`, `preparation_amount`, `preparation_unit`, `other_description` (wszystkie text). Brak tabeli słownikowej substancji i brak indeksu na `name`. Komentarz tabeli dopuszcza produkt bez substancji (`:78`).
- `registry_packages` (`:92-101`): PK `id` = RPL `opakowanie@id`, `product_id`, `gtin` (nullable, nieunikalny), `units jsonb`, `removed_at`.
- Rozkład w pełnym zrzucie 2026-09-23 (`context/archive/2026-10-01-registry-copy-load/research.md:50`): produktów z 0 substancji 1 049, z 1 — 17 781, z 2 — 2 912, z 3 lub więcej — 1 167 (maks. 46); 4 258 unikalnych nazw substancji.
- Przykłady z `scripts/fixtures/rpl-sample-v1.xml` (11 produktów; zbadane przez sub-agenta, nie wszystkie linie potwierdzone osobno):
  - Panadol Femina (`:141`, substancje `:149-150`): „Paracetamolum”, „Hyoscini butylbromidum” — czysty lek złożony.
  - Neo-Angin Spray (`:101`, `:109-111`): `common_name` „Alcohol 2,4-dichlorobenzylicus + Amylmetacresolum + Levomentholum”, a substancje „Alcohol dichlorobenzylicus”, „Amylmetacresolu”, „Mentholum” — NPS i substancje się różnią.
  - Vancomycin-MIP 500 (`:168`, `:178`): NPS „Vancomycinum”, substancja „Vancomycini hydrochloridum” (sól vs zasada).
  - Multimel N4-550E (`:202`, `:210-231`): 21 substancji, nazwy łacińskie i polskie, różna wielkość liter.
  - Sinupret (`:293`, `:299`): jedna „substancja” o nazwie „Preparat złożony” — dwa różne preparaty ziołowe z takim placeholderem dałyby równe zestawy.
  - Smecta (`:41`): pusta lista substancji, NPS „Diosmectitum”.
- Skala różnic sól/zasada, polskich nazw i placeholderów w pełnym rejestrze **nie została zmierzona** w tym researchu.

### 2. Stabilność kluczy przy imporcie

- Produkty i opakowania są upsertowane po `id` i nigdy nie są usuwane; brakujące dostają `removed_at` (`scripts/registry-import.mjs:229-242`). `kit_items.package_id` jest więc stabilny między importami.
- Substancje są kasowane i wstawiane na nowo tylko dla produktów obecnych w zrzucie (`scripts/registry-import.mjs:235-238`); produkt wycofany zachowuje ostatnie wiersze substancji. Wycofana pozycja apteczki da się więc nadal porównać po substancjach.
- Klucz wariantu jest wyliczany z tekstu, więc zmiana nazwy/mocy/postaci w RPL zmienia wariant (wniosek z definicji klucza; nie zmierzono, jak często RPL to robi).

### 3. Podpowiedzi (`MedicineSuggest`) i lista wyszukiwania

- Payload listy: `[id, name, strength, form, commonName, [substancje...]]` (`registry_search_list_version.sql:63-74`; typy `src/types.ts:8-32`). Substancje to nazwy reprezentanta w kolejności `position`, bez ilości.
- Reprezentant: produkt nie-IR przed IR, potem najniższe `id` (`context/archive/2026-10-02-registry-search-suggestions/plan.md:62`). Rodzeństwo wariantu (np. importy równoległe) może w zasadzie mieć inną listę substancji; lista niesie tylko substancje reprezentanta.
- `MedicineSuggest` (`src/components/registry/MedicineSuggest.tsx:10-15`, `:50-55`): props `version`, `onSelect(variant)`, opcjonalny `label`; po wyborze wpisuje `variant.name` do pola. Brak API resetu i wartości początkowej. Używany bez zmian w `KitAddForm` (`src/components/kit/KitAddForm.tsx:345-354`) i w `RegistrySearch` (`src/components/registry/RegistrySearch.tsx:41-54`, karta wariantu `:19-39`).
- Plan S-01 przewidział go do ponownego użycia na ekranie S-03, a `/szukaj` jako ekran, „który S-03 rozbuduje o wynik sprawdzenia” (`context/archive/2026-10-02-registry-search-suggestions/plan.md:135-137`).
- Pełną moc (w liście ucięta) „pokaże S-03” (`context/archive/2026-10-02-registry-search-suggestions/reviews/plan-review.md:54`).

### 4. Apteczka: schemat, usługi, API

- `kit_items` (`kit_items.sql:15-25`): `user_id` (domyślnie `auth.uid()`), `package_id`, `quantity` (nullable), `expires_on` + `expiry_precision` (oba null albo oba ustawione, `:24`). RLS: po jednej polityce właściciela na select/insert/update/delete dla `authenticated` (`:44-67`). Zakres = jedno konto (zgodnie z modelem „jedno konto na dom”, `prd.md:234-239`).
- Niezmienniki ilości/daty pilnuje tylko API; przez PostgREST da się zapisać nietypowe wartości, więc „S-03 check” ma je tolerować (`context/archive/2026-10-07-add-medicine-to-kit/reviews/impl-review.md:43-49`).
- Usługi w `src/lib/services/kit.ts`: `getVariantPackages` (`:45`, owija RPC), `getPackage` (`:64`), `addKitItem` (`:91`), `listKitItems` (`:117-146`), `countKitItemsWithPackage` (`:149`).
- Odczyt apteczki odbywa się dziś tylko w SSR `/apteczka` (`src/pages/apteczka.astro:21`, `Promise.all` z wersją listy).
- Formatowanie do ponownego użycia (`src/lib/kit-format.ts`, przeglądarkowe): `packLabel` (`:23`), `packQuantity` (`:39`), `formatExpiry` (`:62`; „MM/RRRR”, „DD.MM.RRRR” albo „nieznane”), `formatQuantity` (`:71`). Data z precyzją miesiąca nie może pokazywać dnia (`context/archive/2026-10-07-add-medicine-to-kit/plan.md:48`).

### 5. Gdzie liczyć dopasowanie

- **„Masz ten lek”**: porównanie w bazie przez klucz wariantu — np. `package_id` z `registry_variant_packages(id)` przeciwko `kit_items.package_id`, albo nowe RPC łączące po kluczu. Uwaga: `registry_variant_packages` zwraca tylko aktywne opakowania (`kit_items.sql:118-119`), więc wycofane opakowanie w apteczce nie zostałoby rozpoznane jako „ten sam lek”, jeśli użyć go wprost; nowe RPC musiałoby to uwzględnić.
- **„Ta sama substancja”**: substancje pozycji apteczki trzeba dociągnąć — rozszerzając select `listKitItems` (`registry_product_substances(name, position)`) albo w RPC. Substancje szukanego leku: z podpowiedzi (reprezentant) lub z bazy po `id`.
- **Klient vs serwer**: lista wariantów jest w przeglądarce tylko w Web Workerze (`src/components/hooks/useRegistrySearch.ts:31-150`); wątek główny dostaje do 20 wyników na zapytanie. Wariant z kluczem i substancjami po stronie serwera daje jedną podróż po wyborze. Wczytanie apteczki w SSR i porównanie w przeglądarce daje natychmiastowy wynik, ale wymaga obejścia ucięcia mocy.
- Według notatki z zamknięcia S-09 (pamięć agenta, nie plik repo) zapas wydajności listy w profilu slow to ok. 350 ms — S-03 nie powinien dokładać niczego do ścieżki ładowania listy.

### 6. Widoki, nawigacja, UI

- `PROTECTED_ROUTES = ["/dashboard", "/szukaj", "/apteczka"]` (`src/middleware.ts:4`); nowa ścieżka musi tu trafić.
- Topbar ma linki „Szukaj leku” i „Apteczka” (`src/components/Topbar.astro:16-21`); zmieszczenie trzeciego na 390 px niesprawdzone.
- Przekierowanie po zalogowaniu i strona startowa zostały odłożone do S-03; `/dashboard` jest celowo nieosiągalny z UI do czasu S-03 (`context/archive/2026-10-07-search-view-tokens/plan.md:64-66`, `reviews/impl-review.md:33-34`).
- Tokeny (`src/styles/global.css:8-26`): background, card, popover, primary, secondary, muted, accent, destructive, border, input, ring — brak tokenu ostrzeżenia/sukcesu. Komponenty shadcn: button, card, input, label, radio-group (brak alert/badge).
- `ui:scan` GUARDED (`scripts/ui-scan.mjs:19-26`) obejmuje m.in. `szukaj.astro`, `RegistrySearch.tsx`, `MedicineSuggest.tsx`, `apteczka.astro`, `KitAddForm.tsx`.
- Smoke (`scripts/smoke.mjs:123-224`) nie ma kroku sprawdzenia ani substancji; krok izolacji między kontami dla `/apteczka` jest wzorcem do skopiowania.

## Code References

- `supabase/migrations/20261001120000_registry_tables.sql:21-39` — `registry_products` (moc, postać, NPS, `removed_at`)
- `supabase/migrations/20261001120000_registry_tables.sql:65-75` — `registry_product_substances` (tekst, bez id)
- `supabase/migrations/20261001120000_registry_tables.sql:147-193` — RLS/granty rejestru: select dla `authenticated`
- `supabase/migrations/20261002130000_registry_search_list_version.sql:63-74` — budowa krotki listy, ucięcie mocy do 80 znaków
- `supabase/migrations/20261007120000_kit_items.sql:15-67` — `kit_items` i polityki właściciela
- `supabase/migrations/20261007120000_kit_items.sql:89-127` — `registry_variant_packages` (klucz wariantu)
- `scripts/lib/rpl-parser.mjs:92-105` — parsowanie substancji bez normalizacji
- `scripts/registry-import.mjs:229-242` — upsert, `removed_at`, wymiana substancji
- `src/lib/services/kit.ts:117-146` — `listKitItems` (bez substancji)
- `src/pages/api/kit/index.ts:27` — tylko `POST`
- `src/components/registry/MedicineSuggest.tsx:10-15,50-55` — props i emitowany wariant
- `src/types.ts:8-32,54-69` — `RegistryVariant`, `KitItem`
- `src/lib/kit-format.ts:23-71` — formatowanie opakowania, ilości, daty
- `src/middleware.ts:4` — chronione ścieżki

## Architecture Insights

- Tożsamość „tego samego leku” żyje w bazie (klucz wariantu), nie w `id` — reprezentant może się zmienić po imporcie. S-03 powinien liczyć dopasowanie w SQL, tak jak `registry_variant_packages`.
- Reguła S-03 ma dać się wywołać w pętli (FR-015 zaparkowane jako „pętla po logice z S-03”, `roadmap.md:242`) i rozszerzyć o poziomy dopasowania bez wyjątków (S-06, `roadmap.md:172`) — czyli funkcja porównania zestawów substancji z parametrem poziomu, dziś na stałe „precyzyjny”.
- Zmiana funkcji budującej listę wymaga podbicia `version` (`context/archive/2026-10-02-registry-search-suggestions/reviews/plan-review.md:33-35`) i ponownego `search:check`; S-03 nie musi jej zmieniać, jeśli substancje pobiera z bazy.
- Fałszywe wskazanie jest gorsze niż brak odpowiedzi (`prd.md:73-75`): każda normalizacja substancji musi być zachowawcza (np. trim + lowercase), a placeholdery typu „Preparat złożony” nie mogą dawać dopasowania.

## Historical Context (from prior changes)

- `context/archive/2026-10-02-registry-search-suggestions/plan.md:61-63` — klucz wariantu, reprezentant, „S-03 po kluczu wariantu, nie po id” (wspierane: RPC w `kit_items.sql` używa tego klucza).
- `context/archive/2026-10-02-registry-search-suggestions/research.md:52` — otwarte: czy import równoległy to „ten sam lek” (nadal nierozstrzygnięte wprost; klucz wariantu traktuje go jako ten sam lek).
- `context/archive/2026-10-01-registry-copy-load/plan.md:33` i `research.md:56-65,122,124` — normalizacja pisowni i fallback na NPS odłożone do S-03/S-06; skala niezmierzona (wspierane: parser nadal nie normalizuje).
- `context/archive/2026-10-07-add-medicine-to-kit/plan.md:48,130` i `plan-brief.md:21,48` — precyzja daty, flaga `withdrawn`, „S-03 potrzebuje pełnych danych opakowania po obu stronach”, ponowne użycie `kit-format.ts` (wspierane).
- `context/archive/2026-10-07-search-view-tokens/plan.md:64-66` — strona startowa i przekierowanie po logowaniu należą do S-03.
- `context/foundation/infrastructure.md:69` — pre-mortem (scenariusz hipotetyczny): limit 10 ms CPU na planie Free i cztery sekwencyjne zapytania na sprawdzenie; argument za jednym zapytaniem/RPC.

## Related Research

- `context/archive/2026-10-01-registry-copy-load/research.md`
- `context/archive/2026-10-02-registry-search-suggestions/research.md`

## Open Questions

1. ~~Reguła porównania substancji~~ — rozstrzygnięte: D1.
2. ~~Skala niespójności~~ — zmierzona (sekcja „Pomiar”); otwarty tylko odsetek fałszywych wskazań D1 w całym rejestrze i pełna lista ogólników NPS.
3. ~~Import równoległy~~ — rozstrzygnięte: D2.
4. ~~Wycofane opakowanie~~ — rozstrzygnięte: D3.
5. ~~Miejsce ekranu~~ — rozstrzygnięte: D4.
6. **Wiele dopasowań** — kolejność i grupowanie kilku pozycji apteczki (np. kilka opakowań, różne daty); brak wcześniejszej decyzji.
7. **Prezentacja wyniku** — trzy stany bez tokenów ostrzeżenia/sukcesu: nowe tokeny w `global.css` czy accent/muted/destructive; ewentualne dodanie `alert`/`badge` z shadcn.
8. **Domyślny poziom dopasowania** — Open Roadmap Question 4 (`roadmap.md:237`); roadmapa zakłada „precyzyjny” do czasu S-06.
