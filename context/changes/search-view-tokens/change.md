---
change_id: search-view-tokens
title: Search view reads design tokens
status: implementing
created: 2026-10-07
updated: 2026-10-07
archived_at: null
---

## Notes

UI change run through `/10x-ui`.

- **View (one):** `/szukaj` — `src/pages/szukaj.astro`, `src/components/Topbar.astro`, `src/components/registry/RegistrySearch.tsx`, `src/components/registry/MedicineSuggest.tsx`.
- **Token source:** `src/styles/global.css` (`:root` / `.dark` values, published via `@theme inline`; plus the custom `@utility bg-cosmic`).
- **Components:** `src/components/ui/` (shadcn/ui, "new-york"; currently only `button.tsx`, `LibBadge.astro`). Add missing ones via `npx shadcn@latest add <name>`.
- **Contract variant:** fresh starter with a dead token file — the stock shadcn tokens exist, the view reads none of them (0 token-class usages, 24 hardcoded-value scan hits on 2026-10-07: szukaj 4, Topbar 7, RegistrySearch 4, MedicineSuggest 9). Phase 1 makes the view read tokens; new values come after.
