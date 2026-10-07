# Search view reads design tokens — Plan Brief

> Full plan: `context/changes/search-view-tokens/plan.md`
> Research: `context/changes/search-view-tokens/research.md`

## What & Why

`/szukaj` — the medicine-name lookup, the app's only product screen so far — is painted with 24 hard-coded
purple/blue colours across four files, while the theme file (`src/styles/global.css`) sits unused. This change moves
the screen to a light "clinical teal" theme defined once in the token file, builds it from shared shadcn components,
and leaves a rule plus a CI check so the next screens start from the tokens instead of copying literals.

## Starting Point

Stock shadcn neutral tokens exist and are published correctly, but no view reads them (0 token classes); the screen
is dark by literals over a `bg-cosmic` gradient. Only one shared component (`Button`) is used, and it is restyled at
the call site. The Topbar is in English and links to the starter `/dashboard`.

## Desired End State

A signed-in user sees a light, readable `/szukaj`: off-white page, white card, deep slate text, one teal accent for
links, focus and the active suggestion, errors in red with an icon, a spinner while the list loads. The Topbar is
Polish ("Szukaj leku", "Wyloguj"). All colours come from `:root` in `global.css`; `npm run ui:scan` (in CI and
pre-commit) finds no literal colours in the four view files; `npm run ui:shots` screenshots every state at desktop
and phone width.

## Key Decisions Made

| Decision         | Choice                                                      | Why (1 sentence)                                                                                  | Source   |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| Contract variant | Fresh starter with a dead token file                        | Tokens and `Button` exist; the view reads none of them, so Phase 1 is wiring, not inventing.      | Research |
| Theme / mode     | Light, "A — Clinical teal" (from a 3-palette preview)       | Readable in daylight on old phones, reads medical, distinct from error red and the old purple.    | Plan     |
| Palette tuning   | Adjustable at the Phase 3 gate on the real screen           | The user wants to choose/adjust the theme; values live in one block, recorded in `palette.md`.    | Plan     |
| C4 scope         | Topbar only (Polish, link to `/szukaj`); redirect → S-03    | Home page should be S-03's check screen; avoids deciding the landing page twice.                  | Plan     |
| Other pages      | Later, in their own changes                                 | One view per change; follow-ups reuse the tokens. Temporary dark→light mismatch accepted.         | Plan     |
| Components       | shadcn `input` + `card`; native `<label>`                   | Shared focus/invalid styles with no new package; shadcn `label` would add `radix-ui`.             | Plan     |
| Visual gate      | Playwright script `npm run ui:shots` (11 states × 2 widths) | Shows the real view without splitting the review-hardened combobox; Playwright already installed. | Plan     |
| Guard            | AGENTS.md UI rule + `npm run ui:scan` in CI and pre-commit  | A failing check beats a rule an agent forgets; no new dependency.                                 | Plan     |
| Disabled state   | N/A                                                         | The field stays usable while the list loads (S-09 behaviour, measured by `npm run perf`).         | Research |

## Scope

**In scope:**

- Light `:root` token values (clinical teal) + `palette.md` record
- `szukaj.astro`, `Topbar.astro`, `RegistrySearch.tsx`, `MedicineSuggest.tsx` on tokens and `Input`/`Card`/`Button`
- Topbar in Polish, link to `/szukaj`
- Error/loading cues (icon, spinner), page-level failure styled apart from "not loaded"
- `scripts/ui-shots.mjs`, `scripts/ui-scan.mjs`, CI + pre-commit wiring, AGENTS.md UI section

**Out of scope:**

- Post-sign-in redirect and home page (→ S-03)
- Auth pages, Welcome, dashboard, Banner, form components (→ follow-up changes / S-03)
- Dark mode, removing `bg-cosmic`, shadcn `label`, any behaviour change in the combobox, screenshot pixel-diff baselines

## Architecture / Approach

10x-ui order: tools → token values → view → states → guard. Values change in `:root` first (invisible on `/szukaj`,
still painted by literals), then the view swaps literals for role classes (`bg-card`, `text-muted-foreground`,
`bg-accent`, `text-destructive`, `ring-ring`) in one pass. Every visual phase ends with `ui:shots` at 1280/390 px and
`ui:scan` (25 → 25 → 0 → 0 hits). Behaviour, ARIA, live regions, the loading text and `role="combobox"` (used by
`npm run perf`) stay untouched.

## Phases at a Glance

| Phase                    | What it delivers                                                  | Key risk                                                          |
| ------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1. Environment and tools | `input`/`card`, `ui:shots`, `ui:scan`, "before" screenshots       | Forcing loading/error states reliably in Playwright               |
| 2. Token values          | Clinical teal in `:root`, `palette.md`                            | Focus ring/disabled colour shifts slightly on auth-page buttons   |
| 3. View reads tokens     | Four files on tokens + components, Polish Topbar, 0 scan hits     | Breaking the hardened combobox while swapping `<input>` → `Input` |
| 4. States                | Error icon, spinner, failure styling, `states.md`, contrast audit | Focus ring too faint on light background (fix at `--ring`)        |
| 5. Guard                 | AGENTS.md rule, scan in CI + pre-commit, charge ledger            | Scan list must grow as other views get cleaned                    |

**Prerequisites:** local Supabase with email confirmation off and the registry imported; `npx playwright install chromium` done once.
**Estimated effort:** ~2–3 sessions across 5 phases (phases 1 and 3 are the largest).

## Open Risks & Assumptions

- The light `/szukaj` sits between dark cosmic pages (sign-in before, Welcome Topbar) until the follow-up changes land.
- Palette values are a proposal; contrast is verified by Lighthouse in Phase 4, and `--ring`/`--input` may need darkening.
- Page-level server states (registry missing / query failure) are checked by hand, not by the script.

## Success Criteria (Summary)

- `/szukaj` looks consistent and light, with every colour traceable to one token block the user chose.
- Errors, loading and keyboard focus are visible without relying on colour alone, at desktop and phone width.
- A new literal colour in the cleaned files fails pre-commit and CI.
