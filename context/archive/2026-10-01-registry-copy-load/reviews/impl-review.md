<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Kopia Rejestru Produktów Leczniczych w bazie

- **Plan**: context/changes/registry-copy-load/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Success criteria re-run on 2026-10-01:

- `db reset` and `db lint` pass.
- Fixture v1 dry-run: 11 / 34 / 21.
- Full dump: 20 258 / 25 515 / 71 432. The second run marks 0 as removed.
- A truncated file exits with 1 and leaves the data unchanged.
- The sequence v1, v1, v2 followed by the check script passes.
- lint, astro check and build pass.
- CI passes on PR #14 and PR #15.
- Every manual item is checked, and each has evidence from the session: SQL for 2.6, workflow runs for 3.8 and 3.9, `migration list` for 3.6.

## Findings

### F1 — Production import workflow is not restricted to main and has no permissions block

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/registry-import.yml:3-24
- **Detail**: `REGISTRY_DATABASE_URL` is a repository secret holding the production table-owner credentials.
  - `workflow_dispatch` can be started with `--ref <any branch>`, which runs that branch's version of `scripts/registry-import.mjs` and its dependencies against production.
  - There is no `permissions:` block, so `GITHUB_TOKEN` gets the repository default.
  - `actions/checkout` leaves the token in `.git/config` (`persist-credentials` defaults to true).
  - Only users with write access can dispatch the workflow, so on a single-owner repo the risk is low today.
- **Fix**: Add the following, and optionally move the secret into a `production` Environment limited to `main`:
  - `permissions: contents: read`;
  - `persist-credentials: false` on the checkout step;
  - `if: github.ref == 'refs/heads/main'` on the job.
- **Decision**: FIXED — permissions: contents: read, persist-credentials: false, job limited to refs/heads/main

### F2 — Connection to production does not require TLS

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/registry-import.mjs:139
- **Detail**: `new pg.Client({ connectionString })` is created without an `ssl` option. The Session pooler URI from the dashboard has no `sslmode`, so node-postgres does not use TLS. Unless "Enforce SSL" is on in the Supabase project, the import from a GitHub runner probably goes over the internet unencrypted, including authentication and data.
- **Fix A ⭐ Recommended**: In the script, set `ssl` for non-local hosts and verify against the Supabase root CA (stored in the repo or passed as a secret).
  - Strength: TLS no longer depends on the secret's format, and verify-full protects against MITM.
  - Tradeoff: The CA has to be maintained, and the localhost/CI path needs its own branch.
  - Confidence: MED — the pg API is standard; the CA path has not been tested.
  - Blind spot: Not checked whether the production runs actually used plaintext; that cannot be told from the logs.
- **Fix B**: Require `?sslmode=require&uselibpqcompat=true` in the secret (documented in README/AGENTS.md) and turn on "Enforce SSL" in Supabase.
  - Strength: No code change. Enforce SSL makes the server reject plaintext.
  - Tradeoff: TLS without certificate verification (no MITM protection), and the guarantee depends on the secret's format.
  - Confidence: MED — in pg 8.23, `sslmode=require` without `uselibpqcompat` means verify-full and may fail without the CA.
  - Blind spot: Enforce SSL also affects other clients (the app connects through supabase-js over HTTPS, so it is probably unaffected).
- **Decision**: FIXED via Fix A + Enforce SSL — verified TLS with the Supabase root certificate (supabase/prod-ca-2021.crt) for non-local hosts, sslmode in the URL rejected; Enforce SSL turned on in the dashboard by the user

### F3 — No guards against bulk deletion of substances and packages

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/registry-import.mjs:177-196
- **Detail**: The only guard on the data's shape is that the dump has at least 90% of the active product count. If a dump keeps the v6.0.0 namespace and the product count but renames `substancjeCzynne`, `opakowanie` or the package `id`, step 6 hard-deletes every substance and step 7 marks every package as removed, in one commit.
- **Fix**: Add the same share checks before step 4: dump packages ≥ 90% of active packages, and dump substances ≥ 90% of the current row count (skipped when the table is empty).
- **Decision**: FIXED — 90% share checks for substances (of active products) and active packages next to the product check

### F4 — Benign extras not recorded in the plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: registry-import.yml:6-8, rpl-parser.mjs:17-21/75/152/188, registry-import.mjs:143/146-151/260, migration :32-33/97/123/125/188-193, README.md:85-100
- **Detail**: Changes beyond the plan, all harmless or safer:
  - a `concurrency` group in the workflow;
  - stricter parser validation (id, root element, empty name), plus `stats` in its result;
  - primary keys on the temp tables (duplicate ids abort the import);
  - `statement_timeout = 0`;
  - exit code 2 for usage errors;
  - `NOT NULL` and defaults on `source`, `atc_codes`, `routes`, `units` and `finished_at`;
  - revokes for anon and authenticated (from impl-review-phase-1);
  - a README "Registry import" section with the RPL links.

  This review records them, so the plan no longer has to.

- **Fix**: None needed beyond this report; add an addendum to the plan only if you want it to stay the single source of truth.
- **Decision**: ACCEPTED — extras are benign; this report documents them

### F5 — Transaction stays open during the download; no timeouts

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/registry-import.mjs:142-164, .github/workflows/registry-import.yml:12
- **Detail**: `begin` and `statement_timeout = 0` run before the 74 MB file is streamed from RPL. A slow or stalled download (undici's body timeout is about 300 s per stall) keeps a transaction and a pooler session open on production. The job has no `timeout-minutes` (the default is 360) and there is no `lock_timeout`. Row locks are taken only in steps 4–8, so readers are not blocked.
- **Fix A ⭐ Recommended**: Add `timeout-minutes: 30` to the job and `set local lock_timeout = '30s'`.
  - Strength: Two lines, and they cap the worst case.
  - Tradeoff: The transaction still covers the download (about 18–25 s on production today).
  - Confidence: HIGH — standard settings.
  - Blind spot: None significant.
- **Fix B**: Download to a temporary file before `begin`, then import with `--file` semantics.
  - Strength: The transaction covers only parsing and the merge, and a network failure never touches the database.
  - Tradeoff: More code; writes about 74 MB to the runner's disk.
  - Confidence: MED — a simple change, but it touches the main flow.
  - Blind spot: Behaviour on a full disk.
- **Decision**: FIXED via Fix A — timeout-minutes: 30 on the job, set local lock_timeout = '30s'

### F6 — No `client.on("error")` listener

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/registry-import.mjs:139
- **Detail**: A socket-level error (for example ECONNRESET from the pooler while the client sits idle during the download) is emitted as `'error'` with no listener. Node then exits with a raw stack trace instead of "Registry import failed:". The exit code is still 1 and the transaction rolls back, so no data is harmed.
- **Fix**: Register `client.on("error", …)` and surface the error through the normal catch path.
- **Decision**: FIXED — client.on("error") keeps the connection error and the import fails with it through the normal catch path

### F7 — Two imports can run concurrently (outside the workflow)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/registry-import.mjs:166-181
- **Detail**: The snapshot-date and 90% checks read without a lock. The workflow's `concurrency` group does not cover a local `npm run registry:import` against the same database. In a race, an older snapshot can commit last.
- **Fix**: Run `select pg_advisory_xact_lock(<const>)` right after `begin`.
- **Decision**: FIXED — pg_try_advisory_xact_lock right after begin; a second import fails with "another registry import is running"

### F8 — An empty substance name fails with a vague error

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/lib/rpl-parser.mjs:96 (vs :152)
- **Detail**: An empty `nazwaProduktu` raises an `RplParseError` with the product id. An empty `nazwaSubstancji` becomes `null` and only fails on the database's `NOT NULL` constraint in step 6, with a Postgres error that does not say which product. The import fails closed, so this is safe, but hard to diagnose.
- **Fix**: Validate the substance name in the parser the same way as the product name.
- **Decision**: FIXED — RplParseError with the product id for an empty nazwaSubstancji

### F9 — `--file` replaces invalid UTF-8 silently; the download path rejects it

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/registry-import.mjs:47-49 (vs :41)
- **Detail**: `createReadStream(file, { encoding: "utf8" })` silently replaces invalid bytes with U+FFFD, while `downloadText` uses `TextDecoder("utf-8", { fatal: true })`. A corrupted local file would import garbled text.
- **Fix**: Decode file chunks through the same fatal `TextDecoder`.
- **Decision**: FIXED — --file decodes through the same fatal TextDecoder as the download
