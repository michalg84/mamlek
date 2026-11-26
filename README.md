# MamLek

A shared home medicine cabinet for one household. The question it answers, at the doctor's office or at the pharmacy counter, is: _do we already have this medicine at home, or something with the same active substance?_ Matching uses the Polish Registry of Medicinal Products (Rejestr Produktów Leczniczych), not a hand-kept list of names.

Planned MVP:

- look up a medicine in the registry by product name, international name or active substance
- keep the household cabinet (package, expiry date, remaining quantity)
- import the cabinet in bulk from a CSV file, with a review screen before anything is saved
- check a medicine against the cabinet: you have it / you have a same-substance substitute / you don't

The full requirements are in [`context/foundation/prd.md`](context/foundation/prd.md) (in Polish), and the stack decision is in [`context/foundation/tech-stack.md`](context/foundation/tech-stack.md).

**Status:** MVP in progress. Working so far: registry search (`/szukaj`, the entry page after sign-in) with the registry state date, the medicine check against the cabinet on `/szukaj`, the household cabinet (`/apteczka`: adding a package from the registry, editing and deleting items, adjusting the remaining quantity) and the CSV import with a review screen (`/apteczka/import`). What comes next is in [`context/foundation/roadmap.md`](context/foundation/roadmap.md).

## Tech stack

- [Astro](https://astro.build/) 7 with full server-side rendering on [Cloudflare](https://www.cloudflare.com/) (see [Deployment](#deployment))
- [React](https://react.dev/) 19 for interactive islands, [Tailwind CSS](https://tailwindcss.com/) 4, [shadcn/ui](https://ui.shadcn.com/)
- [Supabase](https://supabase.com/) for auth and the database
- TypeScript 6

## Prerequisites

- Node.js v22.14.0 (see `.nvmrc`)
- Docker, for the local Supabase stack (about 7 GB RAM)

## Getting started

```bash
npm install
cp .env.example .env
npx supabase start
```

`npx supabase start` prints the local API URL and anon key. Put them in `.env`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from the CLI output>
```

Then copy `.env` to `.dev.vars` (the Cloudflare runtime reads secrets from there) and start the dev server:

```bash
cp .env .dev.vars
npm run dev
```

Both variables are optional. Without them the app still runs, auth is disabled, and a banner tells you the configuration is missing.

The local Supabase config (`supabase/config.toml`) has email confirmation turned off, so new accounts can sign in straight away. Supabase Studio runs at http://localhost:54323. Stop the stack with `npx supabase stop`.

The local stack delivers no e-mail: the password reset message and the "password changed" notification land in Mailpit at http://127.0.0.1:54324. The reset link in them points at `site_url` from `supabase/config.toml` (`http://localhost:4321`). After pulling a change to `supabase/config.toml` or `supabase/templates/`, restart the stack (`npx supabase stop`, then `npx supabase start`; the data stays). `npm run test:api` reads those messages, so it needs Mailpit running (`MAILPIT_URL`, default `http://127.0.0.1:54324`).

### Using a cloud Supabase project

Set `SUPABASE_URL` (Project URL) and `SUPABASE_KEY` (the `anon` key) from **Settings → API** in the Supabase dashboard, in both `.env` and `.dev.vars`. Cloud projects require email confirmation by default. You can turn it off under **Authentication → Email → Confirm email**. Password reset needs more setup in a cloud project, see [Password reset in production](#password-reset-in-production).

## Scripts

| Command                   | What it does                                                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`             | Dev server on the Cloudflare workerd runtime                                                                                                                                           |
| `npm run build`           | Production build                                                                                                                                                                       |
| `npm run preview`         | Serve the production build                                                                                                                                                             |
| `npm run lint`            | ESLint with type-checked rules (`lint:fix` to auto-fix)                                                                                                                                |
| `npm run format`          | Prettier                                                                                                                                                                               |
| `npx astro check`         | Type-check `.astro` and `.ts` files                                                                                                                                                    |
| `npm run smoke`           | Auth-flow smoke test against a running server (`BASE_URL`, default `http://localhost:4321`)                                                                                            |
| `npm test`                | Unit, component and registry parser tests (Vitest; `npm run test:watch` to watch), no database needed                                                                                  |
| `npm run test:db`         | Rule tests of `medicine_check`, kit isolation (RLS, `anon`) and the registry importer (own scratch database) against a local Supabase (`DATABASE_URL`, needs `npx supabase db reset`)  |
| `npm run test:api`        | Black-box HTTP tests of `/api/kit*` and the password flows (sign-up, change, reset) on a running server (`API_BASE_URL`, local `DATABASE_URL` and Mailpit, registry fixtures imported) |
| `npm run roadmap:sync`    | One-way sync of the roadmap to GitHub Issues + Project (`-- --dry-run` to preview; needs `gh` with `project` scope)                                                                    |
| `npm run registry:import` | Imports the Polish medicines registry (RPL XML export) into `DATABASE_URL` (`-- --file <path>` for a local file, `-- --dry-run` to parse only)                                         |
| `npm run search:check`    | Compares search results for a fixed list of queries with a golden file (`-- --save` to record it; needs the full registry imported locally)                                            |
| `npm run perf`            | Repeatable `/szukaj` timing on throttled profiles against a running server (Playwright)                                                                                                |
| `npm run ui:scan`         | Scans the cleaned views for hardcoded colours, palette classes and arbitrary sizes                                                                                                     |
| `npm run ui:shots`        | Screenshots of the `/szukaj` states at desktop and phone width (Playwright, local server)                                                                                              |
| `npx playwright test`     | Browser (E2E) tests in `tests/e2e/`, local only, not in CI (setup in [`context/foundation/test-stack.md`](context/foundation/test-stack.md))                                           |

The smoke test signs up a throwaway user and signs in right away, so it needs email confirmation turned off. `perf`, `ui:shots` and the E2E tests need a one-time `npx playwright install chromium`; the details of every script are in [`AGENTS.md`](AGENTS.md).

The E2E account's `E2E_PASSWORD` (in the gitignored `.env`) must meet the password rule: at least 12 characters, not a common password, not the e-mail address. A weaker one is sent to `/konto/haslo` after sign-in and `tests/e2e/auth.setup.ts` fails. After merging the password-policy change, set the production Supabase project by hand too (Authentication → Policies/Providers: minimum password length 12, password requirements empty; check `secure_password_change`); see the rollout note in [`AGENTS.md`](AGENTS.md).

A husky pre-commit hook runs lint-staged: `eslint --fix`, `ui:scan` (guarded views only) and `vitest related` (the unit, component and registry tests related to those files) on staged `ts`/`tsx`/`astro` files, `eslint --fix` plus the related registry parser tests on staged `mjs` files, the registry parser tests on staged XML fixtures, and `prettier --write` on `json`/`css`/`md` files.

## CI

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

- **ci**: `astro sync`, lint, `ui:scan`, `astro check`, unit, component and registry parser tests (Vitest), build. The build uses the `SUPABASE_URL` and `SUPABASE_KEY` repository secrets.
- **smoke**: starts a local Supabase (which applies the migrations), imports the registry fixtures (`scripts/fixtures/rpl-sample-v1.xml` twice, then `rpl-sample-v2.xml`) and verifies the result with `node scripts/registry-import-check.mjs` and the `medicine_check` rule, kit isolation and registry importer tests (`npm run test:db`), then builds the app and runs `npm run smoke` and the API tests (`npm run test:api`, which reads e-mails from the local Mailpit) against `npm run preview`.

Both jobs are required checks: the ruleset in `.github/rulesets/main.json` protects `main` (PR required, merge commits only, `ci` and `smoke` green, no bypass, no force-push or deletion). Renaming either job requires updating the ruleset.

`.github/workflows/registry-import.yml` imports the registry into the production database. It runs every day at 04:17 UTC from `main` and can also be started by hand (**Actions → Registry import → Run workflow**); each run downloads the current export from the RPL. A failed run sends the author GitHub's failed-workflow email; a skipped or disabled schedule sends nothing and shows only as an aging `Stan rejestru na …` date on `/szukaj` and `/apteczka`, highlighted as a warning once it is more than 7 days old. In a public repository GitHub disables the schedule after 60 days without commits. To prevent that, every run also has a `keepalive` job that re-enables the workflow through the REST API (`gh api -X PUT …/enable`; only that job gets `actions: write`, the `import` job with the production secret does not). GitHub does not document that this resets the 60-day counter, so the dated warning stays the signal; if the schedule is disabled anyway, re-enable it with **Actions → Registry import → Enable workflow**. It reads the `REGISTRY_DATABASE_URL` repository secret and fails without it. The secret must be the Supavisor pooler connection string in **session mode** (port 5432, from **Connect** in the Supabase dashboard): GitHub runners have no IPv6, and the direct database host is IPv6-only. Leave out `sslmode`: for any non-local host the import always uses TLS and verifies the server against the Supabase root certificate in `supabase/prod-ca-2021.crt` (**Project Settings → Database → SSL Configuration**; replace the file when Supabase rotates it). The project has **Enforce SSL** turned on, so unencrypted connections are refused.

## Registry import

Source: the [Registry of Medicinal Products (RPL)](https://rejestrymedyczne.ezdrowie.gov.pl/rpl/search/public), full XML export version 6.0.0 at <https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/public-pl-report/6.0.0/overall.xml> (about 74 MB, generated for the current day). Without `--file` the import downloads it from that URL.

`npm run registry:import` loads the RPL export into the `registry_*` tables in one transaction. Products and packages missing from the export get `removed_at` instead of being deleted, and every successful import adds a row to `registry_imports`. The import aborts (and changes nothing) when the export is older than the last imported one or has fewer than 90% of the currently active products. Locally:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run registry:import -- --file scripts/fixtures/rpl-sample-v1.xml
```

Migrations reach the production Supabase project by hand, before the first import:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

## Deployment

The target is Cloudflare Workers (a Worker with static assets, not Pages). `.github/workflows/ci.yml`'s `deploy` job auto-deploys on every push to `main` that passes the `ci` job (the `smoke` job runs only on pull requests — code reaches `main` through a PR that already passed it), using `cloudflare/wrangler-action@v4` with a scoped `CLOUDFLARE_API_TOKEN` repository secret (Workers Scripts: Edit only — no DNS, no billing).

To deploy manually (e.g. to test a change before merging):

```bash
npx wrangler deploy
```

This needs a Cloudflare account and `wrangler` auth. `SUPABASE_URL` and `SUPABASE_KEY` are set as Worker secrets (`wrangler secret put`) and persist across deploys regardless of whether they're triggered by CI or manually.

### Password reset in production

**Configure the Supabase dashboard before merging** the password reset change: a merge deploys the code at once, and the default reset template links to `{{ .ConfirmationURL }}`, which lands on `/` and loses its parameters. Nothing here is applied from `supabase/config.toml`; set it by hand. Open the pull request without auto-merge, wait for green `ci` and `smoke`, configure the project, then merge.

1. **Custom SMTP** (**Authentication → Emails → SMTP Settings**). The built-in service sends only to members of the Supabase organization, 2 messages per hour. Most SMTP providers need a domain you own to send from. Keep the SMTP credentials out of the repository.
2. **Rate limits** (**Authentication → Rate Limits**): with custom SMTP the e-mail limit starts at 30 messages per hour; raise it if needed.
3. **Site URL** (**Authentication → URL Configuration**): the public address of the app, **without a trailing slash**. The reset link is built as `{{ .SiteURL }}/auth/reset-password?token_hash=…`, so a slash would produce `//auth/…`.
4. **Reset password template** (**Authentication → Emails → Email Templates**): subject `Ustaw nowe hasło w MamLek`, body copied from `supabase/templates/recovery.html`.
5. **Password changed notification** (**Authentication → Emails**, security notifications): turn it on, subject `Twoje hasło w MamLek zostało zmienione`, body copied from `supabase/templates/password_changed_notification.html`.
6. **Email OTP Expiration** (**Authentication → Sign In / Providers → Email**): 3600 seconds. The e-mail and the app promise a link valid for one hour.
7. **Password settings**: `Secure password change` (reauthentication for sessions older than 24 hours) may stay as it is, because the reset and `/konto/haslo` both change the password on a session created moments earlier. Keep `Require current password` off: the app does not send the current password to Supabase with the change.

Then reset the password of your own account on the deployed app: the message arrives (not in spam), the link signs you in after saving, and the notification follows.

Rollback: revert the merge and restore the default reset template.

## Working with AI agents

The project rules for coding agents are in [`AGENTS.md`](AGENTS.md). Product and planning documents live in `context/`.
