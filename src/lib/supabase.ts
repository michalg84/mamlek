import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import { sessionCookieMaxAge } from "@/lib/session-age";

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "");
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          // @supabase/ssr forces its 400-day `maxAge` on every cookie it sets (the `cookieOptions.maxAge` option is
          // ignored), so the shorter lifetime is applied here. A token refresh re-issues the cookie, which makes it an
          // inactivity limit. A deletion (`maxAge: 0`) stays as it is.
          cookies.set(name, value, { ...options, maxAge: sessionCookieMaxAge(options.maxAge) });
        });
      },
    },
  });
}

/**
 * A client that keeps nothing, for asking Supabase to send the password reset mail. `supabase-js` defaults to the
 * implicit flow, so the request carries no PKCE challenge and sets no cookie: the link in the mail works in any browser.
 */
export function createStatelessClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createSupabaseClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const RECOVERY_COOKIE = "mamlek-recovery";
const RECOVERY_COOKIE_SECONDS = 15 * 60;
/** The names `@supabase/ssr` stores the session under: the plain one and its chunks (`.0`, `.1`, ...). */
const RECOVERY_COOKIE_NAME = new RegExp(`^${RECOVERY_COOKIE}(\\.\\d+)?$`);

/**
 * The client of the password recovery session. The session lives in its own short-lived cookie that the middleware does
 * not read, so a reset link alone signs nobody into the app. `expireRecoveryCookies` removes the cookie, including what
 * this same request has written.
 */
export function createRecoveryClient(request: Request, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  const attributes = {
    path: "/", // read under both `/auth` and `/api/auth`
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax" as const,
  };
  const requestCookies = () => parseCookieHeader(request.headers.get("Cookie") ?? "");
  const written = new Set<string>();

  const client = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookieOptions: { name: RECOVERY_COOKIE },
    cookies: {
      getAll: requestCookies,
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          written.add(name);
          // `@supabase/ssr` asks for 400 days; `maxAge: 0` is its removal of a cookie and stays.
          const maxAge = options.maxAge === 0 ? 0 : RECOVERY_COOKIE_SECONDS;
          cookies.set(name, value, { ...options, ...attributes, maxAge });
        });
      },
    },
  });

  function expireRecoveryCookies() {
    const received = requestCookies()
      .map(({ name }) => name)
      .filter((name) => RECOVERY_COOKIE_NAME.test(name));
    for (const name of new Set([...received, ...written])) {
      // Not `cookies.delete`, which sends no `Max-Age`; this also replaces a value set earlier in this response.
      cookies.set(name, "", { ...attributes, maxAge: 0 });
    }
  }

  return { client, expireRecoveryCookies };
}
