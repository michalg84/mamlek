import { defineMiddleware } from "astro:middleware";
import { sessionCheckFailure } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/szukaj", "/apteczka"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);
  let outage = false;

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
  } else {
    context.locals.user = null;
  }

  // During an outage the user may well be signed in: the sign-in page says the session could not be checked.
  const signIn = outage ? "/auth/signin?error=session_check_failed" : "/auth/signin";
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

  return next();
});
