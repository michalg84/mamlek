<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Kopia Rejestru Produktów Leczniczych w bazie

- **Plan**: context/changes/registry-copy-load/plan.md
- **Mode**: Deep (Faza 1 + spójność całego planu; weryfikacja wykonana w głównym kontekście)
- **Date**: 2026-10-01
- **Verdict**: REVISE → SOUND po triage (4/4 FIXED)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 7/7 paths ✓ (migracja to nowy plik), 5/5 symbols ✓ (job `smoke`, `supabase start`, README „Scripts”/„CI”, AGENTS „Command tripwires”, tech-stack.md:24), dane ✓ (`opakowanie@id` jest unikalne: 88 411/88 411 w zrzucie 2026-09-23; 71 432 aktywne opakowania ludzkie), brief↔plan ✓, Progress↔Phase ✓ (6/8/10 wierszy).

## Findings

### F1 — RLS nigdzie nie jest sprawdzany na danych

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Faza 1 — Manual Verification (1.6); Faza 3 — skrypt sprawdzający
- **Detail**: Kryterium 1.6 (anon dostaje pustą listę) przechodzi zawsze, bo w fazie 1 tabela jest pusta. Wynik byłby taki sam przy wyłączonym RLS. Skrypt `registry-import-check.mjs` z fazy 3 nie sprawdza ról, więc w żadnej fazie nikt nie weryfikuje, że anon nie czyta rejestru, a `authenticated` czyta. Do tego „pusta lista, nie błąd uprawnień” zakłada, że Supabase nadal domyślnie daje rolom `anon` i `authenticated` uprawnienia do nowych tabel w `public`; migracja się na to cicho opiera.
- **Fix**: W migracji jawne `grant select on <4 tabele> to authenticated`. W `registry-import-check.mjs` (faza 3, uruchamiany w CI) dodać sprawdzenie ról na danych: w transakcji `set local role anon` → `count(*) = 0`, `set local role authenticated` → `count(*) > 0`. Kryterium 1.6 zawęzić do sprawdzenia strukturalnego: `pg_class.relrowsecurity` oraz `pg_policies` (jedna polityka SELECT dla `authenticated` na tabelę).
  - Strength: Test RLS działa na prawdziwych danych przy każdym PR, bez nowych zależności (`pg` i tak jest).
  - Tradeoff: Skrypt sprawdzający rośnie o kilka zapytań; kryterium 1.6 zmienia treść przed implementacją.
  - Confidence: HIGH — `set local role` działa dla właściciela tabel w Postgresie 17 i w lokalnym Supabase.
  - Blind spot: Nie sprawdzono, czy aktualne domyślne uprawnienia Supabase (CLI 2.x, nowe projekty) wciąż obejmują `anon`; jawny grant usuwa tę zależność dla `authenticated`.
- **Decision**: FIXED (plan: kontrakt RLS w fazie 1, kryterium 1.6, kontrakt skryptu sprawdzającego w fazie 3, Integration Tests)

### F2 — Nieustalona semantyka `updated_at`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Faza 1 — kontrakt `registry_products` i `registry_packages`; Faza 2 — kroki 4 i 7
- **Detail**: Plan definiuje `created_at`, `updated_at` bez typu, `not null` i wartości domyślnej, a w fazie 2 nie mówi, kiedy `updated_at` się zmienia. Najprostszy upsert (`DO UPDATE SET … updated_at = now()`) przy każdym codziennym imporcie przepisze wszystkie 20 258 produktów i 71 432 opakowania. Wtedy `updated_at` znaczy tylko „data ostatniego importu”, co dubluje `registry_imports`, a każdy import generuje około 92 tys. nowych wersji wierszy.
- **Fix A ⭐ Recommended**: `created_at`/`updated_at timestamptz not null default now()`; w fazie 2 upsert z `… DO UPDATE … WHERE (kolumny danych, removed_at) IS DISTINCT FROM (excluded…)`, więc `updated_at` = ostatnia rzeczywista zmiana.
  - Strength: Kolumna ma sens (np. dla S-03/S-07), a ponowny import bez zmian prawie nic nie zapisuje.
  - Tradeoff: Dłuższe zapytanie upsert z listą porównywanych kolumn.
  - Confidence: HIGH — standardowy wzorzec Postgresa `ON CONFLICT … WHERE`.
  - Blind spot: Liczba produktów zmienianych dziennie w RPL nie jest znana.
- **Fix B**: Usunąć `updated_at` z obu tabel (YAGNI); datę stanu daje `registry_imports.snapshot_date`.
  - Strength: Mniej kolumn i prostszy upsert.
  - Tradeoff: Brak informacji, kiedy produkt się zmienił; późniejsze dodanie kolumny wymaga migracji.
  - Confidence: MED — żaden znany slice nie wymaga dziś tej kolumny.
  - Blind spot: S-03/S-07 nie były przeglądane pod kątem tej potrzeby.
- **Decision**: FIXED via Fix A (plan: kontrakt fazy 1, kroki 4, 5 i 7 fazy 2)

### F3 — Niejednoznaczne liczniki `registry_imports`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 — kontrakt `registry_imports`
- **Detail**: Nie wiadomo, czy `products_removed` to liczba oznaczonych w tym imporcie, czy wszystkich nieaktywnych, ani czy `substances` i `packages_active` to stan po imporcie, czy liczba wczytanych rekordów. Skrypt sprawdzający (faza 3) i S-07 opierają się na tych liczbach.
- **Fix**: Dopisać do kontraktu: `products_active`, `substances`, `packages_active` = stan w bazie po imporcie; `products_removed` = produkty oznaczone jako usunięte w tym imporcie. Typy `int not null`.
- **Decision**: FIXED (plan: kontrakt `registry_imports` w fazie 1)

### F4 — `supabase db lint` nie zawodzi przy błędach

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 — Automated Verification (1.2)
- **Detail**: `npx supabase db lint` ma domyślnie `--fail-on none`, więc kończy się kodem 0 nawet przy błędach. Kryterium 1.2 wymaga więc czytania wyjścia zamiast sprawdzenia kodu wyjścia.
- **Fix**: Zmienić polecenie na `npx supabase db lint --fail-on error` (tytuł 1.2 w Progress bez zmian).
- **Decision**: FIXED (plan: kryterium 1.2 w fazie 1 i w Progress, bo plan nie był jeszcze implementowany)
