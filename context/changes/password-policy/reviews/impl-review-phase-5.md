<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Password policy

- **Plan**: context/changes/password-policy/plan.md
- **Scope**: Phase 5 of 5
- **Reviewed phases**: 5
- **Date**: 2026-11-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations

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

- Phase commit 053e2fc (5 files): `AGENTS.md`, `README.md`, `context/foundation/prd.md`, `context/foundation/roadmap.md`, `plan.md`. Nothing outside the plan's list.
- PRD: Access Control describes the rule, the forced change, the voluntary change and the session limits (lines 317–325); Non-Goals keeps only the reset of a forgotten password (line 363); Open Question 2 and the later entry on resetting without the author were updated.
- Roadmap: the S-18 Unknowns are resolved (marker plus middleware, scope of the change, panel setting outside the rule) and the Risk no longer mentions "10 znaków + 4 klasy". `roadmap:sync` was run afterwards (see 5.2).
- AGENTS.md carries the rule, the marker and the gate, `/konto/haslo`, `session-age.ts`, `setWeakPassword` and the accepted gap of the marker; README carries the `E2E_PASSWORD` requirement and the production panel step.
- Re-run in this review: `npx vitest run` (unit, component, registry) 973/973, `eslint src` clean, `astro check` 0 errors / 0 warnings. `npm run build` and `roadmap:sync -- --dry-run` were not re-run; CI was green on PR #103.
- Manual 5.3 (author reviews PRD, roadmap, AGENTS.md) and 5.4 (production Supabase panel and test accounts) are still `[ ]`. The merge has happened, so 5.4 is now due: until the panel is set, only the app enforces the 12 characters.

## Findings

### F1 — AGENTS.md still says `test:api` fits about 3 runs per 5 minutes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: AGENTS.md:44 (`npm run test:api` entry); .claude/skills/parallel-slices/assets/COORDINATION.template.md:27
- **Detail**: (Read from a checkout from before PR #105 merged; see the Decision.) The plan says AGENTS.md must record that the new tests cut the runs per 5 minutes from about 3 to 1–2. The entry still reads "each run signs up 4 throwaway accounts (8 of the 30 sign-ups and sign-ins allowed per 5 minutes locally, so about 3 runs fit)". The per-file counts are now 8 (kit files), 19 (`auth-password.test.ts`, per its own header) and 1 (`auth-signup.test.ts`), about 28 of the 30, so one run fits. The coordination template repeats "max ~3 runs / 5 min across all slices", which would make parallel workers hit the local limit and fail with a rate-limit error that looks like a bug.
- **Fix**: Replace the sentence in AGENTS.md with the current numbers (about 28 of 30, one run per 5 minutes) and change "~3 runs" in the template to "~1 run".
- **Decision**: FIXED — already corrected on `main` by 5fdb9df (AGENTS.md: 8 accounts, about 28 of 30, one run; template: max 1 run / 5 min)
