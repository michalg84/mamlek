# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-10

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   author is worried about X, and the failure would surface somewhere in
   the check flow" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/` (28 commits in the 30 days before 2026-10-10; `scripts/` excluded at the author's request).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                    | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The check answers "nie masz" for a medicine, or a same-substance medicine, that is in the kit                              | High   | High       | interview Q1, Q3; PRD Success Criteria (Primary); roadmap S-03 (in progress), S-06 (extends the rule); hot-spot dir `supabase/migrations/` (6 commits/30d)                                                      |
| 2   | The check reports "same substance" for a medicine that is not                                                              | High   | Medium     | PRD Guardrails ("false indication is worse than no answer"); roadmap S-06; interview Q3                                                                                                                         |
| 3   | The screen shows a verdict that belongs to a different medicine than the one now in the input                              | Medium | High       | interview Q2 (already burned); archive `2026-10-06-registry-search-performance` review (earlier results reappear); hot-spot dirs `src/components/registry/` (12 commits/30d), `src/components/hooks/` (7)       |
| 4   | One home account reads or changes another account's kit, or kit data is reachable without a session                        | High   | Medium     | PRD Guardrails and NFR (access); interview Q3 (RLS); archive `2026-10-02-registry-search-suggestions` review (RLS never checked on data); roadmap S-05 (adds edit and delete)                                   |
| 5   | Suggestions change order or lose variants, so the user cannot find or tell apart the right record                          | Medium | Medium     | roadmap S-01 and S-09 risk notes; AGENTS.md (`search:check` needs the full registry, not run in CI); hot-spot dir `src/lib/` (10 commits/30d)                                                                   |
| 6   | Kit endpoints accept invalid input or answer it with a 500                                                                 | Medium | Medium     | archive `2026-10-07-add-medicine-to-kit` review (quantity overflow, invariants only in the API); roadmap Parked (kit writes only through the app); hot-spot dir `src/pages/api/` (10 commits/30d)               |
| 7   | The registry import drops or mangles products, substances or packs without failing, so a real medicine is missing or wrong | High   | Medium     | interview follow-up (author asked for the import scripts to be tested, last); archive `2026-10-01-registry-copy-load` review (vague failure on empty names, invalid UTF-8 replaced silently); roadmap F-01 risk |

Risk #7 is appended last by the author's choice of order, not by its rating.
A registry that stops refreshing (as opposed to importing wrong data) is an
alerting concern already covered by the failed-run email and the visible
state date; it is not a test target here.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                                             | Must challenge                                                                                                                                      | Context `/10x-research` must ground                                                                                                                                  | Likely cheapest layer                                                             | Anti-pattern to avoid                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| #1   | With the medicine in the kit (other pack size, parallel import, withdrawn pack, or another product with the same substance), the verdict the user sees is never "nie masz"                                              | "The database rule check passes, so the user sees the right verdict" — a layer between rule and screen may turn a match or an error into "nie masz" | How "same medicine" and "same substance" are defined; where the verdict is derived; how an empty or failed result is translated; what the existing rule check covers | database integration + unit on the verdict mapping                                | Expected verdicts copied from current output; the oracle is the PRD rule and hand-verified pairs   |
| #2   | Partial substance overlaps, placeholders and similar names never produce a same-substance verdict; the consult-a-pharmacist notice appears with every same-substance verdict                                            | "The same common name means the same substance"                                                                                                     | Set-comparison semantics; placeholder handling; the condition that shows the notice                                                                                  | database integration + component test for the notice                              | Happy-path-only (single-substance pairs)                                                           |
| #3   | After editing, clearing or reselecting, and with responses arriving out of order, the screen never shows a verdict for anything but the current selection                                                               | "Clearing the result on text change fixed it" — a late response from an earlier request can still land                                              | Who owns the result state; whether requests are cancelled; what triggers a check                                                                                     | hook / component test with controlled async; e2e only if that cannot reproduce it | Sleeps; asserting internal state instead of what is rendered                                       |
| #4   | A second signed-in user cannot read, check against, add to, edit or delete the first user's kit through the app's API or directly through the data API; an anonymous caller gets nothing                                | "Logged in means authorised"; "table RLS also covers the database function"                                                                         | Every path that reads or writes kit data; the function's security mode; per-operation policies; what the existing rule check already asserts                         | two-user database integration + API integration                                   | Mocking the Supabase client (a mock cannot prove RLS); testing only through the UI                 |
| #5   | Product-name matches rank first, strength and form tell variants apart, diacritics and case are ignored — on a small hand-built list that runs in CI                                                                    | "Matching the golden file means the results are correct" — the golden file records current behaviour, bugs included                                 | The matching rules; the smallest list that exercises them                                                                                                            | unit                                                                              | Snapshot without stated meaning                                                                    |
| #6   | Out-of-range, wrong-type, oversized, non-registry or withdrawn-pack input gets a clean 4xx, writes nothing and leaks no internals                                                                                       | "The form validates, so the server is safe"                                                                                                         | Validation boundaries; database column limits; error translation                                                                                                     | API integration or unit on the validation                                         | Restating the validation schema in the test; boundaries come from the PRD and the database limits  |
| #7   | A registry file with a malformed, empty, duplicated or unexpected record either imports every valid product intact or fails loudly and rolls back; no product, substance or pack disappears or changes meaning silently | "The fixture import check passes, so real registry files import correctly" — fixtures hold only the shapes someone thought of                       | The input shapes the real registry produces; which problems fail the import and which are tolerated; what the existing import check asserts                          | unit on the parser + database integration on the import                           | Expected rows produced by running the parser under test; the oracle is the hand-read source record |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                      | Goal (one line)                                                                                            | Risks covered | Test types                  | Status        | Change folder                                      |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------- | --------------------------- | ------------- | -------------------------------------------------- |
| 1   | Check verdict correctness       | Bootstrap the test runner and prove the verdict the user sees is right, from rule to screen                | #1, #2        | unit + database integration | change opened | context/changes/testing-check-verdict-correctness/ |
| 2   | Result state and search         | Prove the screen never shows an answer to a different question and suggestions keep their order            | #3, #5        | unit + component            | not started   | —                                                  |
| 3   | Kit access and input boundaries | Prove kit data is isolated per account and invalid input is rejected cleanly                               | #4, #6        | database + API integration  | not started   | —                                                  |
| 4   | Quality-gates wiring            | Make the suites from Phases 1–3 required locally and in CI, and add an after-edit hook                     | cross-cutting | gates                       | not started   | —                                                  |
| 5   | Registry import scripts         | Prove the import and its parser keep every valid product intact or fail loudly, then add them to the gates | #7            | unit + database integration | not started   | —                                                  |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

No AI-native phase: nothing in the risk map needs a vision or AI review
that a deterministic test would not catch more cheaply.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer                | Tool                                              | Version | Notes                                                                                                        |
| -------------------- | ------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| unit + component     | none yet — see Phase 1 (Vitest is the hypothesis) | —       | Astro documents Vitest through `getViteConfig()`; version and DOM environment are chosen in Phase 1 research |
| database integration | Node check scripts + `pg` against local Supabase  | pg 8.x  | Exists: rule and import checks run in the CI `smoke` job in a rolled-back transaction                        |
| API mocking          | none planned                                      | —       | Integration tests use the real local Supabase; do not mock the Supabase client                               |
| e2e / flow           | `npm run smoke` (dependency-free)                 | —       | Exists: auth flow and search-list steps against the production preview                                       |
| browser automation   | Playwright                                        | 1.63    | Installed for `perf` and `ui:shots`; a test layer only if a component test cannot reproduce a risk           |
| static guards        | ESLint, `astro check`, `ui:scan`                  | —       | Exist and are required in CI                                                                                 |

Test-base profile on 2026-10-10: `none` — no test-runner config and no test
files; the checks above are custom scripts, two of which (`search:check`,
`perf`) need a full local registry and do not run in CI.

**Stack grounding tools (current session):**

- Docs: Context7 — Astro testing guide checked (Vitest via `getViteConfig()`); checked: 2026-10-10
- Search: Exa.ai — available, not used (no tool-status question needed it); checked: 2026-10-10
- Runtime/browser: chrome-devtools MCP and Claude in Chrome — available, not used; possible manual verification aid, not a test layer; checked: 2026-10-10
- Provider/platform: Cloudflare MCP — available, not used; no quality gate depends on it; checked: 2026-10-10

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                             | Where              | Required?                    | Catches                                                |
| -------------------------------- | ------------------ | ---------------------------- | ------------------------------------------------------ |
| lint + type check + `ui:scan`    | local + CI         | required (wired)             | syntax, type and design-token drift                    |
| build                            | CI                 | required (wired)             | code that does not build for the Worker runtime        |
| database rule and import checks  | CI on PR           | required (wired)             | regressions in the check rule, RLS on the rule, import |
| auth-flow smoke                  | CI on PR           | required (wired)             | broken sign-in, protected routes, search list          |
| unit + component                 | local + CI         | required after §3 Phase 4    | verdict, result-state and search logic regressions     |
| kit access and input integration | CI on PR           | required after §3 Phase 4    | cross-account access, invalid input accepted           |
| post-edit hook                   | local (agent loop) | recommended after §3 Phase 4 | regressions at edit time                               |
| registry import and parser tests | local + CI         | required after §3 Phase 5    | products dropped or mangled on import                  |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test

- TBD — see §3 Phase 1 for the verdict-mapping pattern (a match never becomes "nie masz") and §3 Phase 2 for the search-matching pattern.

### 6.2 Adding a database rule test

- **Existing pattern**: synthetic rows inserted in one transaction that is always rolled back.
- **Reference test**: `scripts/medicine-check-check.mjs`.
- **Run locally**: `node scripts/medicine-check-check.mjs` with `DATABASE_URL` set, after `npx supabase db reset`.
- TBD — see §3 Phase 1 for false-negative / false-positive verdict cases and §3 Phase 3 for the two-user isolation pattern.

### 6.3 Adding a component or hook test

- TBD — see §3 Phase 2 for the stale-verdict pattern (controlled async, assertions on what is rendered).

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 3 for the invalid-input and cross-account pattern.

### 6.5 Adding a test for the registry import or parser

- **Existing pattern**: import fixtures v1, v1, v2, then `node scripts/registry-import-check.mjs`.
- TBD — see §3 Phase 5 for the malformed-record pattern (import intact or fail loudly).

### 6.6 Per-rollout-phase notes

(Empty until a phase lands.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Tooling scripts `roadmap:sync`, `perf`, `ui:shots`** — developer aids with no user-facing effect. Re-evaluate if one of them starts gating CI or a deploy. (Source: Phase 2 interview Q5.)
- **Sign-in and sign-out** — no new tests; Supabase does the work and the existing `smoke` run keeps covering the flow. Re-evaluate if the login method changes (PRD Open Question 2). (Source: Phase 2 interview Q5.)
- **Registry refresh schedule** — a refresh that stops running is caught by the failed-run email and the state date on `/szukaj`, not by a test. Re-evaluate if the repository becomes public. (Source: `infrastructure.md` risk register.)
- **CSV import (S-04)** — not built yet, so there is nothing to protect. Add through `--refresh` when S-04 lands. (Source: roadmap S-04, status proposed.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-10
- Stack versions last verified: 2026-10-10
- AI-native tool references last verified: 2026-10-10

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
