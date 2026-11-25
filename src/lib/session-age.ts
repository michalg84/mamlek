/** A session with no request for this long is gone: the cookie lives this long and each token refresh re-issues it. */
export const SESSION_IDLE_DAYS = 30;
/** A session older than this (counted from the password sign-in, not from the last refresh) is signed out. */
export const SESSION_MAX_DAYS = 90;

const SECONDS_PER_DAY = 86400;

/** The `maxAge` (seconds) of the session cookie. */
export const SESSION_COOKIE_MAX_AGE = SESSION_IDLE_DAYS * SECONDS_PER_DAY;

/** The `maxAge` to write for a cookie @supabase/ssr sets: capped at the idle limit; 0 (a deletion) and below stay. */
export function sessionCookieMaxAge(maxAge: number | undefined): number | undefined {
  return maxAge !== undefined && maxAge > SESSION_COOKIE_MAX_AGE ? SESSION_COOKIE_MAX_AGE : maxAge;
}

/**
 * The payload of a JWT, decoded and NOT verified. Only for a token `getUser()` has just checked with the auth server;
 * never for one that came straight from the browser. `null` when the token is not a JWT with a JSON object payload.
 */
export function decodeTokenClaims(token: string | undefined): Record<string, unknown> | null {
  const payload = token?.split(".")[1];
  if (!payload) {
    return null;
  }
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof claims === "object" && claims !== null && !Array.isArray(claims)
      ? (claims as Record<string, unknown>)
      : null;
  } catch (error) {
    // A payload that cannot be decoded is not the same as a token without `amr`: keep the cause for the log.
    // eslint-disable-next-line no-console -- the cause of an undecodable access token must reach the log
    console.error("Access token payload could not be decoded", error);
    return null;
  }
}

/**
 * The time (epoch seconds) of the earliest sign-in in the `amr` claim (`[{ method, timestamp }]`, the `AMREntry[]`
 * format). The plain `string[]` format, a missing claim or entries without a numeric timestamp give `null`.
 * `iat` is no substitute: it moves at every token refresh.
 */
export function authTimeFromClaims(claims: Record<string, unknown> | null): number | null {
  const amr = claims?.amr;
  if (!Array.isArray(amr)) {
    return null;
  }
  const times = amr.flatMap((entry: unknown) => {
    const timestamp = typeof entry === "object" && entry !== null ? (entry as { timestamp?: unknown }).timestamp : null;
    return typeof timestamp === "number" && Number.isFinite(timestamp) ? [timestamp] : [];
  });
  return times.length > 0 ? Math.min(...times) : null;
}

/** True when the session is older than `SESSION_MAX_DAYS`. Without a sign-in time it fails closed: expired. */
export function sessionExpired(authTime: number | null, now: number): boolean {
  if (authTime === null) {
    return true;
  }
  return now - authTime > SESSION_MAX_DAYS * SECONDS_PER_DAY;
}
