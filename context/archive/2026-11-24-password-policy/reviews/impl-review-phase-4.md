<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Password policy

- **Plan**: context/changes/password-policy/plan.md
- **Scope**: Phase 4 of 5
- **Reviewed phases**: 4
- **Date**: 2026-11-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

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

- Phase commit 943faa0 (6 files): `src/lib/session-age.ts`, `session-age.test.ts`, `src/lib/supabase.ts`, `src/middleware.ts`, `plan.md`, `change.md`. No file outside the plan's list.
- `session-age.test.ts`: 15/15 passed (90-day boundary at −1 s, exactly 90 days and +1 s, both `amr` formats, missing `amr`, several entries, cookie cap, token decoding). Whole `unit` + `component` + `registry` run: 973/973. `eslint src` clean, `astro check` 0 errors, 0 warnings.
- The middleware keeps the plan's order: `getUser()` verifies the token, then `getSession()` and a decode without a second auth call; `null` time fails closed and is logged with the user id; `signOut({ scope: "local" })` failure is logged, not swallowed; an expired session never reaches the password gate. Redirect target `/auth/signin?error=session_expired` is wired to a message in `auth-errors.ts`.
- `smoke` and `test:api` were not re-run (no server on :4321); CI `smoke` was green on PR #103, which contains this phase. `perf` was not re-run; the recorded median is 933 ms before and 952 ms after.
- Manual 4.6 and 4.7 carry the phase SHA and the change notes record what was seen (`Max-Age=2592000`; redirect after 75 s with the limit lowered to one minute).

## Findings

### F1 — Plan still describes the cookie cap that does not work

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/password-policy/plan.md (Phase 4, section 3 Contract)
- **Detail**: The plan says `createServerClient(..., { cookieOptions: { maxAge: SESSION_IDLE_DAYS * 86400 }, cookies })`. `@supabase/ssr` ignores that option, so the code caps `maxAge` in `setAll` (`sessionCookieMaxAge`), which is the right call. The deviation is written down in `change.md` Notes and AGENTS.md but not in the plan, which a later reader treats as the source of truth.
- **Fix**: Add a one-line addendum to the Phase 4 contract pointing to `sessionCookieMaxAge` and the Notes entry.
- **Decision**: FIXED — addendum in plan.md (Phase 4, section 3)

### F2 — The expiry path has no automated test, and the local `test:api` result is described loosely

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: src/middleware.ts:35-55, context/changes/password-policy/change.md (Phase 4 notes)
- **Detail**: The 90-day rule is unit-tested, but the wiring (decode, sign-out, redirect with `session_expired`, skipping the password gate) is proven only by the one-off manual run with a lowered constant. A refactor of the middleware could drop it without a red test; `smoke` and `test:api` only prove that fresh sessions survive. The notes also say 1–3 unauthenticated `kit-access` cases per local `test:api` run got 500 from `wrangler dev`, with the same result on a stash of the phase 4 changes, while row 4.3 is `[x]` (CI was green). Not a regression, but the claim "green" rests on CI only.
- **Fix**: Accept both with a sentence in the plan, or add a middleware-level test that feeds a token with an old `amr` timestamp (needs a way to inject `SESSION_MAX_DAYS` or a fake clock); the unauthenticated 500s deserve their own follow-up.
  - Strength: Guards the only security behaviour of the phase that has no regression test.
  - Tradeoff: The middleware imports `astro:middleware`, so the test needs a seam; more work than the rest of the findings together.
  - Confidence: MED — depends on how cheaply the middleware can be exercised in Vitest.
  - Blind spot: Did not reproduce the 500s locally.
- **Decision**: ACCEPTED — manual proof kept; addendum in plan.md records the missing automated test and the local 500s
