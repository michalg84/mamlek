<!-- PLAN-REVIEW-REPORT -->

# Plan Review: S-01 Wyszukiwanie leku w rejestrze z podpowiedziami

- **Plan**: context/changes/registry-search-suggestions/plan.md
- **Mode**: Deep
- **Date**: 2026-10-02
- **Verdict**: REVISE → SOUND po poprawkach
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | PASS    |

## Grounding

8/8 ścieżek ✓; symbole ✓ (`PROTECTED_ROUTES` + `startsWith`, `countAs`/`checks`, krok 8 importu, kolumny `procedure_type`/`removed_at`/`position`/`snapshot_date`); brief↔plan ✓; Progress↔Phase ✓ (22/22). Brak `lessons.md` i `contract-surfaces.md`.

## Findings

### F1 — Wersja listy = id importu; zmiana formatu payloadu nie trafia do przeglądarki

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Faza 1 (`payload.version`), Faza 2 (`immutable`)
- **Detail**: Migracja zmieniająca funkcję (np. S-06) przebudowałaby listę pod tym samym `import_id`; przeglądarki z `immutable` trzymałyby stary kształt do następnego ręcznego importu.
- **Fix**: Kolumna `version bigint` podbijana przy każdym wywołaniu funkcji; `payload.version` = `version`; `import_id` informacyjnie; CI sprawdza `payload.version = version` i podbicie w teście syntetycznym.
- **Decision**: FIXED

### F2 — Sortowanie trafień przy każdym znaku z `localeCompare(…, "pl")`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Reguła dopasowania; Faza 3 `searchVariants`
- **Detail**: Kolejność w poziomie nie zależy od zapytania, a plan sugerował sort przy każdym znaku; „krótsza nazwa" i remis nierozstrzygnięte. Szacunek „~2 tys. trafień" przy 2 literach był zawyżony (research: „pa" 244 po początku nazwy, 866 „zawiera").
- **Fix**: Sort raz w `buildSearchIndex` (długość nazwy oryginalnej → `Intl.Collator("pl")` nazwa → moc → `id`), jedno przejście w `searchVariants`; decyzja użytkownika: dodatkowo `MIN_QUERY_LENGTH = 3`.
- **Decision**: FIXED (sort raz + próg 3)

### F3 — „moc (pełny tekst z listy)" vs moc przycięta do 80 znaków

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 3 §4 (karta wariantu)
- **Detail**: 276 produktów (np. Botox 81 znaków, Multimel N4-550E 1831) pokaże na karcie moc z „…".
- **Fix**: Karta pokazuje moc z listy (do 80 znaków); pełną pokaże S-03.
- **Decision**: FIXED

### F4 — Brak ścieżki błędu na `/szukaj` i w hooku po wygaśnięciu sesji

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 2 §2, Faza 3 §2 i §4
- **Detail**: Wyjątek odczytu wersji (np. Worker wdrożony automatycznie przed `db push`) → 500; 401 w hooku → bezużyteczne „Spróbuj ponownie".
- **Fix**: Strona pokazuje komunikat zamiast 500; hook zwraca `unauthorized`, komponent pokazuje link do logowania.
- **Decision**: FIXED

### F5 — Harness smoke zwraca tylko status i Location

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2 §4 (`scripts/smoke.mjs`)
- **Detail**: `request()` (`scripts/smoke.mjs:23-36`) zwraca `{ status, location }`; nowe kroki potrzebują treści, `Cache-Control` i wersji z poprzedniej odpowiedzi.
- **Fix**: `request()` zwraca też `headers` i `body`, oczekiwanie kroku dostaje opcjonalny `check(actual)`.
- **Decision**: FIXED
