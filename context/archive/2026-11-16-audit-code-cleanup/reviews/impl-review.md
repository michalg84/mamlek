<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Small code cleanup from the PRD conformance audit (F5 and error hygiene)

- **Plan**: context/changes/audit-code-cleanup/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-16
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Automated criteria re-run on 6fe1e3c: unit + component + registry 624 passed, lint, `astro check` and `ui:scan` clean. Manual items 1.6–1.8, 2.6, 3.5 and 3.6 were checked in the running app (curl and Playwright, screenshots in `.ui-shots/audit-code-cleanup/`).

## Findings

### F1 — Two deviations from the plan are not written down in it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/middleware.ts:17-29, src/components/kit/KitItemEdit.tsx:82-113, src/components/kit/KitList.tsx:60-73
- **Detail**: (1) The plan says every `getUser()` error other than a missing session leads to `?error=session_check_failed`. The code splits it: only an outage (network error, 5xx, no status) gets the message; a session the server refused (4xx: expired, signed out elsewhere) is logged and leads to the plain sign-in page, because "serwis chwilowo niedostępny" would be false there. (2) Phase 2 also changed `KitItemEdit.tsx` and `KitList.tsx` (`badInput` read from the field when the value is used), found during manual check 2.6. Both are described in the commit messages and the audit report, not in the plan.
- **Fix**: Add a "Deviations" addendum to the plan with both points.
- **Decision**: FIXED — addendum added to plan.md (decided under the author's standing instruction to continue without stopping).

### F2 — The "no change event" case is tested only in the add form

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/components/kit/KitItemEdit.test.tsx:146-157
- **Detail**: The edit panel and the list now read `validity.badInput` from the field, but their tests still fire a change event, so the browser case behind the fix (an empty field gets "-", the value stays "" and React fires nothing) is not covered there. In the list it cannot happen in a way that matters: with a stored quantity the change from "5" to "" fires an event, and with none nothing changes, so nothing is saved. In the edit panel it can: a stored unknown quantity, "-" typed, another field changed, "Zapisz".
- **Fix**: Add a `KitItemEdit` test for that case without a change event on the quantity.
- **Decision**: FIXED — test added (decided under the author's standing instruction to continue without stopping).

### F3 — A refused session is logged on every request until the token expires

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:18-22
- **Detail**: auth-js removes the stored session only for `AuthSessionMissingError` (`GoTrueClient._getUser`). A session revoked on the server (403 `session_not_found`) keeps its cookie until the access token expires (about an hour), so each request of that browser writes one `Session check failed (rejected)` line. That is a real signal, not a hidden one, and the volume is bounded by one user's requests.
- **Fix**: None now; revisit if the log gets noisy in production.
- **Decision**: ACCEPTED — the log line is the intended evidence; volume is bounded.
