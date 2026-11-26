import { defineMiddleware } from "astro:middleware";
import { sessionCheckFailure } from "@/lib/auth-errors";
import { authTimeFromClaims, decodeTokenClaims, sessionExpired } from "@/lib/session-age";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/szukaj", "/apteczka", "/konto"];

// What a user whose password breaks the rule (marker `password_change_required` in `user_metadata`, set at sign-in)
// may still reach: the change screen, its endpoint, the sign-out and the reset of a forgotten password (two pages and
// their endpoints). Nothing else under `/api/auth/` (a marked user signs out first to sign in again).
const PASSWORD_CHANGE_PATHS = [
  "/konto/haslo",
  "/api/auth/password",
  "/api/auth/signout",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
];
const PASSWORD_CHANGE_URL = "/konto/haslo?wymagana=1";

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);
  let outage = false;
  let expired = false;

  if (supabase) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
    const failure = sessionCheckFailure(error);
    if (failure !== "none") {
      // A missing session is the normal anonymous request; anything else is logged with its cause.
      // eslint-disable-next-line no-console -- a failed session check must reach the log, not look like a signed-out user
      console.error(`Session check failed (${failure})`, error);
    }
    outage = failure === "outage";

    // The 90-day limit counts from the password sign-in (`amr`), which a token refresh does not move. The token was
    // just verified by `getUser()`, so its payload is read here without another call to the auth server. This also
    // reaches sessions opened before the limit existed.
    if (context.locals.user) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authTime = authTimeFromClaims(decodeTokenClaims(session?.access_token));
      if (sessionExpired(authTime, Math.floor(Date.now() / 1000))) {
        if (authTime === null) {
          // A token without a sign-in time is an anomaly, not an old session: it must reach the log.
          // eslint-disable-next-line no-console -- a session that cannot be dated is signed out, and the reason must be visible
          console.error("Session has no sign-in time in the access token (amr), signing it out", {
            userId: context.locals.user.id,
          });
        }
        const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
        if (signOutError) {
          // eslint-disable-next-line no-console -- the cookie is cleared locally either way; the failure must not vanish
          console.error("Sign-out of an expired session failed", signOutError);
        }
        context.locals.user = null;
        expired = true;
      }
    }
  } else {
    context.locals.user = null;
  }

  // During an outage the user may well be signed in: the sign-in page says the session could not be checked.
  let signIn = "/auth/signin";
  if (outage) {
    signIn = "/auth/signin?error=session_check_failed";
  } else if (expired) {
    signIn = "/auth/signin?error=session_expired";
  }
  const { pathname } = context.url;
  // `/` has no page of its own: the search is the entry point, sign-in for anonymous users
  // (and always when Supabase is not configured, where the sign-in page shows the config banner).
  if (pathname === "/") {
    return context.redirect(context.locals.user ? "/szukaj" : signIn);
  }
  // A signed-in user has no use for the sign-in and sign-up forms. When the session check failed, `locals.user` is
  // null, so the form (with the session_check_failed message) still shows.
  // Astro ignores a trailing slash, so `/auth/signin/` renders the same form.
  const formPath = pathname.replace(/\/$/, "");
  if ((formPath === "/auth/signin" || formPath === "/auth/signup") && context.locals.user) {
    return context.redirect("/szukaj");
  }
  if (PROTECTED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    if (!context.locals.user) {
      return context.redirect(signIn);
    }
  }

  // The marker is read from the user the auth server just returned, not from a cookie the browser could edit.
  if (
    context.locals.user?.user_metadata.password_change_required === true &&
    !PASSWORD_CHANGE_PATHS.includes(formPath)
  ) {
    if (formPath.startsWith("/api/")) {
      return Response.json({ error: "Password change required" }, { status: 403 });
    }
    // `/auth/signin` and `/auth/signup` were already sent to `/szukaj` above, which ends up here.
    return context.redirect(PASSWORD_CHANGE_URL);
  }

  return next();
});
