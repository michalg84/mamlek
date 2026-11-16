# Audit code cleanup (F5, F11) Implementation Plan

## Overview

Two findings of the PRD conformance audit (`context/audits/prd-conformance/2026-11-16.md`) are fixed in code:

- F11: errors are hidden or shown raw, so they cannot be diagnosed and confuse the user.
- F5: the form of a medicine can disappear from a suggestion behind an ellipsis.

The fixes follow the hard rule "never hide the evidence": every failure gets logged with its cause, and the user sees a clear Polish message, never a raw server or developer text.

## Current State Analysis

- `src/middleware.ts:10-13` ignores the `error` returned by `supabase.auth.getUser()`.
  - A Supabase outage looks exactly like "no session", and protected routes redirect to sign-in without a trace.
- `src/pages/api/auth/signin.ts:16` and `signup.ts:16` redirect with `?error=<encodeURIComponent(error.message)>`, which is raw English text from Supabase.
  - `signin.astro:5` and `signup.astro:5` show any text from `?error=`. It is escaped, but anyone can write their own message into a link.
  - The "not configured" case is also passed as free text.
- `src/pages/api/auth/signout.ts:7` ignores the result of `signOut()`.
- `src/components/kit/KitAddForm.tsx`:
  - `:61` calls `parseQuantityInput(quantity, max)` without `badInput`. Typing "-" or "1e" saves the item with an unknown quantity and no message. `KitList.tsx:60-72` and `KitItemEdit.tsx:82,111,253` already handle this.
  - `:109-110` shows the English `payload.error` of `POST /api/kit` (e.g. "Package not found or withdrawn from the registry") to the user.
  - `:112` has a `catch` without logging.
- `src/components/registry/MedicineSuggest.tsx:204,220` joins strength and form into one `truncate` line. With a long strength (up to 80 characters) the form is cut off on a 390 px screen, so two variants that differ only in form look the same.
  - The same component serves `/szukaj`, the kit add form and the import rows.

## Desired End State

- Sign-in and sign-up errors reach the page only as a known code (`?error=<code>`).
  - The page shows the Polish message for that code from one table. An unknown or hand-written value shows the generic message, never the raw text.
  - The server logs the original Supabase error with its cause.
- A real `getUser()` failure, meaning anything other than "no session", is logged with its cause.
  - A request to a protected page or `/` then redirects to `/auth/signin?error=session_check_failed`. The sign-in page explains in Polish that the session could not be checked and asks the user to sign in again in a moment.
  - A plain missing session behaves as today: no log, redirect without a code.
- A failed `signOut()` is logged; the user is still redirected to `/`.
- The kit add form:
  - rejects unreadable quantity text with the same message as the list and the edit panel;
  - shows Polish messages chosen by response status;
  - logs the cause of a network failure or a non-201 answer.
- Every suggestion shows the form on its own line (wrapping, not cut), so variants that differ only in form are distinguishable at 390 px.

### Key Discoveries:

- supabase-js (`@supabase/auth-js` errors): `isAuthSessionMissingError(error)` identifies the normal "no session" case of `getUser()`.
  - `AuthError.code` carries a known code such as `invalid_credentials`, `email_not_confirmed`, `user_already_exists`, `email_exists`, `weak_password`, `over_request_rate_limit`, `over_email_send_rate_limit`, `signup_disabled`, `email_address_invalid`, `validation_failed`.
  - `code` is `undefined` when no HTTP response arrived (network failure).
- `scripts/smoke.mjs:164` expects only the prefix `/auth/signin?error=` for a wrong password, so codes keep the smoke test green.
- `src/components/auth/ServerError.tsx` renders the message. Its styling stays as it is: S-15 `auth-screens-ui` restyles the auth screens.
- `KitImport.tsx:334-351` is the pattern for logging in a component: `console.error(cause)` with an `eslint-disable-next-line no-console -- <why>` comment.
- Option texts are pinned in tests:
  - `KitAddForm.test.tsx:14-15` and similar constants in `RegistrySearch.test.tsx`, `KitImport.test.tsx` and `KitList.test.tsx`;
  - they look like `"Ibuprom400 mg · tabletki powlekane"`.
  - F5 changes the required layout, so these constants change with it. This is a changed requirement, not an assertion edited to pass.

## What We're NOT Doing

- No restyling of the auth screens and no translation of their static English texts ("Sign in", labels): that is S-15 `auth-screens-ui`. Only the error messages become Polish here.
- No 503 page. A failed session check goes to sign-in with a clear message, as the author decided.
- No change to the audit point about the "kolejne opakowanie" / "już masz" messages (`apteczka.astro:42`, `kit.ts:259-268`). The audit did not verify it, and it is not part of the agreed fix.
- No change to the JSON error bodies of `POST /api/kit`. The API stays English and machine-facing; only the form chooses its own Polish text.
- No validation rework of the auth routes' `formData` casts (pre-existing, noted in AGENTS.md).

## Implementation Approach

- A small pure module `src/lib/auth-errors.ts` owns the code list and the Polish messages. Routes, middleware and pages all use it, and it is unit-tested without a server.
- The kit form change follows the existing `KitList` / `KitItemEdit` pattern.
- F5 is a markup change in `MedicineSuggest` plus the pinned test texts, confirmed with `ui:shots`.

## Phase 1: Auth errors as known codes

### Overview

Replace free-text `?error=` with known codes and Polish messages, and log every hidden auth failure.

### Changes Required:

#### 1. Auth error table

**File**: `src/lib/auth-errors.ts` (new), `src/lib/auth-errors.test.ts` (new)

**Intent**: One place that turns a Supabase auth error into a code that is safe to put in a URL, and a code into the Polish message shown on the page.

**Contract**:

- `authErrorCode(error: { code?: string } | null | undefined): AuthErrorCode`
  - Returns the Supabase `code` when it is in the known list.
  - Otherwise returns `"unknown"`.
- `authErrorMessage(code: string | null): string | null`
  - `null` for no code.
  - The Polish message for a known code.
  - The generic message for anything else, including hand-written text.
- Known codes:
  - the Supabase codes listed in Key Discoveries;
  - `not_configured`;
  - `session_check_failed` ("Nie udało się sprawdzić sesji — serwis jest chwilowo niedostępny. Zaloguj się ponownie za chwilę.");
  - `unknown` (generic: "Coś poszło nie tak. Spróbuj ponownie za chwilę.").
- Codes with the same meaning may share a message: `user_already_exists` and `email_exists` both mean "an account with this e-mail exists".

#### 2. Sign-in and sign-up routes

**File**: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`

**Intent**: Redirect with `?error=<code>` instead of the raw message, and log the original error so the cause is not lost.

**Contract**:

- `?error=not_configured` when the client is `null`.
- On a Supabase error: `console.error` with the error, then `?error=${authErrorCode(error)}`.
- Success redirects are unchanged.

#### 3. Sign-in and sign-up pages

**File**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`

**Intent**: Show only a message from the table, never the raw parameter.

**Contract**: `serverError={authErrorMessage(Astro.url.searchParams.get("error"))}`.

#### 4. Middleware session check

**File**: `src/middleware.ts`

**Intent**: Tell a missing session from a failed check.

**Contract**:

- When `getUser()` returns an error that is not `isAuthSessionMissingError`:
  - `console.error` the error with its cause;
  - mark the request as "check failed".
- Where the middleware redirects an anonymous user to `/auth/signin` (protected routes and `/`), it uses `/auth/signin?error=session_check_failed` when the check failed.
- `locals.user` stays `null` in that case, and API routes keep answering 401 as today.

#### 5. Sign-out

**File**: `src/pages/api/auth/signout.ts`

**Intent**: Do not drop a failed sign-out silently.

**Contract**:

- When `signOut()` returns an error: `console.error` with the cause.
- The redirect to `/` is unchanged; supabase-js removes the local session anyway.

### Success Criteria:

#### Automated Verification:

- New unit tests of `auth-errors.ts` (known code → its message, unknown code → generic, hand-written text → generic, `undefined` code → `unknown`, `null` → no message) pass, and fail when the generic fallback is broken on purpose
- Unit + component + registry tests pass (`npx vitest run --project unit --project component --project registry`)
- Lint passes (`npm run lint`)
- Types pass (`npx astro check`)
- `npm run smoke` passes against a local server (wrong password still redirects to `/auth/signin?error=…`)

#### Manual Verification:

- On the local server, a wrong password shows "Nieprawidłowy e-mail lub hasło" on the sign-in page, and the server log shows the Supabase error
- `/auth/signin?error=<script>dowolny tekst` shows the generic message, not the text
- With Supabase stopped (`npx supabase stop`) and a session cookie still in the browser, opening `/szukaj` lands on sign-in with the "nie udało się sprawdzić sesji" message, and the server log shows the cause

**Implementation Note**: After automated verification passes, pause for manual confirmation before the next phase.

---

## Phase 2: Kit add form errors

### Overview

The add form handles unreadable quantity text, shows Polish messages by status and logs the cause of failures.

### Changes Required:

#### 1. Add form

**File**: `src/components/kit/KitAddForm.tsx`

**Intent**: Bring the form in line with the list and the edit panel.

**Contract**:

- **Quantity:**
  - Keep `validity.badInput` of the quantity field in state.
  - Reset it on pack change.
  - Pass it to `parseQuantityInput(quantity, max, badInput)`.
- **Polish messages by status:**
  - 400: "Nie udało się dodać leku — sprawdź dane albo wybierz lek ponownie";
  - 401: unchanged;
  - 503 and others: "Nie udało się dodać leku do apteczki, spróbuj ponownie".
  - `payload.error` is never shown.
- **Logging:** `console.error` with the status and body for a non-201 answer other than 401, and with the cause in the network `catch`, following `KitImport.tsx:334-351`.

#### 2. Component tests

**File**: `src/components/kit/KitAddForm.test.tsx`

**Intent**: Pin the new behaviour.

**Contract**:

- Unreadable quantity (field with `badInput`) shows the quantity error and sends no request.
- A 400 answer with an English `error` shows the Polish message and not the English text.

### Success Criteria:

#### Automated Verification:

- New `KitAddForm` tests fail before the change and pass after it
- Unit + component + registry tests pass
- Lint passes
- Types pass (`npx astro check`)
- `npm run ui:scan` passes

#### Manual Verification:

- On `/apteczka`, typing "-" or "1e" in the quantity shows the quantity error and adds nothing

**Implementation Note**: After automated verification passes, pause for manual confirmation before the next phase.

---

## Phase 3: Form of the medicine on its own line in suggestions

### Overview

Strength and form are no longer cut together, so the form is always visible.

### Changes Required:

#### 1. Suggestion option

**File**: `src/components/registry/MedicineSuggest.tsx`

**Intent**: Show the strength and the form each on its own line, wrapping (`break-words`) instead of `truncate`, so a long strength cannot hide the form.

**Contract**:

- Each `role="option"` item shows the name (as today), then the strength when present, then the form when present.
- The item's accessible text keeps name, strength and form in that order.

#### 2. Pinned option texts

**File**: `src/components/kit/KitAddForm.test.tsx`, `src/components/registry/RegistrySearch.test.tsx`, `src/components/kit/KitImport.test.tsx`, `src/components/kit/KitList.test.tsx` (wherever an option text is pinned)

**Intent**: Update the constants to the new required layout (F5 changed the requirement); the "Wybrano: …" texts in `KitAddForm` do not change.

**Contract**: option text constants match the new markup; no assertion is loosened.

### Success Criteria:

#### Automated Verification:

- Unit + component + registry tests pass
- Lint passes
- Types pass (`npx astro check`)
- `npm run ui:scan` passes

#### Manual Verification:

- `npm run ui:shots -- --label audit-code-cleanup`: in the `suggestions` state at 390 and 1280 px each option shows the form on its own line
- On `/szukaj` at phone width, a medicine with a long strength shows its form in the suggestion

**Implementation Note**: After automated verification passes, pause for manual confirmation.

---

## Testing Strategy

### Unit Tests:

- `auth-errors.ts`: code mapping and the generic fallback for unknown and hand-written values.

### Component Tests:

- `KitAddForm`: `badInput` quantity, Polish 400 message without the English text.

### Manual Testing Steps:

1. Wrong password → Polish message; hand-written `?error=` → generic message.
2. Supabase stopped with a stale session → sign-in with the session-check message; cause in the server log.
3. Quantity "-" in the add form → quantity error.
4. Suggestions at 390 px → form on its own line.

## References

- Audit: `context/audits/prd-conformance/2026-11-16.md` F5, F11
- Pattern for `badInput`: `src/components/kit/KitList.tsx:60-72`, `src/components/kit/KitItemEdit.tsx:82,111,253`
- Pattern for logging in a component: `src/components/kit/KitImport.tsx:334-351`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Auth errors as known codes

#### Automated

- [x] 1.1 New unit tests of `auth-errors.ts` pass, and fail when the generic fallback is broken on purpose — f66605f
- [x] 1.2 Unit + component + registry tests pass — f66605f
- [x] 1.3 Lint passes — f66605f
- [x] 1.4 Types pass (`npx astro check`) — f66605f
- [x] 1.5 `npm run smoke` passes against a local server — f66605f

#### Manual

- [x] 1.6 Wrong password shows the Polish message and the server log shows the Supabase error — f66605f
- [x] 1.7 Hand-written `?error=` text shows the generic message — f66605f
- [x] 1.8 Supabase stopped with a stale session lands on sign-in with the session-check message and a logged cause — f66605f

### Phase 2: Kit add form errors

#### Automated

- [x] 2.1 New `KitAddForm` tests fail before the change and pass after it — 8188ee4
- [x] 2.2 Unit + component + registry tests pass — 8188ee4
- [x] 2.3 Lint passes — 8188ee4
- [x] 2.4 Types pass (`npx astro check`) — 8188ee4
- [x] 2.5 `npm run ui:scan` passes — 8188ee4

#### Manual

- [x] 2.6 Typing "-" or "1e" in the quantity shows the quantity error and adds nothing — 8188ee4

### Phase 3: Form of the medicine on its own line in suggestions

#### Automated

- [x] 3.1 Unit + component + registry tests pass — 18e0898
- [x] 3.2 Lint passes — 18e0898
- [x] 3.3 Types pass (`npx astro check`) — 18e0898
- [x] 3.4 `npm run ui:scan` passes — 18e0898

#### Manual

- [x] 3.5 `ui:shots` suggestions state shows the form on its own line at 390 and 1280 px — 18e0898
- [x] 3.6 On `/szukaj` at phone width a long-strength medicine shows its form — 18e0898
