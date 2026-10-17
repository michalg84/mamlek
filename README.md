# MamLek

A shared home medicine cabinet for one household. The question it answers, at the doctor's office or at the pharmacy counter, is: _do we already have this medicine at home, or something with the same active substance?_ Matching uses the Polish Registry of Medicinal Products (Rejestr Produktów Leczniczych), not a hand-kept list of names.

Planned MVP:

- look up a medicine in the registry by product name, international name or active substance
- keep the household cabinet (package, expiry date, remaining quantity)
- import the cabinet in bulk from a CSV file, with a review screen before anything is saved
- check a medicine against the cabinet: you have it / you have a same-substance substitute / you don't

The full requirements are in [`context/foundation/prd.md`](context/foundation/prd.md) (in Polish), and the stack decision is in [`context/foundation/tech-stack.md`](context/foundation/tech-stack.md).

**Status:** early development. Working so far: registry search (`/szukaj`, the entry page after sign-in), the household cabinet (`/apteczka`, adding a package from the registry) and the medicine check against the cabinet on `/szukaj`. The CSV import is not built yet.

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

### Using a cloud Supabase project

Set `SUPABASE_URL` (Project URL) and `SUPABASE_KEY` (the `anon` key) from **Settings → API** in the Supabase dashboard, in both `.env` and `.dev.vars`. Cloud projects require email confirmation by default. You can turn it off under **Authentication → Email → Confirm email**.

## Scripts

| Command                   | What it does                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`             | Dev server on the Cloudflare workerd runtime                                                                                                         |
| `npm run build`           | Production build                                                                                                                                     |
| `npm run preview`         | Serve the production build                                                                                                                           |
| `npm run lint`            | ESLint with type-checked rules (`lint:fix` to auto-fix)                                                                                              |
| `npm run format`          | Prettier                                                                                                                                             |
| `npx astro check`         | Type-check `.astro` and `.ts` files                                                                                                                  |
| `npm run smoke`           | Auth-flow smoke test against a running server (`BASE_URL`, default `http://localhost:4321`)                                                          |
| `npm test`                | Unit and component tests (Vitest; `npm run test:watch` to watch), no database needed                                                                 |
| `npm run test:db`         | Rule tests of `medicine_check` and kit isolation (RLS, `anon`) against a local Supabase (`DATABASE_URL`, needs `npx supabase db reset`), rolled back |
| `npm run test:api`        | Black-box tests of `/api/kit*` on a running server (`BASE_URL` + local `DATABASE_URL`, needs the registry fixtures imported)                         |
| `npm run roadmap:sync`    | One-way sync of the roadmap to GitHub Issues + Project (`-- --dry-run` to preview; needs `gh` with `project` scope)                                  |
| `npm run registry:import` | Imports the Polish medicines registry (RPL XML export) into `DATABASE_URL` (`-- --file <path>` for a local file, `-- --dry-run` to parse only)       |

The smoke test signs up a throwaway user and signs in right away, so it needs email confirmation turned off.

A husky pre-commit hook runs lint-staged: `eslint --fix` on staged `ts`/`tsx`/`astro` files and `prettier --write` on `json`/`css`/`md` files.

## CI

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

- **ci**: `astro sync`, lint, `astro check`, build. The build uses the `SUPABASE_URL` and `SUPABASE_KEY` repository secrets.
- **smoke**: starts a local Supabase (which applies the migrations), imports the registry fixtures (`scripts/fixtures/rpl-sample-v1.xml` twice, then `rpl-sample-v2.xml`) and verifies the result with `node scripts/registry-import-check.mjs` and the `medicine_check` rule and kit isolation tests (`npm run test:db`), then builds the app and runs `npm run smoke` and the kit API tests (`npm run test:api`) against `npm run preview`.

`.github/workflows/registry-import.yml` imports the registry into the production database. It runs every day at 04:17 UTC from `main` and can also be started by hand (**Actions → Registry import → Run workflow**); each run downloads the current export from the RPL. A failed run sends the author GitHub's failed-workflow email; a skipped or disabled schedule sends nothing and shows only as an aging `Stan rejestru na …` date on `/szukaj`. It reads the `REGISTRY_DATABASE_URL` repository secret and fails without it. The secret must be the Supavisor pooler connection string in **session mode** (port 5432, from **Connect** in the Supabase dashboard): GitHub runners have no IPv6, and the direct database host is IPv6-only. Leave out `sslmode`: for any non-local host the import always uses TLS and verifies the server against the Supabase root certificate in `supabase/prod-ca-2021.crt` (**Project Settings → Database → SSL Configuration**; replace the file when Supabase rotates it). The project has **Enforce SSL** turned on, so unencrypted connections are refused.

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

## Working with AI agents

The project rules for coding agents are in [`AGENTS.md`](AGENTS.md). Product and planning documents live in `context/`.
