---
change_id: testing-registry-import-scripts
title: Registry import scripts dowodzą, że import zachowuje każdy poprawny produkt
status: impl_reviewed
created: 2026-10-21
updated: 2026-10-23
archived_at: null
---

## Notes

Open a change folder for rollout Phase 5 of context/foundation/test-plan.md: "Registry import scripts". Risks covered: #7. Test types planned: unit + database integration. Risk response intent: Risk #7 - a registry file with a malformed, empty, duplicated or unexpected record either imports every valid product intact or ends with a loud error and rollback; no product, substance or package silently disappears or changes meaning. Challenge: "the fixture import check passes, so real registry files import correctly" (fixtures only contain shapes someone thought of). Avoid: expected rows obtained by running the parser under test; the oracle is a hand-read source record. After creating the folder, follow the downstream continuation rule.
