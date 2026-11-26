<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Reset zapomnianego hasła (password-reset)

- **Plan**: context/changes/password-reset/plan.md
- **Mode**: Deep
- **Date**: 2026-11-26
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Ścieżki 11/11 ✓, symbole 10/10 ✓, brief↔plan ✓, Progress 25/25 ✓. Weryfikacja w kodzie wykonana bez subagenta: middleware nie czyta `mamlek-recovery`, `@supabase/supabase-js` jest bezpośrednią zależnością, `setWeakPassword` i `readForm` istnieją, CI uruchamia serwer na porcie 4321, `password.ts` jest wzorcem nowego endpointu.

## Findings

### F1 — Limit maili w CI może wyłożyć test:api

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — decyzja szybka, poprawka oczywista i wąska
- **Dimension**: Blind Spots
- **Location**: Faza 1 (config.toml) i Faza 2 (budżet test:api)
- **Detail**: `config.toml` ma `email_sent = 2` na godzinę („Requires auth.email.smtp”). Lokalne CLI 2.117 go nie egzekwuje (eksperyment: kolejne resety dla 4 kont przeszły), ale CI instaluje `supabase/setup-cli@v3` z `version: latest`. Przebieg test:api wyśle 4–5 maili resetu plus powiadomienia; jeśli nowsze CLI zacznie liczyć limit przy Mailpit, test padnie w CI, a nie lokalnie. Brief wymienia ryzyko, plan go nie rozwiązuje.
- **Fix**: W kontrakcie fazy 1 podnieść `email_sent` (np. 100, tylko lokalnie, z komentarzem), w budżecie fazy 2 podać liczbę maili na przebieg.
- **Decision**: FIXED (Fix in plan: `email_sent = 100` w fazie 1, budżet maili w fazie 2)

### F2 — Brak kontraktu logowania błędów w reset-password

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — decyzja szybka, poprawka oczywista i wąska
- **Dimension**: Plan Completeness
- **Location**: Faza 2, punkt 4 (`src/pages/api/auth/reset-password.ts`)
- **Detail**: Dla forgot-password plan mówi „każdy błąd logowany z przyczyną”, dla reset-password tylko o kroku 6 (signOut others). Błędy `verifyOtp`, `getUser`, `updateUser` i przeniesienia sesji kończą się przekierowaniem z `?error=`; reguła z CLAUDE.md („no failures turned into redirects” bez logu) wymaga dla nich `console.error`, jak w `password.ts`.
- **Fix**: Dopisać do kontraktu, że każdy błąd Supabase w tym endpoincie trafia do `console.error` z przyczyną (bez tokenu i hasła).
- **Decision**: FIXED (Fix in plan: zdanie o `console.error` pod kontraktem reset-password)

### F3 — „Ważny godzinę” zależy od ustawienia na produkcji

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — decyzja szybka, poprawka oczywista i wąska
- **Dimension**: Blind Spots
- **Location**: Faza 1 (szablon), Faza 3 (tekst strony), Faza 4 (README, kryterium 4.4)
- **Detail**: Mail i „Sprawdź skrzynkę” obiecują link ważny godzinę. Lokalnie zgadza się to z `otp_expiry = 3600`, na produkcji decyduje Email OTP Expiration w panelu, którego lista ustawień w README nie wymienia.
- **Fix**: Dodać Email OTP Expiration = 3600 s do listy ustawień panelu w README (faza 4) i do kryterium 4.4.
- **Decision**: FIXED (Fix in plan: kontrakt README i kryterium 4.4 w bloku fazy i w Progress)
