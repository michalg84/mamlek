---
deployed_at: 2026-09-27
platform_decision: context/foundation/infrastructure.md
worker_url: https://mamlek.mig-app.workers.dev
cloudflare_account: michalgalka84@gmail.com
workers_dev_subdomain: mig-app
---

# First production deploy

First manual deployment of the bootstrapped scaffold (Supabase auth + protected
`/dashboard`, no product features yet) to Cloudflare Workers, following the
platform decision in `context/foundation/infrastructure.md`.

## What was done

1. Cloudflare account confirmed, upgraded to Workers Paid plan.
2. `npx wrangler login` — authenticated as `michalgalka84@gmail.com`.
3. New Supabase cloud project created in the **Frankfurt (eu-central-1)** region,
   email confirmation left **on** (stricter than the local dev stack default).
4. Worker secrets set via `wrangler secret put` (values typed at the interactive
   prompt, never pasted into a file or chat):
   - `SUPABASE_URL`
   - `SUPABASE_KEY` (new-style `sb_publishable_...` key, not the legacy JWT anon key)
5. `npm run build`, then `npx wrangler deploy`.
   - The adapter auto-provisioned a `SESSION` KV namespace (`mamlek-session`) and
     an `IMAGES` binding on first deploy — resolves the "unknown unknown" flagged
     in `infrastructure.md`'s risk register; no manual namespace creation needed.
   - First deploy failed until a `workers.dev` subdomain was registered for the
     account (one-time, dashboard-only action — no `wrangler` subcommand for it).
   - The account's default subdomain (`michalgalka84-800`) leaked the owner's
     email local-part into the public Worker URL; changed via **Workers & Pages
     → Overview → Your subdomain → Change** to `mig-app` before going further.
6. Verified end-to-end:
   - `GET /` → 200
   - `GET /dashboard` (unauthenticated) → 302 to `/auth/signin`
   - Real sign-up → email confirmation → sign-in → landed on `/dashboard`, proving
     the deployed Worker reaches the cloud Supabase project.
   - `wrangler deployments list` shows both deploys recorded (rollback available
     via `wrangler rollback <VERSION_ID>`).

## Secrets (values not recorded here)

| Secret         | Where it lives                      |
| -------------- | ----------------------------------- |
| `SUPABASE_URL` | Cloudflare Worker secret (`mamlek`) |
| `SUPABASE_KEY` | Cloudflare Worker secret (`mamlek`) |

## Explicitly not done in this pass

- CI auto-deploy-on-merge (`ci.yml` still only lints/checks/builds/smoke-tests;
  deploy remains manual `wrangler deploy` for now).
- The daily registry-import GitHub Actions job (PRD FR-001) — no product code
  for it exists yet.
- Upgrading `wrangler` past 4.131.1 for Worker Previews — not needed yet.
