<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Ekrany auth po polsku na tokenach aplikacji

- **Plan**: context/changes/auth-screens-ui/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-11-19
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 8 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

Bramki po merge `main` (kod wyjścia samych poleceń): lint 0, `astro check` 0 błędów, `ui:scan` 0 trafień, vitest unit+component+registry 821/821, `npm run build` OK, `grep bg-cosmic src` pusty. Otwarte wiersze Progress: 1.5 (`test:api`, pokrywa CI), 1.8 (produkcja po deployu), 3.7 (E2E, opcjonalne).

## Findings

### F1 — Smoke nie sprawdza sesji założonej przez rejestrację

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:156-160
- **Detail**: Główna zmiana zachowania (rejestracja z sesją kończy się na `/szukaj`) jest sprawdzana tylko nagłówkiem `Location`. Następny krok loguje się ponownie, więc zalogowane kroki działają na sesji z logowania. Gdyby ciasteczka z `signUp` nie trafiły do 302, CI zostałby zielony. Gałąź `/auth/signup` middleware nie ma kroku smoke.
- **Fix**: Dodać krok tuż po „signup creates account": `GET /auth/signup` → 302 `/szukaj`.
- **Decision**: FIXED

### F2 — AGENTS.md nie opisuje jednej treści confirm-email

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: AGENTS.md:29
- **Detail**: Plan (faza 5, pkt 3) prosi, by „Auth flow" opisywała jedną treść `confirm-email`. Jest tylko lista stron.
- **Fix**: Dopisać w linii o stronach auth: `confirm-email` has a single "Sprawdź skrzynkę" content, no DEV branch.
- **Decision**: FIXED

### F3 — Middleware nie łapie `/auth/signin/` z ukośnikiem

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:38
- **Detail**: Porównanie ścieżki jest dokładne, a Astro ma `trailingSlash: "ignore"`, więc zalogowany na `/auth/signin/` widzi formularz. Nie jest to obejście, tylko luka UX; `PROTECTED_ROUTES` ukośnik obsługuje.
- **Fix**: Znormalizować ścieżkę (`pathname.replace(/\/$/, "")`) przed porównaniem.
- **Decision**: FIXED

### F4 — Zły login ze starej karty zalogowanego: komunikat znika

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:38, src/pages/api/auth/signin.ts:20
- **Detail**: Zalogowany użytkownik z formularzem w bfcache/starej karcie wysyła zły login, `signin.ts` kieruje na `/auth/signin?error=…`, a middleware od razu na `/szukaj`. Użytkownik zostaje na starym koncie bez komunikatu. Przypadek rzadki i bezpieczny.
- **Fix**: Zaakceptować świadomie.
- **Decision**: SKIPPED (accepted)

### F5 — Przycisk zablokowany po przerwaniu nawigacji

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useSubmitting.ts:10-18
- **Detail**: Gdy użytkownik przerwie nawigację (Esc/Stop) w trakcie POST, `submitting` zostaje `true` do przeładowania strony. Żaden test w CI nie sprawdza prawdziwego natywnego POST.
- **Fix**: Zaakceptować (przeładowanie pomaga) albo dodać timeout resetu.
- **Decision**: SKIPPED (accepted)

### F6 — E2E setup klika przycisk po nazwie, która się zmienia

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/auth.setup.ts:16-22
- **Detail**: Pętla `toPass` klika `getByRole("button", { name: "Zaloguj się" })`; po submit przycisk nazywa się „Logowanie…" i jest `disabled`. Przy POST dłuższym niż 5 s kolejna próba nie znajdzie przycisku. E2E nie działa w CI.
- **Fix**: Klikać `page.locator('button[type="submit"]')`.
- **Decision**: FIXED

### F7 — SubmitButton bez `min-h-11` i `motion-reduce`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/auth/SubmitButton.tsx:13,16
- **Detail**: Siostrzany `KitAddForm.tsx:284` ma `min-h-11 w-full` i `animate-spin motion-reduce:animate-none`; pola auth mają `min-h-11`, przycisk nie.
- **Fix**: Dodać `min-h-11` i `motion-reduce:animate-none`.
- **Decision**: FIXED

### F8 — FieldError to kopia InlineError; brak przeniesienia fokusu

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/components/auth/FieldError.tsx:10-16
- **Detail**: Prawie dosłowna kopia `InlineError` z `src/components/kit/kit-fields.tsx` (plan świadnie kazał kopiować, bo to obszar S-08). Po nieudanym submit fokus nie przechodzi na błędne pole, jak w `KitAddForm`.
- **Fix**: Zostawić kopię; wspólny komponent to osobna zmiana po S-08.
- **Decision**: SKIPPED (copy per plan)

### F9 — Luki w testach komponentów

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/components/auth/SignUpForm.test.tsx:51-64
- **Detail**: Brak asercji dla błędu „Powtórz hasło", dla „Podaj poprawny adres e-mail" i „Hasło musi mieć co najmniej 6 znaków" oraz dla atrybutów `name="email"`/`"password"` (kontrakt z API).
- **Fix**: Dopisać te przypadki do testów obu formularzy.
- **Decision**: FIXED

### F10 — Dodatek poza planem: useSubmitting

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/hooks/useSubmitting.ts
- **Detail**: Hook nie jest w planie, ale realizuje zaplanowany stan `submitting` i reset na `pageshow`, zgodnie z regułą „hooks w src/components/hooks/".
- **Fix**: Brak; odnotować w archiwum.
- **Decision**: NOTED (mention at archive)
