<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Password policy

- **Plan**: context/changes/password-policy/plan.md
- **Scope**: Phase 1 of 5
- **Reviewed phases**: 1
- **Date**: 2026-11-24
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

Commit pod przegląd: `a96fd32` (gałąź `feat/password-policy`). Bramki uruchomione ponownie w przeglądzie: `npm test` (26 plików, 981 testów, z projektem `hooks`), `npm run lint`, `npx astro check` — wszystkie zielone (kod wyjścia 0).

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Notes (nie są findingami)

- ADAPT: plan podaje ścieżkę SecLists `Passwords/xato-net-10-million-passwords-1000000.txt`; na przypiętym commicie plik leży w `Passwords/Common-Credentials/`. Skrypt używa właściwej ścieżki.
- ADAPT: plan opisuje `passwordLength` jako `[...password].length`; reguła ESLint `no-misused-spread` to blokuje, więc licznik to pętla `for...of` (ta sama semantyka code pointów).
- Sprawdzenia mutacyjne (6 złamań kodu produkcyjnego i 1 złamanie danych listy) dały czerwone testy, pliki przywrócone `git checkout --`.
- Manualny krok 1.6 (przegląd listy) zostaje nieodhaczony do decyzji autora.

## Findings

### F1 — Flip roadmapy na `in-progress` rozjechał tabelę dla Prettiera i nie jest zacommitowany

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/roadmap.md:62
- **Detail**: Wartość `in-progress` jest dłuższa niż dotychczasowe wartości kolumny Status w tabeli „At a glance”, więc `prettier --check` na pliku zgłasza błąd (na `HEAD` plik jest czysty). Plik miał zmiany sprzed implementacji, więc flip został w working tree poza commitem fazy 1. AGENTS.md wymaga też `npm run roadmap:sync` po zmianie statusu; nie wykonano (potrzebuje `gh` ze scope `project`, z prawdziwego terminala).
- **Fix**: Uruchomić `npx prettier --write context/foundation/roadmap.md` (przeformatuje szerokość kolumny, tak jak zrobi to lint-staged przy commicie), zacommitować razem z planem (SHA fazy 1) i uruchomić `npm run roadmap:sync` z terminala.
- **Decision**: Fixed (Fix now): roadmap.md reformatted with Prettier and committed; `roadmap:sync` left to the author (follow-ups/review-fixes.md)

### F2 — Test „checks the length before the list” nie dowodzi kolejności

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/services/password-check.test.ts:37
- **Detail**: Wszystkie wpisy listy mają ≥ 12 znaków i ≤ 72 bajty, więc hasło za krótkie lub za długie nigdy nie jest na liście: zamiana kolejności sprawdzeń w `passwordProblem` nie zmieni wyniku żadnego z tych przypadków. Kolejność da się zaobserwować tylko na adresie e-mail (krótki adres równy hasłu).
- **Fix**: Dodać przypadek `passwordProblem("kot", "kot@example.com")` → `password_too_short` (długość przed e-mailem) i poprawić nazwę testu, żeby nie obiecywał kolejności względem listy.
- **Decision**: Fixed (Fix now): added the case `passwordProblem("kot", "kot@example.com")` and renamed the test

### F3 — Brak strażnika, że lista nie trafi do wyspy React

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/lib/services/password-check.ts:1
- **Detail**: Plan (Implementation Approach, Contract) wymaga, żeby `password-check.ts` importowały tylko trasy w `src/pages/api/`. Dziś nie robi tego nic poza komentarzem; fazy 2 i 3 dodają formularze importujące sąsiedni `password-policy.ts`, a pomyłka w imporcie wrzuciłaby ~200 kB listy do bundla przeglądarki bez żadnego czerwonego sygnału.
- **Fix A ⭐ Recommended**: Test jednostkowy skanujący `src/components/**` i `src/lib/*.ts` (poza `services/`) pod kątem importu `password-check` / `password-blocklist`
  - Strength: Tani, tekstowy, w stylu istniejących strażników (`ui-scan`); łapie błąd w CI w fazach 2–3.
  - Tradeoff: Skanuje tekst importów, więc nie złapie importu pośredniego przez inny moduł.
  - Confidence: HIGH — importy w repo to zwykłe ścieżki `@/lib/...`.
  - Blind spot: Re-eksport z `password-policy.ts` (nie istnieje, ale test go nie widzi).
- **Fix B**: Zostawić komentarz i pilnować w przeglądzie faz 2 i 3
  - Strength: Zero kodu.
  - Tradeoff: Opiera się na pamięci reviewera.
  - Confidence: MEDIUM — fazy mają przegląd, ale rozmiar bundla nie jest w nich mierzony.
  - Blind spot: Nie zmierzono bundla po fazach 2–3.
- **Decision**: ACCEPTED (Fix B): comment stays, check in the review of phases 2–3 (follow-ups/review-fixes.md)

### F4 — Komunikat `password_common` obejmuje też „równe adresowi e-mail”

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/auth-errors.ts (password_common)
- **Detail**: Plan zwraca jeden kod `password_common` także dla hasła równego e-mailowi, a tekst z planu mówi tylko o popularności. Komunikat rozszerzono o „albo przypomina Twój adres e-mail”, żeby podawał prawdziwy powód (NIST: „SHALL provide the reason”). To drobne odejście od planu na korzyść jego celu.
- **Fix**: Zostawić; zapisać w planie jako adaptację albo (jeśli autor woli) wydzielić kod `password_is_email` w fazie 2.
- **Decision**: Fixed (Fix now): kept the message; the adaptation is noted in follow-ups/review-fixes.md (the plan blocks stay read-only)

### F5 — Przegląd listy (krok manualny 1.6) czeka na autora; ogon listy zawiera śmieci i wulgaryzmy

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/services/password-blocklist.json
- **Detail**: Początek listy to klasyczne hasła klawiaturowe (`123qweasdzxc`, `qwerty123456`), słowa kontekstowe są na końcu (10 000–10 008), przykład z podpowiedzi też. W wpisach SecLists trafiają się artefakty spamu i wulgaryzmy (`mailcreated5240`, `polniypizdec0211`, `motherfucker`, `masterbating`). Blokowanie ich nie szkodzi (to prawdziwe hasła z wycieków). Żadnego wpisu, który „powinien przejść”, nie znaleziono w obejrzanych ~60 pierwszych i ostatnich 14 pozycjach.
- **Fix**: Autor przegląda początek i koniec listy i odhacza 1.6 albo zgłasza wpisy do usunięcia (generator filtrowałby je po przypiętym commicie).
- **Decision**: PENDING
