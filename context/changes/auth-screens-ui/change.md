---
change_id: auth-screens-ui
title: Auth screens in Polish on the app's light tokens
status: implemented
created: 2026-11-18
updated: 2026-11-18
archived_at: null
---

## Notes

Roadmap S-15 (`/10x-ui`). View: the sign-in / sign-up / confirm-email screens (`src/pages/auth/*`, `src/components/auth/*`), plus the tab title in `src/layouts/Layout.astro` and the config banner (`src/lib/config-status.ts`, `src/components/Banner.astro`).

Contract variant: existing design system — tokens in `:root` of `src/styles/global.css` (light clinical teal), components in `src/components/ui/` (button, card, input, label …). Extend it, no second palette.

Pre-audit (2026-11-18, hardcoded-value scan): 34 hits, 0 role-class usages across the auth files; only `SubmitButton.tsx` imports from `src/components/ui/`. Hits: auth pages 5 each (`bg-cosmic`, `white/10`, blue/purple gradient), `FormField.tsx` 5, `Banner.astro` 9 (hex), `SubmitButton.tsx` 2, `PasswordToggle`/`ServerError`/`SignUpForm` 1 each.

Audit brief for research (candidate charges):

- Missing tokens: dark `bg-cosmic` + white/blue/purple palette on all three pages and in the form parts; `Banner.astro` hex colours.
- Missing shared component: hand-made input in `FormField.tsx` instead of `ui/input` + `ui/label`; card built from divs instead of `ui/card`; `SubmitButton` overrides `Button` with purple classes.
- Accidental architecture: English texts (headings, labels, client validation, aria-labels, confirm-email); default title "10x Astro Starter"; banner links to the starter repo; signed-in user still sees the sign-in form on `/auth/signin`; `confirm-email` picks its text from `import.meta.env.DEV` instead of the real confirmation setting; `bg-cosmic` utility in `global.css` used only here (removing it touches `global.css` — tell the coordinator, S-08).
- Finish: add the views to `GUARDED` in `scripts/ui-scan.mjs`.
