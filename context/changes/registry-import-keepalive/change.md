---
change_id: registry-import-keepalive
title: Keep the daily registry import alive past GitHub's 60-day schedule shutoff
status: impl_reviewed
created: 2026-11-18
updated: 2026-11-18
archived_at: null
---

## Notes

Roadmap slice S-16 (context/foundation/roadmap.md). GitHub disables scheduled workflows in a public repository after 60 days without repository activity, so the daily RPL import (`.github/workflows/registry-import.yml`, S-07) could stop silently. Open question from the roadmap: keepalive step calling the workflow API (e.g. `gautamkrishnar/keepalive-workflow` in API mode — check that it resets the counter), an external cron on Cloudflare, or only a warning when the registry state date is older than 7 days (RPL publication delays may cause false alarms). The author decides.
