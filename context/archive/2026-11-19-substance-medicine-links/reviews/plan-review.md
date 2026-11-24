<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Przejścia substancja ↔ lek i dodanie leku z wyszukiwania (S-17)

- **Plan**: context/changes/substance-medicine-links/plan.md
- **Mode**: Deep (Opus, high)
- **Date**: 2026-11-19
- **Verdict**: REVISE → SOUND po poprawkach
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

14/14 paths ✓, 9/9 symbols ✓, brief↔plan ✓

## Findings

### F1 — useRegistryMatch.test.tsx pominięty przy zmianie sygnatury

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Faza 1, zmiana 6 i bramka 1.2
- **Detail**: `useRegistryMatch.test.tsx:71,87,122,147` woła hook starą sygnaturą; plan go nie wymieniał.
- **Fix**: dopisać plik do zmiany 6 i bramki 1.2; `renderHook` tworzy uchwyt.
- **Decision**: FIXED (Fix in plan)

### F2 — Fabryka kitItem() w kit-import.test.ts złamie astro check

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Faza 4, zmiana 3 i bramka 4.5
- **Detail**: `src/lib/kit-import.test.ts:370` ma pełny literał `KitItem` bez `substances`.
- **Fix**: dopisać plik do fazy 4 z `substances: []`.
- **Decision**: FIXED (Fix in plan)

### F3 — Substancje pozycji apteczki nie muszą być substancjami reprezentanta

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Blind Spots
- **Location**: Faza 4, zmiana 3 i kontrola 4.6
- **Detail**: lista bierze substancje reprezentanta wariantu, apteczka substancje produktu opakowania. Pomiar (20 354 produkty, 71 643 opakowania): 1 158 opakowań (1,6%) ma link, który nie trafia w swój wariant; 93% to import równoległy. Obcinanie końcówek nie pomaga (718 → 718).
- **Fix A ⭐**: opisać ograniczenie z pomiarem i złagodzić 4.6.
- **Fix B**: substancje reprezentanta (migracja).
- **Decision**: FIXED (Fix A)

### F4 — ?lek zostaje w adresie /apteczka po porzuceniu preselekcji

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Blind Spots
- **Location**: Faza 3, zmiana 2
- **Detail**: odświeżenie po porzuceniu preselekcji przywraca pierwotny lek.
- **Fix**: `replaceState` usuwa `lek` przy pierwszej zmianie; asercja w teście.
- **Decision**: FIXED (Fix in plan)

### F5 — Niedopowiedziana liczba pozycji listy substancji

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Faza 2, zmiana 4 i Critical Implementation Details
- **Detail**: plan nie określał startowej liczby pozycji ani zachowania po „Pokaż więcej” i odświeżeniu.
- **Fix**: klik substancji `{ shown: 20 }`, „Pokaż więcej” `replaceState`, brak stanu daje 20.
- **Decision**: FIXED (Fix in plan)
