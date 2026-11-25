---
change_id: password-policy
title: Password policy
status: archived
created: 2026-11-24
updated: 2026-11-25
archived_at: 2026-11-25T13:01:20Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Phase 4 (2026-11-25)

- `amr` on local Supabase: `[{ "method": "password", "timestamp": <sign-in time> }]`; `timestamp` is unchanged after a token refresh, `iat` moves.
- `@supabase/ssr` ignores `cookieOptions.maxAge` (it forces 400 days), so the 30-day cap is applied in `setAll` (`sessionCookieMaxAge`). Checked: `Max-Age=2592000`.
- `test:api`: 1-3 unauthenticated `kit-access` cases per run get 500 from `wrangler dev` (body not read); the same happens without the phase 4 changes (3 runs on a stash of them), so it is not a regression.
- `perf` fast profile, list ready median: 933 ms before, 952 ms after (noise).
- Expiry checked with `SESSION_MAX_DAYS` = 1 minute (reverted): `/szukaj` after 75 s redirects to `/auth/signin?error=session_expired`.
