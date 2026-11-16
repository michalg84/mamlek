---
change_id: audit-code-cleanup
title: Small code cleanup from the PRD conformance audit (F5 and error hygiene)
status: implemented
created: 2026-11-16
updated: 2026-11-16
archived_at: null
---

## Notes

— small cleanup per audit context/audits/prd-conformance/2026-11-16.md F5 (form hidden in suggestion by truncate; put form on its own line, confirm with ui:shots) and the code-hygiene finding (log getUser() error in middleware, pass badInput in KitAddForm, Polish messages per status + console.error with cause in KitAddForm, check signOut() result, restrict ?error= to known codes on signin/signup)
