<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Password policy

- **Plan**: context/changes/password-policy/plan.md
- **Scope**: Phase 3 of 5
- **Reviewed phases**: 3
- **Date**: 2026-11-24
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Gates re-run for this review (exit codes): lint 0, ui:scan 0, astro check 0, vitest unit+component+registry 954 passed. `test:api` and `smoke` were not re-run (rate-limited local pool); both were green at commit 355da11.

## Findings

### F1 — The marker lives in user-writable `user_metadata`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:56-58, src/pages/api/auth/signin.ts:301
- **Detail**: A signed-in user can clear `password_change_required` with `supabase.auth.updateUser({ data: { password_change_required: false } })` from a browser console (the publishable key is public), without changing the password. The gate is therefore a nudge, not an enforcement. The risk is bounded (the user only harms their own account, and the marker is set again at the next sign-in), but the plan presents it as a gate and does not mention the gap.
- **Fix**: Record the accepted gap in the plan (Critical Implementation Details) and in the phase 5 docs; do not claim enforcement.
  - Strength: honest and cheap; matches the plan's choice of `user_metadata` (`app_metadata` is not writable from the app without a service key).
  - Tradeoff: a determined user can skip the forced change.
  - Confidence: HIGH — only the user's own account is affected.
  - Blind spot: not retested against the production Supabase project.
- **Decision**: FIXED (plan addendum)

### F2 — Gate lets every `/api/auth/*` path through, plan listed three

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/middleware.ts:58-59
- **Detail**: The plan lists `/konto/haslo`, `/api/auth/password`, `/api/auth/signout`. The code also passes `/api/auth/signin` and `/api/auth/signup` (the comment explains: a session can be replaced). Harmless and needed for sign-in by another account, but a deviation from the written contract.
- **Fix**: Add a one-line addendum to the plan's phase 3 contract.
- **Decision**: FIXED (plan addendum)

### F3 — API tests miss three branches

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/api/auth-password.test.ts
- **Detail**: Not covered over HTTP: a voluntary change by an unmarked account that succeeds, the marker cleared at sign-in for an account whose password now passes, and the fail-closed branch (`password_check_failed`). The component tests and the manual run cover the voluntary screen; the other two have no test.
- **Fix**: Add a voluntary-change scenario (about 3 auth calls). Leave the fail-closed branch as a manual check or a unit test with a fake client.
- **Decision**: FIXED in part (voluntary-change scenario added; the marker-clearing and fail-closed branches stay untested)

### F4 — Manual checks 3.5–3.7 partly rest on indirect evidence

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/password-policy/plan.md (Progress 3.5–3.7)
- **Detail**: Ticked after a browser run by the agent (at the user's request). The sign-out button on the forced screen was not clicked in the browser (covered by the API test), and 390 px was checked in an iframe because the window could not be resized.
- **Fix**: None needed; optionally click "Wyloguj się" on a real phone-width window once.
- **Decision**: PENDING
