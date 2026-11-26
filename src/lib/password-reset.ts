/**
 * The two decisions of the password reset that are easy to get wrong, free of any I/O so unit tests cover them: what the
 * request for a reset link may reveal, and what the page behind the link shows.
 */
import type { AuthErrorCode } from "@/lib/auth-errors";

/**
 * The error code the request for a reset link answers with, `null` for the neutral answer ("if the account exists, the
 * mail is on its way"). Only two failures say nothing about the address, so only they are shown: the auth server could
 * not be reached, or this client sent too many requests. Everything else, the e-mail rate limit and a failed send
 * included, can happen for an existing account only and would reveal that it exists.
 */
export function forgotPasswordErrorCode(error: { status?: number; code?: string } | null): AuthErrorCode | null {
  if (!error) {
    return null;
  }
  if (error.code === "over_request_rate_limit") {
    return "over_request_rate_limit";
  }
  // `supabase-js` gives status 0 (or none) when no answer came back.
  return error.status ? null : "unknown";
}

/** The outcome of reading the recovery session. */
export type RecoveryRead = { kind: "user"; email: string } | { kind: "none" } | { kind: "outage" };

export type ResetPageState =
  | { kind: "invalid_link" }
  | { kind: "token_form"; tokenHash: string }
  | { kind: "session_form"; email: string }
  | { kind: "unavailable" };

/** What `/auth/reset-password` shows. The order of the rules matters. */
export function resetPageState({
  error,
  tokenHash,
  session,
}: {
  error: string | null;
  tokenHash: string | null;
  session: RecoveryRead;
}): ResetPageState {
  // A link that was just refused stays refused, even next to the recovery cookie of an earlier link.
  if (error === "otp_expired") {
    return { kind: "invalid_link" };
  }
  // The token wins over the cookie: in a shared browser the cookie may belong to someone else's link.
  if (tokenHash) {
    return { kind: "token_form", tokenHash };
  }
  if (session.kind === "user") {
    return { kind: "session_form", email: session.email };
  }
  // An outage says nothing about the link, so it never reads as "expired".
  return session.kind === "outage" ? { kind: "unavailable" } : { kind: "invalid_link" };
}
