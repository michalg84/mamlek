---
name: ci-check
description: Verify local changes the way CI does — astro sync, lint, astro check, unit + component tests, build, and optionally the auth smoke test. Use before declaring work done, after dependency upgrades, or when the user asks to "run CI locally", "verify", or "check the build".
---

Run the same sequence as the `ci` job in `.github/workflows/ci.yml`, in order, stopping at the first failure:

1. `npx astro sync` — regenerates `astro:env` / content types; `astro check` gives false errors without it.
2. `npm run lint` — type-checked ESLint (also enforces Prettier). If it fails on formatting only, run `npm run lint:fix` once and re-run.
3. `npx astro check`
4. `npx vitest run --project unit --project component` — unit and component tests (the `hooks` project stays local, run `npm test` for it too when you changed a hook).
5. `npm run build`

Then decide on the smoke test (mirrors the CI `smoke` job):

- Only run it if the change touches auth, middleware, Supabase, `astro.config.mjs`, or dependencies — or the user asked for it (`$ARGUMENTS` contains `smoke`).
- It needs local Supabase running (`npx supabase status`; if not running, ask before `npx supabase start` — it requires Docker) and `.env` / `.dev.vars` pointing at it. Against a cloud Supabase project it fails when email confirmation is on — that's expected, not a regression.
- Registry import (CI runs it before the build): if the change touches `scripts/registry-import*.mjs`, `scripts/lib/rpl-parser.mjs`, `scripts/fixtures/` or a `registry_*` migration, run it on a fresh local DB — `npx supabase db reset` (wipes local data; ask first if the user may have local data to keep), then with `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres` run `npm run registry:import -- --file scripts/fixtures/rpl-sample-v1.xml` twice, `npm run registry:import -- --file scripts/fixtures/rpl-sample-v2.xml` once, and `node scripts/registry-import-check.mjs`. Every command must exit 0.
- Start `npm run preview` in the background, wait until `http://localhost:4321` responds, run `npm run smoke`, then stop the preview server.

Report each step as pass/fail. On failure, show the relevant error lines and the likely cause — don't paste full logs. Don't fix code unless the user asked for fixes.
