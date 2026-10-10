import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/szukaj", "/apteczka"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  const { pathname } = context.url;
  // `/` has no page of its own: the search is the entry point, sign-in for anonymous users
  // (and always when Supabase is not configured, where the sign-in page shows the config banner).
  if (pathname === "/") {
    return context.redirect(context.locals.user ? "/szukaj" : "/auth/signin");
  }
  if (PROTECTED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
