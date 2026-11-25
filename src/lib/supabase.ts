import { createServerClient, parseCookieHeader } from "@supabase/ssr";
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
