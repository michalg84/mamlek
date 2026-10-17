---
change_id: testing-kit-access-and-input-boundaries
title: Test rollout Phase 3 — kit access isolation and input boundaries
status: archived
created: 2026-10-17
updated: 2026-10-17
archived_at: 2026-10-17T20:33:55Z
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Kit access and input boundaries".
Risks covered: #4 (one household account reads or changes another account's kit, or kit data is reachable without a session), #6 (kit endpoints accept invalid data or answer it with a 500). Test types planned: database + API integration.
Risk response intent:

- #4: a second signed-in user cannot read, check against, add to, edit or delete the first user's kit, neither through the app API nor directly through the data API; an anonymous caller gets nothing. Challenge "signed in means authorised" and "table RLS also covers the database function". Avoid mocking the Supabase client (a mock cannot prove RLS) and testing only through the UI.
- #6: out-of-range, wrong-type, oversized, not-in-registry or withdrawn-pack input gets a clean 4xx, writes nothing and leaks no internals. Challenge "the form validates, so the server is safe". Avoid restating the validation schema in the test; boundaries come from the PRD and the database column limits.
