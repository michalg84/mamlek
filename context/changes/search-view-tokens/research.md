---
date: 2026-10-07T12:08:50+02:00
researcher: Claude (Opus 5.5)
git_commit: f072f25
branch: main
repository: michalg84/mamlek
topic: "UI audit of /szukaj against the design-system contract (tokens + shared components)"
tags: [research, ui, design-tokens, shadcn, szukaj, MedicineSuggest, RegistrySearch, Topbar]
status: complete
last_updated: 2026-10-07
last_updated_by: Claude (Sonnet 5.5)
---

# Research: UI audit of /szukaj against the design-system contract

**Date**: 2026-10-07T12:08:50+02:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: f072f25
**Branch**: main
**Repository**: michalg84/mamlek

## Research Question

Two-way audit of the `/szukaj` view (the core flow: look up a medicine by name) for the
`/10x-ui` change `search-view-tokens`: where values and shared components live, which of
them the view reads, which literals in the view should have been a token or a component,
and what a user sees when reaching the view in a non-happy state. Output: 3–5 charges with
file, line and user impact, plus the current 7-state matrix, as input to `/10x-plan`.

Scope (files read in full): `src/pages/szukaj.astro`, `src/components/Topbar.astro`,
`src/components/registry/RegistrySearch.tsx`, `src/components/registry/MedicineSuggest.tsx`,
`src/layouts/Layout.astro`, `src/styles/global.css`, `src/components/ui/button.tsx`,
`components.json`, `src/pages/dashboard.astro`, `src/pages/index.astro`,
`src/components/auth/SubmitButton.tsx`. Searched: `src/**`, `AGENTS.md`, `CLAUDE.md`,
`context/foundation/{prd,tech-stack,lessons}.md`, `context/archive/**/*.md`.

## Summary

`/szukaj` is a **fresh starter with a dead token file**. `src/styles/global.css` ships the
stock shadcn "neutral" tokens (`:root` light values at lines 6–39, `.dark` values at 41–73,
published via `@theme inline` at 75–111), but the four view files use **0** token colour
classes and **24** hardcoded-value scan hits (szukaj.astro 4, Topbar.astro 7,
RegistrySearch.tsx 4, MedicineSuggest.tsx 9; Layout.astro 0). The view is painted dark by
literals on top of `bg-cosmic` (a hex gradient utility, `global.css:113-115`), while the
token layer is in **light** mode: no file under `src/` applies a `dark` class (search for
`"dark"`, `class="dark`, `classList…dark`, `dark:` outside `button.tsx` returned nothing), so
`body` gets the light `--background` (`global.css:121-122`). Any palette chosen in the token
file today would not reach this screen.

The only shared component the view imports is `Button` (`MedicineSuggest.tsx:3`), used once
and restyled at the call site (`MedicineSuggest.tsx:124`). The input, its label, the
suggestion list, the result card and all Topbar controls are hand-rolled.

The entry architecture is starter-shaped: sign-in redirects to `/` (`api/auth/signin.ts:19`),
which renders the starter `Welcome` (`index.astro:1-8`), and the Topbar on `/szukaj` is in
English and links to the starter `/dashboard`, whose purpose is a button to `/szukaj`
(`dashboard.astro:17-22`).

Five charges follow; three product choices for the plan are listed under Open Questions.

## Charges

Each charge: category, evidence (file:line), effect on the user, and the token/component
that should cover it. None is deferred yet — `/10x-plan` maps each to a phase or defers it
with a reason.

### C1 — Missing tokens: the view ignores the token layer, and the token layer is in the wrong mode

- **Category**: Missing tokens.
- **Evidence**:
  - Surface/text by palette: `szukaj.astro:37` (`bg-cosmic`), `szukaj.astro:40`
    (`border-white/10 bg-white/10 text-white backdrop-blur-xl`), `RegistrySearch.tsx:20`
    (`border-white/10 bg-white/5`), `Topbar.astro:5` (`border-white/10 bg-white/5 text-white/80`).
  - Secondary text in 3 different blue shades/opacities: `szukaj.astro:45,49`
    (`text-blue-100/80`), `MedicineSuggest.tsx:164` (`/80`), `MedicineSuggest.tsx:221,229`
    and `Topbar.astro:8,22` (`/70`), `RegistrySearch.tsx:12` (`/60`).
  - Heading as a blue→purple gradient with transparent text: `szukaj.astro:41`.
  - Popover surface: `MedicineSuggest.tsx:202` (`bg-slate-900`, `border-white/20`, `divide-white/10`).
  - Token values unused and in light mode: `global.css:6-39` (`:root`), `global.css:41-73`
    (`.dark`, never activated), `global.css:113-115` (`bg-cosmic` hex values outside the token block).
- **Effect on the user**: the screen's look is fixed in four files; changing a colour or
  adding a theme means hunting literals, and the three "muted" shades make secondary text
  (labels, hints, details) look inconsistent from row to row.
- **Should be**: `bg-background` / `text-foreground` for the page, `bg-card` + `border` for
  the panel and result card, `text-muted-foreground` for labels/hints/details,
  `bg-popover text-popover-foreground` for the suggestion list, `text-foreground` (plain
  heading) instead of the gradient; values live in `:root`/`.dark`, and the view's mode
  (dark by default vs light) is chosen at the token layer, not in classes.

### C2 — Missing tokens in the states: focus, error, active option and failure bypass roles

- **Category**: Missing tokens (states — the cells that drift first).
- **Evidence**:
  - Input focus: `MedicineSuggest.tsx:191` uses `focus:` (fires on mouse focus too, not only
    keyboard) with `ring-purple-400`, not the `--ring` token.
  - Topbar controls: `Topbar.astro:10,14,24,27` have hover styles only; their focus outline
    comes from the global `outline-ring/50` (`global.css:119`) — the light-mode `--ring`
    (`oklch(0.708 0 0)`, `global.css:25`) at 50 % on a near-black background. Visibility
    **not verified in a browser** (inference from values).
  - Error text: `MedicineSuggest.tsx:229` switches to `text-red-300`, not `text-destructive`;
    it sits in the same place, size and weight as the neutral hint.
  - Server-side failure on page load: `szukaj.astro:45` renders "Nie udało się wczytać
    rejestru leków…" in the same `text-blue-100/80` as the neutral empty message at
    `szukaj.astro:49`.
  - Active suggestion: `MedicineSuggest.tsx:217` `bg-purple-500/30`; hover
    `MedicineSuggest.tsx:216` `hover:bg-white/10`.
- **Effect on the user**: a keyboard user may not see where focus is in the Topbar; an
  error ("Sesja wygasła…", "Nie udało się wczytać listy leków.") is told apart from a hint
  only by a pink tint, and a page-level failure looks identical to "registry not loaded yet".
- **Should be**: `focus-visible:ring-ring` (own `--ring` value tuned for the chosen mode),
  `text-destructive` plus a non-colour cue (icon or weight) for errors, `bg-accent
text-accent-foreground` for the active/hovered option.

### C3 — Missing shared components: hand-rolled input, card and links; Button restyled at the call site

- **Category**: Missing shared component.
- **Evidence**:
  - `src/components/ui/` holds only `button.tsx` and `LibBadge.astro`; `components.json`
    (style `new-york`, baseColor `neutral`, css `src/styles/global.css`) is configured, so
    `npx shadcn@latest add input label card` is the stack's own path.
  - Hand-rolled input: `MedicineSuggest.tsx:167-192` (all styling in one className at 191);
    shadcn `Input` would bring `focus-visible` ring, `aria-invalid` and `disabled` styles.
  - Hand-rolled label: `MedicineSuggest.tsx:164-166`.
  - Hand-rolled card: `RegistrySearch.tsx:20-36` (`VariantCard`).
  - `Button variant="outline"` overridden with white literals: `MedicineSuggest.tsx:119-127`
    (className at 124) — the same pattern as the auth `SubmitButton.tsx:18`
    (`bg-purple-600 … hover:bg-purple-500`), outside this view.
  - Topbar links and the sign-out `<button>` restyled per element: `Topbar.astro:10,14,24,27`
    — candidates for `Button variant="link"`/`"ghost"` (`button.tsx:18-19`).
- **Effect on the user**: the search field — the one control the whole flow depends on — has
  no shared focus/invalid/disabled styling, and the "Spróbuj ponownie" button will not follow
  a theme change because its colours are pinned at the call site.
- **Should be**: install `input`, `label`, `card` via shadcn; use `Button` variants without
  colour overrides.
- **Note**: the combobox behaviour (ARIA, keyboard, live regions) in `MedicineSuggest.tsx`
  was fixed after review in S-01 (see Historical Context); restyling must keep the input's
  attributes (`MedicineSuggest.tsx:168-190`) and the listbox `onMouseDown` guard (199-201).

### C4 — Accidental architecture: the path to /szukaj runs through starter pages, with English chrome

- **Category**: Accidental architecture.
- **Evidence**:
  - Sign-in success redirects to `/` (`src/pages/api/auth/signin.ts:19`); sign-out too
    (`signout.ts:9`). `/` renders the starter `Welcome` (`index.astro:1-8`), which contains
    the Topbar (`Welcome.astro:2,18`) and sign-in/up links (`Welcome.astro:30,36`).
  - Topbar on `/szukaj` links to "Dashboard" (`Topbar.astro:10`); `/dashboard` is starter
    content ("Welcome, …", "This page is only for authenticated users.",
    `dashboard.astro:10-15`) whose only product link is "Szukaj leku" (`dashboard.astro:17-22`).
  - Topbar labels are English ("Dashboard", "Sign out", "Not signed in", "Sign in",
    "Sign up", `Topbar.astro:11,15,22,25,28`) while the document is `lang="pl"`
    (`Layout.astro:14`) and the view is Polish.
  - Logged-out entry is handled: `/szukaj` is in `PROTECTED_ROUTES` (`middleware.ts:4`) and
    redirects to `/auth/signin` (`middleware.ts:19-22`); no raw JSON reaches the user on this path.
- **Effect on the user**: after logging in, the user lands on a starter welcome page and needs
  two more taps (Dashboard → Szukaj leku) to reach the only product feature; on `/szukaj` a
  screen reader reads English labels with Polish pronunciation.
- **Should be**: Topbar in Polish with a link to `/szukaj` instead of `/dashboard`; the
  post-sign-in target (`signin.ts:19`) points at `/szukaj`. The redirect touches an auth
  route outside the view's files — the plan decides whether it is in scope or deferred.

### C5 — Accidental architecture: no UI rule, so every other view repeats the literals

- **Category**: Accidental architecture (agent rules).
- **Evidence**:
  - `AGENTS.md` "Key conventions" covers `cn()` and shadcn location/install, but says
    nothing about tokens or literal colours; no rule invites arbitrary values (search for
    `arbitrary` and `-[` in `AGENTS.md`/`CLAUDE.md` returned nothing).
  - Same scan on other views (not in scope, for drift context): `Welcome.astro` 20,
    `Banner.astro` 9, `dashboard.astro` 7, `FormField.tsx` 5, `signin`/`signup`/`confirm-email.astro`
    4 each, `SubmitButton.tsx` 2, `LibBadge.astro` 2, `PasswordToggle`/`ServerError`/`SignUpForm` 1,
    `index.astro`/`SignInForm.tsx` 0. All six pages using `bg-cosmic` are listed by
    `grep bg-cosmic`: Welcome, confirm-email, signin, signup, dashboard, szukaj.
- **Effect on the user**: indirect — the next view (e.g. the medicine-cabinet list from the
  PRD) will copy the purple/blue literals, and a theme fixed on `/szukaj` will not carry over.
- **Should be**: a short UI block in `AGENTS.md` (outside the 10x-cli markers in
  `CLAUDE.md`): tokens in `global.css`, components in `src/components/ui/`, add via
  `npx shadcn@latest add`, no palette classes or arbitrary colours in views, kitchen-sink
  location. Optional lint check — the repo has ESLint (CI `lint` step); a new rule
  dependency would be the learner's call.

### Charge ledger (2026-10-07)

- **C1** — addressed (Phases 2-3).
- **C2** — addressed (Phase 4).
- **C3** — addressed (Phases 1 and 3).
- **C4** — Topbar addressed; the redirect (`signin.ts:19`) and the home page deferred to S-03. The Topbar no longer links to `/dashboard`, so that page is intentionally unreachable from the UI until S-03 replaces it, and the light Topbar sits on the dark Welcome page until then.
- **C5** — rule (`AGENTS.md` `## UI`) and `ui:scan` addressed; other views deferred (auth pages to their own 10x-ui change; Welcome/dashboard are replaced in S-03).

## Detailed Findings

### Token source (source → views)

- `global.css:6-39` light values, `global.css:41-73` dark values (stock shadcn neutral,
  `components.json` `baseColor: "neutral"`), `global.css:75-111` `@theme inline` publishing
  them as `--color-*` — the split is correct (values in `:root`/`.dark`, references in
  `@theme inline`), so no dark-mode break at the publishing layer.
- `global.css:4` defines the `dark` variant as `&:is(.dark *)`, i.e. dark tokens apply only
  under an element with class `dark`; none exists in `src/` (inspected search above).
- `global.css:117-124` base layer: `border-border outline-ring/50` on every element,
  `bg-background text-foreground` on `body`. `/szukaj` covers the body with `bg-cosmic min-h-screen`
  (`szukaj.astro:37`), so the light body background is not visible on this view.
- Token colour classes in the four view files: 0 (search for
  `(bg|text|border|ring)-(primary|secondary|muted|accent|destructive|background|foreground|card|popover|input|ring|border)`).
- Changing token values affects outside this view: `Button` consumers
  (`SubmitButton.tsx:15`, colours overridden at line 18, so only focus ring/disabled change)
  and the base layer (body background, default border and outline colour) on every page.

### Hardcoded-value scan (view → source), 2026-10-07

| File                                          | Hits   | Lines                                       |
| --------------------------------------------- | ------ | ------------------------------------------- |
| `src/pages/szukaj.astro`                      | 4      | 40, 41, 45, 49                              |
| `src/components/Topbar.astro`                 | 7      | 5, 8, 10, 14, 22, 24, 27                    |
| `src/components/registry/RegistrySearch.tsx`  | 4      | 12, 13, 20, 21                              |
| `src/components/registry/MedicineSuggest.tsx` | 9      | 111, 124, 164, 191, 202, 216, 217, 221, 229 |
| `src/layouts/Layout.astro`                    | 0      | —                                           |
| **Total**                                     | **24** |                                             |

Not counted by the scan but literal: `bg-cosmic` (`szukaj.astro:37`, hex in `global.css:114`).
`max-h-[min(24rem,50vh)]` (`MedicineSuggest.tsx:202`) is an arbitrary value the scan pattern
does not match; it is a layout constraint, not a colour — candidate to keep.

### 7-state matrix — current state of /szukaj

| State         | Today                                                                                                                                   | Evidence                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| default       | literals only, no tokens/components except one Button                                                                                   | C1, C3                                                                    |
| hover         | literal (`hover:bg-white/10`, `hover:text-purple-100`)                                                                                  | `MedicineSuggest.tsx:216`, `Topbar.astro:10`                              |
| focus-visible | input: `focus:` + `ring-purple-400`; Topbar: global grey outline at 50 %, unverified                                                    | `MedicineSuggest.tsx:191`, `global.css:119`                               |
| disabled      | not rendered: the input is never disabled, also during loading                                                                          | `MedicineSuggest.tsx:167-192`                                             |
| error         | `text-red-300` hint-style text + retry Button / sign-in link; page-level failure in neutral style                                       | `MedicineSuggest.tsx:115-128,229`, `szukaj.astro:45`                      |
| empty         | registry not imported: neutral sentence; no match: "Brak leku o takiej nazwie w rejestrze"; no result selected: nothing below the field | `szukaj.astro:49`, `MedicineSuggest.tsx:133-134`, `RegistrySearch.tsx:50` |
| loading       | text "Wczytywanie listy leków…" under an enabled input; no skeleton/spinner                                                             | `MedicineSuggest.tsx:105-106`                                             |

Whether "disabled" applies is a plan decision (the input stays usable while the list loads by
design of S-09's "typing during loading" measurement — see Historical Context); it may be
N/A with that reason.

## Code References

- `src/styles/global.css:4` — `dark` custom variant (`.dark *`)
- `src/styles/global.css:6-73` — token values, light and dark
- `src/styles/global.css:75-111` — `@theme inline` publishing
- `src/styles/global.css:113-115` — `bg-cosmic` hex gradient
- `src/styles/global.css:117-124` — base layer (border, outline, body)
- `src/pages/szukaj.astro:37-53` — page shell, heading, failure/empty messages
- `src/components/Topbar.astro:5-33` — Topbar, English labels, `/dashboard` link
- `src/components/registry/MedicineSuggest.tsx:105-142` — status/message state machine
- `src/components/registry/MedicineSuggest.tsx:162-238` — input, listbox, messages markup
- `src/components/registry/RegistrySearch.tsx:9-38` — `Field`, `VariantCard`
- `src/components/ui/button.tsx:7-33` — Button variants (token-driven)
- `src/pages/api/auth/signin.ts:19` — post-sign-in redirect to `/`
- `src/middleware.ts:4,19-22` — `/szukaj` protected, redirect to sign-in
- `src/layouts/Layout.astro:14` — `lang="pl"`

## Architecture Insights

- Token publishing is already correct shadcn v4 style; the gap is consumption (no view reads
  it) and mode (dark look, light tokens). Phase 1 can make `/szukaj` read tokens without
  choosing new values; the visual result then depends on the mode/palette decision.
- Making the app dark by default is a one-line change at the root (`class="dark"` on
  `<html>` in `Layout.astro:14`), but it changes base-layer colours on every page; pages that
  still use literals keep their look because they paint over the body.
- `MedicineSuggest` mixes behaviour and presentation in one file; the behaviour was
  hardened by review (ARIA, live region timing, mousedown guard). A token pass should touch
  only `className` values and the input/label element swap.
- PRD: the MVP targets the mobile browser (`prd.md:274-275`), used in a doctor's office or a
  pharmacy under time pressure (`prd.md:47-52`), on phones up to eight years old
  (`prd.md:197`) — relevant to the mobile screenshot width and to contrast choices.

## Historical Context (from prior changes)

- `context/archive/2026-10-02-registry-search-suggestions/reviews/impl-review.md:37` — the
  listbox scrollbar/mousedown issue; fixed by the `<ul>` `onMouseDown` guard now at
  `MedicineSuggest.tsx:199-201`. Supported by current code.
- `context/archive/2026-10-02-registry-search-suggestions/reviews/impl-review.md:67,73` —
  live-region redesign (visible text not live, separate sr-only region, 700 ms delay).
  Supported by current code (`MedicineSuggest.tsx:144-158,235-237`, `RegistrySearch.tsx:47-49`).
- No prior change records a design-system, palette or theme decision (search of
  `context/archive/**/*.md` for focus/contrast/colour/cosmic/purple returned only the two
  entries above).
- `context/foundation/lessons.md` has one entry (PR after push), not UI-related.

## Related Research

- `context/archive/2026-10-02-registry-search-suggestions/` — S-01, built the combobox.
- Registry search performance (S-09, archived per project memory) — perf of `/szukaj`; a
  restyle should not add work to the list rendering path.

## Open Questions

Product choices for `/10x-plan` (the user decides; not technical gaps):

1. **Mode and palette**: keep the current dark "cosmic" look expressed as tokens (dark by
   default), pick a shadcn preset, or describe a mood (e.g. calm, clinical, high contrast)
   to turn into values. Light, dark, or both?
2. **C4 scope**: include the post-sign-in redirect to `/szukaj` (`signin.ts:19`) and the
   Polish Topbar in this change, or defer the redirect to its own change?
3. **Components**: install shadcn `input`, `label`, `card` (adds generated files, no new
   runtime dependency beyond what `button` already pulls — to be confirmed at install time).

Verification gaps:

- Focus visibility of Topbar controls (`global.css:119` on dark background) and all contrast
  ratios are inferred from values, not measured in a browser — the plan's screenshot step
  should confirm.
