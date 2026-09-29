---
change_id: roadmap-github-sync
title: Sync roadmap.md items to GitHub Issues and a GitHub Project board
status: implemented
created: 2026-09-29
updated: 2026-09-29
archived_at: null
---

## Notes

One-way mirror of `context/foundation/roadmap.md` (F-NN/S-NN) into GitHub: issues, milestone, a Projects board with roadmap statuses, and blocked-by dependencies. Triggered locally via `npm run roadmap:sync`. GitHub Projects was chosen over Linear (solo project, code/PR/CI already on GitHub, `Closes #N` auto-close).
