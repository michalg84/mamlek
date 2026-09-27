# MamLek

A shared home medicine cabinet for one household. The question it answers, at the doctor's office or at the pharmacy counter, is: _do we already have this medicine at home, or something with the same active substance?_ Matching uses the Polish Registry of Medicinal Products (Rejestr Produktów Leczniczych), not a hand-kept list of names.

Planned MVP:

- look up a medicine in the registry by product name, international name or active substance
- keep the household cabinet (package, expiry date, remaining quantity)
- import the cabinet in bulk from a CSV file, with a review screen before anything is saved
- check a medicine against the cabinet: you have it / you have a same-substance substitute / you don't

The full requirements are in [`context/foundation/prd.md`](context/foundation/prd.md) (in Polish), and the stack decision is in [`context/foundation/tech-stack.md`](context/foundation/tech-stack.md).

**Status:** early development. The app is currently the bootstrapped scaffold (Supabase auth, a protected `/dashboard`) and none of the product features exist yet.

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

| Command           | What it does                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `npm run dev`     | Dev server on the Cloudflare workerd runtime                                                |
| `npm run build`   | Production build                                                                            |
| `npm run preview` | Serve the production build                                                                  |
| `npm run lint`    | ESLint with type-checked rules (`lint:fix` to auto-fix)                                     |
| `npm run format`  | Prettier                                                                                    |
| `npx astro check` | Type-check `.astro` and `.ts` files                                                         |
| `npm run smoke`   | Auth-flow smoke test against a running server (`BASE_URL`, default `http://localhost:4321`) |

The smoke test signs up a throwaway user and signs in right away, so it needs email confirmation turned off.

A husky pre-commit hook runs lint-staged: `eslint --fix` on staged `ts`/`tsx`/`astro` files and `prettier --write` on `json`/`css`/`md` files.

## CI

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

- **ci**: `astro sync`, lint, `astro check`, build. The build uses the `SUPABASE_URL` and `SUPABASE_KEY` repository secrets.
- **smoke**: starts a local Supabase, builds the app, and runs `npm run smoke` against `npm run preview`.

## Deployment

The target is Cloudflare Workers (a Worker with static assets, not Pages) with auto-deploy on merge to `main`. This is planned and not wired into CI yet. Until then, deploy manually:

```bash
npx wrangler deploy
```

This needs a Cloudflare account and `wrangler` auth. Set `SUPABASE_URL` and `SUPABASE_KEY` as Worker secrets.

## Working with AI agents

The project rules for coding agents are in [`AGENTS.md`](AGENTS.md). Product and planning documents live in `context/`.
