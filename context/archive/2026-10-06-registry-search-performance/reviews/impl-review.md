<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-09: Wydajność wyszukiwania leków na słabym telefonie

- **Plan**: context/changes/registry-search-performance/plan.md
- **Scope**: Full plan (phases 1–4 implemented; phases 5–6 skipped by the phase 4 gate, skip checked against the gate rule)
- **Reviewed phases**: 1, 2, 3, 4, 5, 6
- **Date**: 2026-10-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

Automated checks run during the review: `astro sync`, `npm run lint`, `astro check` (0 errors), `npm run build` (worker chunk `registry-search.worker-*.js` present), `npm run search:check` (31/31 match, list version 1790946891) all pass. `npm run smoke` was not run locally (it needs a running server); it passed in CI on PR #21. Phase 4 numbers match `.perf/perf-2026-10-07.json` (64 ms is the largest slow-profile interaction across runs).

## Findings

### F1 — Worker CPU throttling never applied; the gate rests on optimistic numbers

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: scripts/perf-search.mjs:170-218, src/components/hooks/useRegistrySearch.ts:75-80
- **Detail**: Throttling the worker fails in 10/10 runs ("Operation is only supported for pages, not workers"; `setAutoAttach` uses `flatten: false`, a justified deviation from the plan). The worker's `buildMs` is sent but never read by the hook or the script, so the plan's "buildMs ≥ ~4x at CPU 6x" check could not be done and nothing estimates the missing cost. The slow-profile result (3969 ms vs. the ≤ 5 s target) does not include a 6x-slower JSON parse + index build, and phase 4 skipped phase 6 on this number. Progress 4.3 notes the caveat; 3.11 (real phone) confirms that it works, not the timing.
- **Fix A ⭐ Recommended**: Put `buildMs` into the ready mark's `detail` and have `perf` print the build time plus an estimate for the throttled profile (`listReady + buildMs × (rate − 1)`) next to the target.
  - Strength: Turns an unverified caveat into a number that either confirms the phase 4 gate or reopens phase 6; it reuses data the worker already sends.
  - Tradeoff: A small change to the hook and the script, plus one more production run by the user.
  - Confidence: MED — a linear CPU-scaling estimate is approximate, but it is what DevTools throttling does on the page anyway.
  - Blind spot: The size of `buildMs` on production has not been measured.
- **Fix B**: Accept as is and add a line to the plan saying that the gate decision for phase 6 was made without worker throttling.
  - Strength: No code change; the caveat is already in Progress.
  - Tradeoff: The ≤ 5 s target on the slow profile stays unproven.
  - Confidence: MED — the margin (~1 s) may cover a 6x build, but this was never checked.
  - Blind spot: Real slow-phone timing.
- **Decision**: FIXED (Fix A) — the ready mark carries `detail.buildMs`; `perf` records `workerBuildMs`/`workerEstimateMs` per run and prints "worker build, unthrottled" and "list ready, est. throttled worker" rows (judged against the list-ready target). Lint and astro check pass. Production run after deploy (2026-10-07 09:41Z, median of 5): slow-profile estimate 4651 ms (max 5652) ≤ 5000 ms, fast 1710 ms; the phase 6 gate holds with a ~350 ms margin (recorded in plan Progress 4.3/4.4).

### F2 — Unplanned exa MCP config and vendor command committed in feature commits

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: .mcp.json (exa entry), .claude/commands/exa-init.md
- **Detail**: The plan (Phase 1 §5) said that only the `chrome-devtools` hunk goes into `.mcp.json` "unless the user decides otherwise". No decision is recorded, but commit 0869716 also commits the user's `exa` entry. Commit ccd7876 (phase 3) adds the 108-line `.claude/commands/exa-init.md`, which is unrelated to the plan. The exa entry passes the key in the URL query (`?exaApiKey=${EXA_API_KEY}`), which can end up in logs; the committed guide itself recommends an `x-api-key` header. Without `EXA_API_KEY`, every contributor gets an MCP config error. Both files are already on `main`.
- **Fix A ⭐ Recommended**: Keep both and record the decision as an addendum in the plan; switch the exa entry to `"headers": {"x-api-key": "${EXA_API_KEY}"}`.
  - Strength: Matches how you use the project (exa is your tool); the source of truth is updated and the key leaves the URL.
  - Tradeoff: Shared config keeps a personal tool.
  - Confidence: HIGH — the header form is the one the exa guide documents.
  - Blind spot: Whether the exa MCP endpoint accepts the header in this transport has not been checked.
- **Fix B**: Remove the exa entry and `exa-init.md` from the repo (move them to user-level config) in a separate chore commit.
  - Strength: Strict scope; the feature history has no vendor instructions.
  - Tradeoff: Another commit/PR; exa must be configured outside the repo.
  - Confidence: HIGH — nothing in the code depends on it.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix B) — exa block removed from `.mcp.json`; `exa-init.md` removed from the repo (`git rm`) and copied to `~/.claude/commands/exa-init.md`. The user re-adds exa at user scope with `claude mcp add --scope user --transport http exa https://mcp.exa.ai/mcp --header "x-api-key: ${EXA_API_KEY}"`.

### F3 — `search:check` has no TLS handling for non-local databases

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/registry-search-check.mjs:86
- **Detail**: `new pg.Client({ connectionString })` has no `ssl`. `registry-import.mjs:154-166` (`sslOptions`) verifies non-local hosts against `supabase/prod-ca-2021.crt`. AGENTS.md says that `search:check` is local-only, but nothing enforces it: pointing it at the production pooler would send the password over an unverified connection.
- **Fix**: Refuse non-local hosts with a `UsageError` (exit 2), using the same `LOCAL_HOSTS` check as `perf-search.mjs`.
- **Decision**: FIXED — `loadList` rejects a non-local or invalid `DATABASE_URL` with exit 2 before connecting (checked: `db.example.com` → exit 2, local → 31/31 match); AGENTS.md exit-code note updated.

### F4 — Results from an earlier query reappear and can be selected

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useRegistrySearch.ts:134-142, src/components/registry/MedicineSuggest.tsx:63-88
- **Detail**: `answer` is not cleared when the query becomes too short. Type `ibu`, clear the field, type `par`: until the worker answers, the list shows the `ibu` results again, and ArrowDown + Enter can select one of them. Keeping previous results while typing on (plan: no flicker) is intended; bringing back results from a query the user deleted is not.
- **Fix**: In the hook, drop `answer` when the query falls below the threshold (e.g. reset it in the send effect when `!longEnough`), so only results from the query being typed carry over.
- **Decision**: FIXED — the hook resets `answer` during render when the query is too short (late answers are already dropped by the id bump). Lint and astro check pass; needs a manual check in the browser (`ibu` → clear → `par`).

### F5 — A search exception in the worker shows "Nie udało się wczytać listy leków"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/registry-search.worker.ts:34-37, src/components/hooks/useRegistrySearch.ts:87-89
- **Detail**: `searchVariants` in the worker has no try/catch. If it throws, `onerror` switches the whole hook to `error`, which shows the list-loading error even though the index is fine. Retry recovers.
- **Fix**: Wrap the search in try/catch in the worker and reply `results` with an empty list (same `id`/`query`).
- **Decision**: FIXED — search wrapped in try/catch in the worker; on failure it replies with empty results for the same `id`/`query`.

### F6 — chrome-devtools MCP entry is Windows-only and unpinned in shared config

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: .mcp.json (chrome-devtools)
- **Detail**: `"command": "cmd", "args": ["/c", ...]` only works on Windows (as planned), and `chrome-devtools-mcp@latest` pulls whatever the latest release is at every start.
- **Fix**: Pin a version (e.g. `chrome-devtools-mcp@<current>`); leave the `cmd /c` wrapper as is, since the plan chose it.
- **Decision**: FIXED — pinned to `chrome-devtools-mcp@1.10.1` (current npm version on 2026-10-07).
