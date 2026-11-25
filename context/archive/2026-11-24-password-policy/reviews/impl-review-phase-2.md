<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Password policy

- **Plan**: context/changes/password-policy/plan.md
- **Scope**: Phase 2 of 5
- **Reviewed phases**: 2
- **Date**: 2026-11-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence

- Files of the phase read against the plan: `src/components/auth/SignUpForm.tsx` (commit 5bd1772 and current state), `src/pages/api/auth/signup.ts`, `supabase/config.toml`, `tests/api/auth-signup.test.ts`, `tests/api/helpers.ts` (`accountCount`).
- `npx vitest run` on `SignUpForm.test.tsx`, `password-policy.test.ts`, `password-check.test.ts`: 40/40 passed. ESLint on the three phase files clean, `ui:scan` 0 hits.
- Step 2.4 re-checked on the running local Supabase: `POST /auth/v1/signup` with an 11-character password answers 422 `weak_password` ("at least 12 characters"), so `minimum_password_length = 12` is live.
- Follow-up F3 from the phase 1 review (islands must not import the list): no file in `src/components/` or `src/lib/` outside `src/lib/services/` imports `password-check` or `password-blocklist`; the only match in `password-policy.ts` is a comment.
- `smoke` and `test:api` were not re-run here; CI (`ci`, `smoke`) was green on PR #103.
- Manual 2.6 (browser sign-up) is marked done; nothing in the diff contradicts it, and it cannot be proven from code.

## Findings

### F1 — The counter "Jeszcze N znaków" counts what the validation does not

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/auth/NewPasswordHint.tsx:18
- **Detail**: After review fix ea032e0 `passwordLengthProblem` measures `password.normalize("NFC").trim()`, but the hint still uses `passwordLength(password)` on the raw value. A password of 11 characters plus a trailing space ("kot pije ml ") shows no counter (12 code points), yet submit answers "Hasło musi mieć co najmniej 12 znaków". The same hint feeds `ChangePasswordForm`. No test pins the padded case in the hint.
- **Fix**: Export one helper from `password-policy.ts` (the trimmed, NFC-normalised length) and use it in both `passwordLengthProblem` and `NewPasswordHint`; add a hint test for a trailing space.
- **Decision**: FIXED — `effectivePasswordLength` in `password-policy.ts` used by the rule and by `NewPasswordHint`; tests added (unit, SignUpForm, ChangePasswordForm)
