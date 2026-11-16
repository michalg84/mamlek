# Audit code cleanup (F5, F11) — Plan Brief

> Full plan: `context/changes/audit-code-cleanup/plan.md`

## What & Why

Two audit findings (`context/audits/prd-conformance/2026-11-16.md`) are fixed in code:

- F11: auth and kit-form failures are hidden or shown as raw English text.
- F5: the form of a medicine can vanish from a suggestion behind an ellipsis.

The project's hard rule is "never hide the evidence", and FR-002 requires that suggestions show strength and form.

## Starting Point

- The middleware ignores the `getUser()` error.
- The auth routes put Supabase's raw `error.message` into `?error=`, and the pages show any text from that parameter.
- `signOut()` failures are dropped.
- The kit add form ignores `badInput` and shows the API's English `error`.
- Suggestions cut strength and form together with `truncate`.

## Desired End State

- Auth errors reach the page only as known codes with Polish messages, and the cause is logged on the server.
- A failed session check sends the user to sign-in with a clear message.
- The add form rejects unreadable quantities and speaks Polish.
- Every suggestion shows the form on its own line.

## Key Decisions Made

| Decision                  | Choice                                                                                     | Why (1 sentence)                                   | Source        |
| ------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------- | ------------- |
| `?error=` content         | Known code only; unknown → generic                                                         | No raw or hand-written text on the page            | Audit         |
| Language of auth messages | Polish now                                                                                 | S-15 then only restyles; one table of messages     | Plan (author) |
| Failed `getUser()`        | Log the cause + redirect to sign-in with `session_check_failed` and a plain Polish message | The user is told what happened, never a raw log    | Plan (author) |
| Failed `signOut()`        | Log, still redirect to `/`                                                                 | supabase-js removes the local session anyway       | Plan          |
| Kit form messages         | Polish by status; API JSON stays English                                                   | The API is machine-facing; the form owns user text | Plan          |
| F5 layout                 | Strength and form each on their own line, wrapping                                         | A long strength can no longer hide the form        | Audit         |

## Scope

**In scope:**

- New module `src/lib/auth-errors.ts` (+ tests).
- The signin and signup routes and pages.
- Middleware and signout.
- `KitAddForm` (+ tests).
- `MedicineSuggest` and the pinned option texts in the tests.

**Out of scope:**

- Auth screen restyling and static texts (S-15).
- A 503 page.
- The "kolejne opakowanie" message (audit did not verify it).
- API JSON error bodies.
- `formData` validation of the auth routes.

## Phases at a Glance

| Phase                   | What it delivers                               | Key risk                                        |
| ----------------------- | ---------------------------------------------- | ----------------------------------------------- |
| 1. Auth errors as codes | Code table, routes, pages, middleware, signout | Missing a Supabase code → shows generic message |
| 2. Kit add form errors  | `badInput`, Polish messages, logging           | None significant                                |
| 3. Form on its own line | Suggestion layout + pinned texts               | Taller suggestion list on phones                |

**Prerequisites:** local Supabase for smoke and manual checks; Playwright Chromium for `ui:shots`.
**Estimated effort:** one session across 3 small phases.

## Open Risks & Assumptions

- Until S-15, the Polish error message sits on the English sign-in screen.
- Unknown Supabase codes show the generic message; the server log keeps the original.

## Success Criteria (Summary)

- No raw or hand-written error text ever appears on the auth pages; every hidden failure has a log line.
- Typing "-" as a quantity cannot save an item silently.
- Two variants differing only in form are distinguishable in the suggestions at 390 px.
