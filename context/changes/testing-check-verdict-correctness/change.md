---
change_id: testing-check-verdict-correctness
title: Test rollout Phase 1 — check verdict correctness
status: implementing
created: 2026-10-10
updated: 2026-10-13
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Check verdict correctness".
Risks covered: #1 (the check answers "nie masz" for a medicine, or a same-substance medicine, that is in the kit), #2 (the check reports "same substance" for a medicine that is not). Test types planned: unit + database integration. This phase also bootstraps the test runner (none exists yet).
Risk response intent:

- #1: prove that with the medicine in the kit (other pack size, parallel import, withdrawn pack, or another product with the same substance) the verdict the user sees is never "nie masz", from the database rule through to the screen.
- #2: prove that partial substance overlaps, placeholders and similar names never produce a same-substance verdict, and that the consult-a-pharmacist notice appears with every same-substance verdict.

After creating the folder, follow the downstream continuation rule: suggest the next natural command (/10x-research) with its query, without returning to /10x-test-plan.
