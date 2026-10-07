# Search view reads design tokens — Implementation Plan

## Overview

`/szukaj` (the medicine-name lookup, the app's core flow) moves to a light "clinical teal" theme defined once in
`src/styles/global.css`. The page, its Topbar, the search box and the result card read semantic tokens and use repo
shadcn components instead of the purple/blue literals they carry today. Every state from the 10x-ui 7-state matrix
is captured by a repeatable Playwright screenshot script, and a no-dependency scan in CI keeps literal colours out of
the cleaned files. UI change run through `/10x-ui`; input: `research.md` charges C1–C5.

## Current State Analysis

- **Dead token file**: `global.css:6-39` holds stock shadcn neutral light values, `global.css:41-73` dark values,
  published correctly through `@theme inline` (`global.css:75-111`). The four view files use **0** token colour
  classes and **24** hardcoded-value scan hits (szukaj 4, Topbar 7, RegistrySearch 4, MedicineSuggest 9), plus the
  `bg-cosmic` hex gradient (`szukaj.astro:37`, defined at `global.css:113-115`).
- **Mode**: no element has the `dark` class (`global.css:4` variant `&:is(.dark *)`), so the token layer is light while
  the view is painted dark by literals. The chosen theme is light, so the token layer's mode already matches — no
  `class="dark"` is needed.
- **Components**: `src/components/ui/` holds `button.tsx` (token-driven cva variants, exports `Button` and
  `buttonVariants`, `button.tsx:50`) and `LibBadge.astro`. Input, label, list, result card and all Topbar controls are
  hand-rolled; the one `Button` is restyled at the call site (`MedicineSuggest.tsx:124`).
- **States**: input focus uses `focus:ring-purple-400` (`MedicineSuggest.tsx:191`); errors are `text-red-300` in the
  hint slot (`:229`); the page-level load failure (`szukaj.astro:45`) looks like the neutral "not loaded" message
  (`:49`); loading is text only (`MedicineSuggest.tsx:106`); disabled is never rendered.
- **Topbar**: English labels on a `lang="pl"` document, "Dashboard" link to the starter `/dashboard`
  (`Topbar.astro:10-28`); the same Topbar is rendered by `Welcome.astro`.
- **Hardened behaviour** (S-01 review): combobox ARIA attributes (`MedicineSuggest.tsx:168-190`), the listbox
  `onMouseDown` guard (`:199-201`), and the separate live regions (`:235-237`, `RegistrySearch.tsx:47-49`).
- **Scripts depending on the view**: `scripts/perf-search.mjs:46,53` matches the exact text
  `Wczytywanie listy leków…` and the selector `input[role="combobox"]`; `scripts/smoke.mjs:71,89` checks only status
  codes on `/szukaj`.
- **Tooling available**: Playwright is a devDependency (used by `npm run perf`, local throwaway-account sign-in at
  `perf-search.mjs:229-241`); ESLint + husky/lint-staged (`package.json` `lint-staged`, `.husky/pre-commit`); CI `ci`
  job runs `npm run lint` (`.github/workflows/ci.yml:20`).

## Desired End State

Signed-in user opens `http://localhost:4321/szukaj` and sees a light page: off-white background, white card, deep
slate text, one teal accent for links, focus ring and the active suggestion; errors in a darker red with an icon.
Topbar reads "Szukaj leku" / "Wyloguj" (logged in) or "Nie zalogowano" / "Zaloguj się" / "Załóż konto". All colours
come from `:root` in `global.css`; the four view files contain no palette classes, colour functions or `bg-cosmic`
(`npm run ui:scan` exits 0, and runs in CI and pre-commit). `npm run ui:shots` produces screenshots of every state at
1280 px and 390 px. `AGENTS.md` carries a UI rule pointing the next agent at tokens, `src/components/ui/` and the scan.

### Key Discoveries:

- `components.json` is configured (`new-york`, `cssVariables: true`, css `src/styles/global.css`, aliases
  `@/components/ui`), so `npx shadcn@latest add input card` is the stack's own path; neither component adds a package.
  shadcn `label` would add the `radix-ui` package (shadcn changelog 2026-02, unified Radix package) — declined.
- `buttonVariants` is exported (`button.tsx:50`) and can style Topbar `<a>`/`<button>` elements in `.astro` without a
  React island.
- Astro renders React components without a `client:*` directive as static HTML, so `Card` (and lucide icons) can be
  used directly in `szukaj.astro`.
- The registry list is fetched on the main thread (`useRegistrySearch.ts:53`, 401 → `unauthorized` at `:57`), so
  Playwright `page.route` can force loading/error/unauthorized states; the Web Worker only does matching.
- Other cosmic pages (`Welcome`, `signin`, `signup`, `confirm-email`, `dashboard`) paint their own `bg-cosmic`
  background; changing light `:root` values only reaches them through the base layer (`global.css:117-124`, hidden
  under `bg-cosmic`) and the Button focus ring/disabled styles in `SubmitButton.tsx:15-18`.

## What We're NOT Doing

- **Post-sign-in redirect and the home page** (C4 remainder: `api/auth/signin.ts:19`, `signout.ts:9`, starter
  `Welcome`/`/dashboard`) — deferred to S-03 (medicine-check), whose screen becomes the real landing page.
- **Other views** (C5 drift: auth pages, `FormField`, `SubmitButton`, `Banner`, `Welcome`, `dashboard`) — the auth
  pages get their own follow-up 10x-ui change; Welcome and dashboard are replaced in S-03. Until then the dark cosmic
  sign-in page leads into a light `/szukaj`, and the light Topbar sits on the dark Welcome page (accepted).
- **Dark mode** — `.dark` values stay as shipped; no toggle, no `class="dark"`.
- **Removing `bg-cosmic`** from `global.css` — five other pages still use it.
- **shadcn `label`** (new `radix-ui` dependency) — a native `<label>` styled with tokens.
- **Disabled state for the search box** — the input stays usable while the list loads (S-09's "typing during loading"
  behaviour, measured by `npm run perf`); recorded as N/A.
- **Behaviour changes in `MedicineSuggest`** — no changes to state logic, keyboard handling, ARIA or live regions.
- **ESLint plugin for Tailwind** — the guard is a no-dependency script.
- **`toHaveScreenshot` baselines** — the repo has no Playwright test runner; screenshots are review evidence, not a
  pixel-diff gate.

## Implementation Approach

Follow the 10x-ui order: environment/library → token values → one view → states → guard. Tools first, so every
visual phase ends with the same two checks: `npm run ui:shots` at desktop + phone width and `npm run ui:scan` on the
view files (count must only go down: 25 → 25 → 0 → 0). Token values change before the view reads them, so Phase 2 has
no visible effect on `/szukaj` (it is still painted by literals) and Phase 3 is a pure class swap onto already-tuned
values. The palette is "A — Clinical teal", chosen from a three-palette preview; Phase 2 has a manual gate where the
user adjusts it on the real screen.

## Critical Implementation Details

- **Perf script contract**: keep the loading text exactly `Wczytywanie listy leków…` (an icon may sit next to it, but
  must add no text) and keep `role="combobox"` on the `<input>`; `scripts/perf-search.mjs:46,53` depends on both.
- **Input sizing**: shadcn `Input` defaults to `h-9` and `md:text-sm`; the search box must stay a ≥ 44 px touch target
  and 16 px text on phones (avoids iOS zoom), so `min-h-11` and `text-base md:text-base` are layout overrides at the
  call site, not colours.
- **lucide names**: `lucide-react` is `^1.14`; use canonical icon names (`CircleAlert`, `LoaderCircle`), not the old
  `AlertCircle`/`Loader2` aliases.

## Phase 1: Environment, components and tools

### Overview

Add the two shadcn components, the screenshot script and the scan script, then capture the "before" evidence. No
visible change to any page.

### Changes Required:

#### 1. shadcn components

**File**: `src/components/ui/input.tsx`, `src/components/ui/card.tsx` (new, generated)

**Intent**: Give the search box and the result/panel cards shared, token-driven styling including focus-visible,
`aria-invalid` and disabled states (C3).

**Contract**: Generated by `npx shadcn@latest add input card`; no new packages in `package.json`, no edits to
`global.css` or `button.tsx` by the CLI (decline any overwrite prompt). Remove a `"use client"` directive if the CLI
emits one (AGENTS.md: no Next.js directives).

#### 2. State screenshot script

**File**: `scripts/ui-shots.mjs` (new); `package.json` script `ui:shots`; `.gitignore` entry `.ui-shots/`

**Intent**: Repeatably drive the real `/szukaj` into each state and save screenshots at 1280 px and 390 px, as the
visual gate and review evidence for this and later UI changes.

**Contract**:

- Usage `npm run ui:shots -- --label <name>`; output `.ui-shots/<label>/<state>-<width>.png`; `BASE_URL` env
  (default `http://localhost:4321`); local hosts only, signing up a throwaway account like `perf-search.mjs`
  (needs email confirmation off). Exit 2 = usage error, 1 = a state could not be reached. Header comment in the
  style of `perf-search.mjs`. If the sign-up/sign-in code would be a verbatim copy of `perf-search.mjs`, extract it to
  `scripts/lib/` and re-run `npm run perf -- --runs 1` to confirm perf still works.
- Each state in a fresh browser context (empty HTTP cache), at both widths:
  `default` (list ready, empty field), `focus-input` (field focused by keyboard Tab, not click), `focus-topbar` (first
  Topbar link focused by Tab), `hint-short` (typed `ib`), `suggestions` (typed `ibu`, ArrowDown → active option),
  `hover-option` (mouse over the second option), `no-match` (typed `xqzw`), `result` (Enter on the active option →
  result card), `loading` (`page.route` holds `/api/registry/search-list*`), `error` (route aborts), `unauthorized`
  (route fulfils 401).
- Page-level server states (`szukaj.astro:45,49`) cannot be forced from the browser; they are a manual check.

#### 3. Hardcoded-value scan script

**File**: `scripts/ui-scan.mjs` (new); `package.json` script `ui:scan`

**Intent**: The 10x-ui hardcoded-value scan as a dependency-free check on the views this change cleans, later wired
into CI and pre-commit (C5).

**Contract**:

- Guarded list inside the script: `src/pages/szukaj.astro`, `src/components/Topbar.astro`,
  `src/components/registry/RegistrySearch.tsx`, `src/components/registry/MedicineSuggest.tsx` (a comment says to add
  a view when its own change cleans it).
- Pattern: the 10x-ui grep pattern (hex, `rgb/rgba/hsl/hsla/oklch(`, `-[Npx|rem]`, palette classes for
  `bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide` × named palettes incl. `white`/`black`) plus
  `\bbg-cosmic\b`. Never scans `src/components/ui/` or `global.css`.
- No arguments → scan the guarded list. Arguments (as lint-staged passes them, absolute paths) → scan only those that
  are in the guarded list. Prints `file:line: <line>` per hit and a total; exit 1 on any hit, 0 otherwise.

### Success Criteria:

#### Automated Verification:

- `npx shadcn@latest add input card` leaves `package.json` dependencies unchanged (`git diff package.json` shows only the two new scripts)
- `npm run ui:scan` reports 25 hits (24 from the 10x-ui pattern + 1 `bg-cosmic`) and exits 1
- `npm run lint` and `npx astro check` pass
- `npm run build` passes

#### Manual Verification:

- `npm run ui:shots -- --label before` against a local dev server with the registry imported produces all 11 states at both widths, and each screenshot shows the named state
- The user has looked at the "before" screenshots (baseline for the comparison in Phases 3–4)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Token values — clinical teal

### Overview

Replace the light `:root` values with the chosen palette and record the raw values in the change folder (C1, value
half). No visible change on `/szukaj` yet; other pages change only in Button focus ring/disabled colour.

### Changes Required:

#### 1. Light token values

**File**: `src/styles/global.css` (`:root`, lines 6–39)

**Intent**: Put the "A — Clinical teal" palette into the token source so every role class (`bg-background`,
`text-muted-foreground`, `ring-ring`…) resolves to it.

**Contract**: Only these `:root` variables change (chart, sidebar and `--radius` stay; `.dark`, `@theme inline`,
`bg-cosmic` and the base layer stay as they are). A one-line comment above `:root` names the source
(`context/changes/search-view-tokens/palette.md`).

```css
--background: oklch(0.985 0.004 197);
--foreground: oklch(0.21 0.02 230);
--card: oklch(1 0 0);
--card-foreground: oklch(0.21 0.02 230);
--popover: oklch(1 0 0);
--popover-foreground: oklch(0.21 0.02 230);
--primary: oklch(0.52 0.1 192);
--primary-foreground: oklch(0.99 0 0);
--secondary: oklch(0.96 0.008 210);
--secondary-foreground: oklch(0.21 0.02 230);
--muted: oklch(0.96 0.008 210);
--muted-foreground: oklch(0.48 0.02 230);
--accent: oklch(0.94 0.035 192);
--accent-foreground: oklch(0.3 0.06 200);
--destructive: oklch(0.53 0.2 27);
--border: oklch(0.9 0.01 210);
--input: oklch(0.68 0.02 220);
--ring: oklch(0.52 0.1 192);
```

#### 2. Palette record

**File**: `context/changes/search-view-tokens/palette.md` (new)

**Intent**: Deposit the raw values and where they came from, so the next session does not invent them again.

**Contract**: The table of variables above with role and contrast target per pair (text on background/card ≥ 4.5:1;
`--input` border and focus indicator ≥ 3:1 against `--card`), origin "palette A of three light clinical candidates
(teal / hospital blue / pharmacy green), chosen by the user 2026-10-07", and a section for adjustments made at the
Phase 2 gate.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes (prettier formats `global.css` and `palette.md`)
- `npm run build` passes
- `npm run ui:scan` still reports 25 hits (no view file touched)

#### Manual Verification:

- Sign-in page at `http://localhost:4321/auth/signin` looks unchanged apart from the button focus ring colour (Tab to the submit button)
- The user confirmed `palette.md` records palette A as chosen during planning (fine-tuning on the real screen happens at the Phase 3 gate)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: The view reads tokens and components

### Overview

Swap every literal in the four view files for role tokens and repo components; Topbar in Polish with a link to
`/szukaj` (C1 consumption, C3, C4 Topbar part). Behaviour stays identical.

### Changes Required:

#### 1. Page shell

**File**: `src/pages/szukaj.astro`

**Intent**: Light page on the token background with the panel as a shadcn `Card` and a plain heading instead of the
blue→purple gradient.

**Contract**: Wrapper drops `bg-cosmic` (body already has `bg-background`); `<main>` landmark stays and wraps a
`Card`/`CardContent` (static, no `client:*`); `<h1>` stays an `h1` with `text-foreground`; the two messages at lines
45/49 use `text-muted-foreground` for now (Phase 4 restyles the failure). Preload `<link>` and `RegistrySearch
client:load` unchanged.

#### 2. Topbar

**File**: `src/components/Topbar.astro`

**Intent**: Token-driven, Polish, and pointing at the product instead of the starter dashboard.

**Contract**: Container `bg-card border rounded-xl text-sm`; email in `text-muted-foreground`, truncated
(`min-w-0 truncate`) so long addresses fit at 390 px. Links and the sign-out `<button>` styled with
`buttonVariants({ variant: "link" })` (merged via `cn()` for size overrides only). Labels: logged in — email,
"Szukaj leku" → `/szukaj` (with `aria-current="page"` when `Astro.url.pathname` is `/szukaj`), "Wyloguj" (form POST to
`/api/auth/signout` unchanged); logged out — "Nie zalogowano", "Zaloguj się" → `/auth/signin`, "Załóż konto" →
`/auth/signup`. No link to `/dashboard`.

#### 3. Result card

**File**: `src/components/registry/RegistrySearch.tsx`

**Intent**: `VariantCard` built from the shared `Card` instead of a hand-rolled box.

**Contract**: `Card` with `role="region"` and `aria-label="Wybrany lek"` (same landmark as today's `<section>`),
`<h2>` kept; `Field` labels `text-muted-foreground`, values `text-foreground`. Live region (`:47-49`) unchanged.

#### 4. Search box

**File**: `src/components/registry/MedicineSuggest.tsx`

**Intent**: Shared `Input` and token classes in place of every literal, without touching behaviour.

**Contract**:

- `<input>` → `Input` with exactly the same props (`id`, `type`, `role="combobox"`, all `aria-*`, autocomplete/
  autocorrect/autocapitalize/spellcheck, handlers); call-site classes only for sizing (`min-h-11 w-full min-w-0
text-base md:text-base`). No `focus:` classes at the call site — focus comes from `Input`'s `focus-visible` styles.
- Native `<label htmlFor>` kept, `text-sm font-medium text-muted-foreground`.
- Listbox: `bg-popover text-popover-foreground border divide-y divide-border shadow-md`; `onMouseDown` guard,
  `max-h-[min(24rem,50vh)]` and overflow classes unchanged. Option: `hover:bg-accent hover:text-accent-foreground`,
  active `bg-accent text-accent-foreground`; details `text-muted-foreground`.
- Retry: `Button variant="outline" size="sm"` with no `className`. Sign-in link: `buttonVariants({ variant: "link" })`
  merged with `h-auto p-0` via `cn()`.
- Message `<p>`: `text-muted-foreground` for hints, `text-destructive` for `problem` (icon added in Phase 4).
- Status/message logic (`:100-160`), live region (`:235-237`) and markup order unchanged.

### Success Criteria:

#### Automated Verification:

- `npm run ui:scan` reports 0 hits and exits 0
- `npm run lint` and `npx astro check` pass
- `npm run build` passes
- `npm run smoke` passes against the local preview (Topbar and page still render for signed-in and anonymous users)

#### Manual Verification:

- `npm run ui:shots -- --label phase3`: every state shows the light teal theme at 1280 px and 390 px; no white-on-white or purple remnants; the Topbar fits at 390 px
- Keyboard flow on `http://localhost:4321/szukaj` works as before: type `ibu`, ArrowDown/ArrowUp, Enter selects and shows the card, Escape closes the list; clicking or dragging the list scrollbar does not close it
- The user confirmed the palette on the real screen, or gave adjustments that are applied in `global.css` and recorded in `palette.md`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: States — the 7-state matrix

### Overview

Make focus, error, loading and the page-level failure use their own roles and non-colour cues (C2); capture the full
matrix as the visual gate.

### Changes Required:

#### 1. Error and loading cues in the search box

**File**: `src/components/registry/MedicineSuggest.tsx`

**Intent**: An error must be distinguishable from a hint without relying on colour, and loading must look like
loading, without moving the layout when the list arrives.

**Contract**: When `problem` is true the message gets a `CircleAlert` icon (`aria-hidden`, `size-4`, `shrink-0`) and
`font-medium` next to `text-destructive`. When `status === "loading"` a `LoaderCircle` icon (`aria-hidden`,
`animate-spin motion-reduce:animate-none`) sits before the unchanged text. The message row keeps one line height in
loading → hint transition (icon sized to the text line). No change to the announced text.

#### 2. Page-level failure

**File**: `src/pages/szukaj.astro`

**Intent**: "Nie udało się wczytać rejestru leków…" must not look like the neutral "Rejestr leków nie jest jeszcze
wczytany".

**Contract**: Failure message: `text-destructive font-medium` with a static `CircleAlert` icon (aria-hidden) and
`role="alert"` omitted (server-rendered, present at load); "not loaded" message stays `text-muted-foreground`.

#### 3. Focus visibility check

**File**: `src/components/Topbar.astro`, `src/components/registry/MedicineSuggest.tsx` (only if the check fails)

**Intent**: Keyboard focus must be clearly visible on the input, Topbar links/button, options and retry button.

**Contract**: Focus comes from `Input`/`buttonVariants` `focus-visible` styles driven by `--ring`. If a control's
focus is not clearly visible in the screenshots, darken `--ring` in `global.css` (and record it in `palette.md`) —
do not add per-element colour classes.

#### 4. State matrix record

**File**: `context/changes/search-view-tokens/states.md` (new)

**Intent**: The 7-state matrix for `/szukaj`, each cell pointing at its screenshot or marked N/A with a reason.

**Contract**: Rows default, hover, focus-visible, disabled, error, empty, loading; columns: what the user sees,
screenshot file(s) from `.ui-shots/phase4/`, tokens used. disabled = N/A (input stays usable while loading, S-09).
empty covers no-match, too-short hint and the server "not loaded" message.

### Success Criteria:

#### Automated Verification:

- `npm run ui:scan` reports 0 hits
- `npm run lint`, `npx astro check` and `npm run build` pass
- `npm run perf -- --profile fast --runs 1` completes (loading text and combobox selector still found)

#### Manual Verification:

- `npm run ui:shots -- --label phase4`: all 11 states captured at both widths; focus visible on input and Topbar link; error and unauthorized show the icon and red text; loading shows the spinner; the field does not jump when loading ends
- Server states checked once by hand: with the registry not imported (`npx supabase db reset`, no import) `http://localhost:4321/szukaj` shows the muted "Rejestr leków nie jest jeszcze wczytany"; the failure message styling reviewed in code (or by temporarily breaking the list query locally); registry re-imported afterwards
- Lighthouse accessibility audit on `http://localhost:4321/szukaj` (desktop and mobile) reports no colour-contrast failures
- `states.md` has every cell shown or N/A with a reason

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Guard — make it stick

### Overview

Leave the rule and the automated check that keep the next agent on the contract (C5), and record what was deferred.

### Changes Required:

#### 1. UI rule

**File**: `AGENTS.md` (new `## UI` section after "Key conventions"; AGENTS.md carries no 10x-cli markers)

**Intent**: Tell the next agent where tokens and components live and forbid literals in views.

**Contract**: Short block: tokens are the `:root` values in `src/styles/global.css` (theme: light clinical teal,
values recorded in `context/changes/search-view-tokens/palette.md` until archived); use role classes
(`bg-background`, `bg-card`, `text-muted-foreground`, `text-destructive`, `ring-ring`…), never palette classes, colour
functions or `bg-cosmic` in views; check `src/components/ui/` before writing a control and add missing ones with
`npx shadcn@latest add <name>`; style links/buttons in `.astro` with `buttonVariants`; `npm run ui:scan` guards the
cleaned views (add a view to its list when its change cleans it); `npm run ui:shots` captures `/szukaj` states. Plus
entries for `ui:scan` and `ui:shots` under "Command tripwires", in the style of the existing ones.

#### 2. CI and pre-commit

**File**: `.github/workflows/ci.yml` (`ci` job), `package.json` (`lint-staged`)

**Intent**: A failing check instead of a rule an agent may forget.

**Contract**: `- run: npm run ui:scan` after `npm run lint` in the `ci` job. lint-staged: `*.{astro,tsx}` additionally
runs `node scripts/ui-scan.mjs` (receives staged paths; ignores files outside the guarded list).

#### 3. Charge ledger

**File**: `context/changes/search-view-tokens/research.md` (`## Charges`)

**Intent**: Charges not fully addressed stay visible with a reason (10x-ui rule), not deleted.

**Contract**: Append a status line per charge: C1, C2, C3 addressed (phases); C4 — Topbar addressed, redirect/home
page **deferred to S-03**; C5 — rule and scan addressed, other views **deferred** (auth pages → own 10x-ui change;
Welcome/dashboard → replaced in S-03). Update `last_updated` fields.

### Success Criteria:

#### Automated Verification:

- `npm run ui:scan` exits 0; temporarily adding `text-purple-300` to `Topbar.astro` makes it exit 1 (revert afterwards)
- Staging a guarded file containing a palette class makes the pre-commit hook fail (revert afterwards)
- `npm run lint`, `npx astro check` and `npm run build` pass; the CI `ci` job is green on the PR

#### Manual Verification:

- `AGENTS.md` UI section is readable and points at existing files and scripts
- `research.md` charges show addressed/deferred status for C1–C5

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human that the manual testing was successful before proceeding to `/10x-impl-review`.

---

## Testing Strategy

### Unit Tests:

- None — the repo has no unit test runner (AGENTS.md). Behaviour is unchanged; regressions are caught by `smoke`,
  `perf` (loading text/selector contract) and the manual keyboard flow.

### Integration Tests:

- `npm run smoke` against the local preview (Phase 3): `/szukaj` 302 for anonymous, 200 for signed-in.
- `npm run ui:shots`: drives the real page through 11 states at two widths (Phases 1, 3, 4).
- `npm run ui:scan`: literal-colour guard (Phases 1–5, then CI).

### Manual Testing Steps:

1. Start the dev server with the registry imported, sign in, open `http://localhost:4321/szukaj`.
2. Tab from the top: focus visible on "Szukaj leku", "Wyloguj", then the search field.
3. Type `ib` (hint), `ibu` (list), ArrowDown (active row in teal tint), Enter (result card), `xqzw` (no-match).
4. In DevTools block `/api/registry/search-list*`, reload: red error with icon and "Spróbuj ponownie"; unblock, click
   retry: list loads.
5. Repeat 2–3 at 390 px width (DevTools device mode).

## Performance Considerations

Class swaps and two static icons only; no new client JavaScript beyond lucide's two icons in the existing island and
`Input`/`Card` wrappers. The list rendering path is untouched; `npm run perf -- --profile fast --runs 1` in Phase 4
confirms the script contract still holds (S-09's slow-profile margin is ~350 ms, so a full perf run is only needed if
the island's bundle grows noticeably).

## Migration Notes

None — no data or routes change. Rollback = revert the commits; `bg-cosmic` and `.dark` remain in place for the other
pages.

## References

- Related research: `context/changes/search-view-tokens/research.md` (charges C1–C5, 7-state matrix)
- Palette preview (session scratch, not committed): three light clinical palettes; A chosen
- Combobox history: `context/archive/2026-10-02-registry-search-suggestions/reviews/impl-review.md:37,67,73`
- Perf contract: `scripts/perf-search.mjs:46,53`
- Button variants: `src/components/ui/button.tsx:7-33,50`
- Token source: `src/styles/global.css:6-124`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Environment, components and tools

#### Automated

- [x] 1.1 `npx shadcn@latest add input card` leaves `package.json` dependencies unchanged (`git diff package.json` shows only the two new scripts)
- [x] 1.2 `npm run ui:scan` reports 25 hits (24 from the 10x-ui pattern + 1 `bg-cosmic`) and exits 1
- [x] 1.3 `npm run lint` and `npx astro check` pass
- [x] 1.4 `npm run build` passes

#### Manual

- [x] 1.5 `npm run ui:shots -- --label before` against a local dev server with the registry imported produces all 11 states at both widths, and each screenshot shows the named state
- [x] 1.6 The user has looked at the "before" screenshots (baseline for the comparison in Phases 3–4)

### Phase 2: Token values — clinical teal

#### Automated

- [ ] 2.1 `npm run lint` passes (prettier formats `global.css` and `palette.md`)
- [ ] 2.2 `npm run build` passes
- [ ] 2.3 `npm run ui:scan` still reports 25 hits (no view file touched)

#### Manual

- [ ] 2.4 Sign-in page at `http://localhost:4321/auth/signin` looks unchanged apart from the button focus ring colour (Tab to the submit button)
- [ ] 2.5 The user confirmed `palette.md` records palette A as chosen during planning (fine-tuning on the real screen happens at the Phase 3 gate)

### Phase 3: The view reads tokens and components

#### Automated

- [ ] 3.1 `npm run ui:scan` reports 0 hits and exits 0
- [ ] 3.2 `npm run lint` and `npx astro check` pass
- [ ] 3.3 `npm run build` passes
- [ ] 3.4 `npm run smoke` passes against the local preview (Topbar and page still render for signed-in and anonymous users)

#### Manual

- [ ] 3.5 `npm run ui:shots -- --label phase3`: every state shows the light teal theme at 1280 px and 390 px; no white-on-white or purple remnants; the Topbar fits at 390 px
- [ ] 3.6 Keyboard flow on `http://localhost:4321/szukaj` works as before: type `ibu`, ArrowDown/ArrowUp, Enter selects and shows the card, Escape closes the list; clicking or dragging the list scrollbar does not close it
- [ ] 3.7 The user confirmed the palette on the real screen, or gave adjustments that are applied in `global.css` and recorded in `palette.md`

### Phase 4: States — the 7-state matrix

#### Automated

- [ ] 4.1 `npm run ui:scan` reports 0 hits
- [ ] 4.2 `npm run lint`, `npx astro check` and `npm run build` pass
- [ ] 4.3 `npm run perf -- --profile fast --runs 1` completes (loading text and combobox selector still found)

#### Manual

- [ ] 4.4 `npm run ui:shots -- --label phase4`: all 11 states captured at both widths; focus visible on input and Topbar link; error and unauthorized show the icon and red text; loading shows the spinner; the field does not jump when loading ends
- [ ] 4.5 Server states checked once by hand: with the registry not imported (`npx supabase db reset`, no import) `http://localhost:4321/szukaj` shows the muted "Rejestr leków nie jest jeszcze wczytany"; the failure message styling reviewed in code (or by temporarily breaking the list query locally); registry re-imported afterwards
- [ ] 4.6 Lighthouse accessibility audit on `http://localhost:4321/szukaj` (desktop and mobile) reports no colour-contrast failures
- [ ] 4.7 `states.md` has every cell shown or N/A with a reason

### Phase 5: Guard — make it stick

#### Automated

- [ ] 5.1 `npm run ui:scan` exits 0; temporarily adding `text-purple-300` to `Topbar.astro` makes it exit 1 (revert afterwards)
- [ ] 5.2 Staging a guarded file containing a palette class makes the pre-commit hook fail (revert afterwards)
- [ ] 5.3 `npm run lint`, `npx astro check` and `npm run build` pass; the CI `ci` job is green on the PR

#### Manual

- [ ] 5.4 `AGENTS.md` UI section is readable and points at existing files and scripts
- [ ] 5.5 `research.md` charges show addressed/deferred status for C1–C5
