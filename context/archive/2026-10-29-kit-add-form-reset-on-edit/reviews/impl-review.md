<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-10: Formularz dodawania zapomina wybór po zmianie nazwy

- **Plan**: context/changes/kit-add-form-reset-on-edit/plan.md
- **Scope**: Full plan (Phase 1–2 of 2)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warnings, 1 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Dowody dla Success Criteria: na końcowym kodzie przeszły `npx astro sync`, `npm run lint`, `npx astro check` (0 błędów), `npx vitest run --project unit --project component` oraz `npm run build` (`/ci-check`, 2026-10-29). Test `KitAddForm.test.tsx` był czerwony bez poprawki (5 z 7) i po celowym zepsuciu `setVariant(null)` (5 z 7), zielony z poprawką (7 z 7). Usunięcie `onEdit` z `KitAddForm` daje błąd `ts(2741)`. Kontrola ręczna 1.5 wykonana w przeglądarce na `/apteczka` (agent, na prośbę użytkownika): dopisanie litery, skasowanie litery i wyczyszczenie pola usuwają formularz, ponowny wybór go przywraca. Commit `187bfd2` po ostatnim przebiegu zmienił tylko pliki w `context/changes/`.

## Findings

### F1 — Globalny ResizeObserver w setupie testów komponentów, poza planem

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: tests/setup-component.ts:9
- **Detail**: Plan zakładał podmianę tylko `fetch` i `Worker`. Test `KitAddForm` potrzebował jeszcze `ResizeObserver` (jsdom go nie ma, a `RadioGroupItem` z Radix go używa; bez tego każdy test kończył się `ReferenceError`). Atrapa jest globalna, więc dotyczy wszystkich testów komponentów i może w przyszłości ukryć błąd zależny od rozmiarów. Zmiana jest zgodna ze wzorcem sąsiedniej atrapy `scrollIntoView` i nie zmienia wyniku żadnego istniejącego testu (29 z 29 przechodzi), ale plan jej nie opisuje.
- **Fix**: Dopisać do planu krótki addendum, że faza 1 dodała no-op `ResizeObserver` do `tests/setup-component.ts` i dlaczego.
- **Decision**: FIXED (addendum dopisany w plan.md, pod Implementation Note fazy 1)

### F2 — `packageRequests` w pomocniku fetch nie jest używane

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/helpers/fetch.ts:39
- **Detail**: Plan kazał dodać listę wykonanych żądań o pakiety, więc metoda zgadza się z planem, ale żaden test jej nie wywołuje. To martwe API pomocnika, które może się rozjechać z rzeczywistością bez żadnego testu.
- **Fix**: Zostawić (zgodne z planem i symetryczne do `checkRequests`) albo użyć w teście, np. do sprawdzenia, że ponowny wybór pyta o pakiety właściwego leku.
- **Decision**: FIXED (asercja `packageRequests` w teście „another variant than before”)
