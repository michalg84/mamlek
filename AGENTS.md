# Rules for AI

Setup, scripts, CI and deployment: see @README.md.

## Key conventions

- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod imported from `astro/zod` (zod is not a direct dependency). The existing auth routes predate this rule and cast `formData` values without validation.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`.

## Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- Both env vars are **optional**: when unset, `createClient()` returns `null`, auth is silently disabled (`locals.user` is always `null`), and `src/lib/config-status.ts` drives a warning banner. Every caller must handle the `null` client.
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

## Command tripwires

- `npx astro check` — type-check `.astro`/`.ts` files (not in `package.json` scripts; CI runs it after `npx astro sync`)
- `npm run smoke` — dependency-free auth-flow smoke test (`scripts/smoke.mjs`) against a running server, `BASE_URL` env (default `http://localhost:4321`). Run after dependency upgrades; CI runs it against the production preview with a local Supabase. It signs in right after sign-up, so it only passes when email confirmation is off — true for local Supabase (`enable_confirmations = false` in `supabase/config.toml`), usually not for a cloud project. The search-list steps also need the registry fixtures imported (the list must be non-empty; see `npm run registry:import` below), otherwise they fail with 404.
- `npm run roadmap:sync` — mirrors `context/foundation/roadmap.md` to GitHub Issues + the "MamLek Roadmap" project (one-way; GitHub edits to synced fields get overwritten). Run it after any roadmap status/item change (e.g. after `/10x-plan`, `/10x-implement`, `/10x-archive`, `/10x-roadmap`). Needs `gh` with the `project` scope (`gh auth refresh -h github.com -s project`, from a real terminal); `npm run roadmap:sync -- --dry-run` previews.
- `npm run registry:import` — imports the RPL registry XML (`scripts/registry-import.mjs`, parser in `scripts/lib/rpl-parser.mjs`) into `DATABASE_URL` as the table owner, in one transaction; `-- --file <path>` for a local file (default: download from RPL), `-- --dry-run` parses without a database. Exit 2 = usage error, 1 = import failed (rolled back). After changing the import, parser or `registry_*` migration, reset the local DB (`npx supabase db reset`), import `scripts/fixtures/rpl-sample-v1.xml` twice and `rpl-sample-v2.xml` once, then run `node scripts/registry-import-check.mjs` — CI's `smoke` job does exactly that. Production imports run only via the manual `.github/workflows/registry-import.yml` (secret `REGISTRY_DATABASE_URL`, Supavisor session-mode pooler, no `sslmode`). Non-local hosts always get TLS verified against `supabase/prod-ca-2021.crt`; one import per database at a time (advisory lock).

There is no unit test runner yet — `smoke` is the only automated test.

## Architecture

**Astro 7 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Runs on the Cloudflare workerd runtime (deploy target: see README).

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default.

## Product context

The PRD and stack decisions live in `context/foundation/` (`prd.md`, `tech-stack.md`). Read them before implementing features. Ignore `context/foundation/archive/` — it holds superseded versions. `supabase/migrations/`, `src/types.ts` and `src/components/hooks/` don't exist yet; create them following the conventions above.
