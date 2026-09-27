---
name: ci-check
description: Verify local changes the way CI does — astro sync, lint, astro check, build, and optionally the auth smoke test. Use before declaring work done, after dependency upgrades, or when the user asks to "run CI locally", "verify", or "check the build".
---

Run the same sequence as the `ci` job in `.github/workflows/ci.yml`, in order, stopping at the first failure:

1. `npx astro sync` — regenerates `astro:env` / content types; `astro check` gives false errors without it.
2. `npm run lint` — type-checked ESLint (also enforces Prettier). If it fails on formatting only, run `npm run lint:fix` once and re-run.
3. `npx astro check`
4. `npm run build`

Then decide on the smoke test (mirrors the CI `smoke` job):

- Only run it if the change touches auth, middleware, Supabase, `astro.config.mjs`, or dependencies — or the user asked for it (`$ARGUMENTS` contains `smoke`).
- It needs local Supabase running (`npx supabase status`; if not running, ask before `npx supabase start` — it requires Docker) and `.env` / `.dev.vars` pointing at it. Against a cloud Supabase project it fails when email confirmation is on — that's expected, not a regression.
- Start `npm run preview` in the background, wait until `http://localhost:4321` responds, run `npm run smoke`, then stop the preview server.

Report each step as pass/fail. On failure, show the relevant error lines and the likely cause — don't paste full logs. Don't fix code unless the user asked for fixes.
