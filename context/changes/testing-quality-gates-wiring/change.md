---
change_id: testing-quality-gates-wiring
title: Test rollout Phase 4 — make the Phase 1–3 suites required gates and add the post-edit hook
status: impl_reviewed
created: 2026-10-17
updated: 2026-10-20
archived_at: null
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md: "Quality-gates wiring".
Risks covered: cross-cutting (locks the floor for #1-#6 shipped in Phases 1-3). Test types planned: gates.
Risk response intent: make the §5 "Quality Gates" rows marked "required after §3 Phase 4" enforced — unit + component (local + CI: verdict logic #1/#2, stale result state #3, search order #5) and kit access and input integration (CI on PR: cross-account access #4, invalid input #6) — plus the recommended post-edit hook (local agent loop). A gate counts only if a deliberately broken test actually blocks it (red CI check / hook signal reaching the agent), not just if the step runs. Notes under §3: CI runs `npx vitest run --project unit --project component` (the `hooks` project stays local); `test:db` and `test:api` already run in the CI `smoke` job since Phase 3, so Phase 4 only makes them required, it does not add them to CI.
After creating the folder, follow the downstream continuation rule.
