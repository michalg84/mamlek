import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { authErrorCode, sessionCheckFailure, type AuthErrorCode } from "@/lib/auth-errors";
import { readForm } from "@/lib/read-form";
import { passwordProblem } from "@/lib/services/password-check";
import { createClient, createRecoveryClient } from "@/lib/supabase";

const Input = z.object({
  token_hash: z.string().optional(),
  password: z.string(),
  confirm: z.string(),
});

export const POST: APIRoute = async (context) => {
  /** `tokenHash` goes back into the URL only while the link has not been used. */
  const fail = (error: AuthErrorCode, tokenHash?: string) => {
    const query = new URLSearchParams({ error });
    if (tokenHash) {
      query.set("token_hash", tokenHash);
    }
    return context.redirect(`/auth/reset-password?${query.toString()}`);
  };
  /** Every Supabase failure is logged with its cause before the redirect; never the token or a password. */
  const log = (message: string, cause: unknown) => {
    // eslint-disable-next-line no-console -- the cause of a failed password reset must reach the log
    console.error(message, cause);
  };

  const form = await readForm(context.request);
  if (!form) {
    return fail("validation_failed");
  }
  // Read on its own, so that a refused form does not lose the link.
  const rawToken = form.get("token_hash");
  const tokenHash = typeof rawToken === "string" && rawToken !== "" ? rawToken : undefined;
  const input = Input.safeParse({
    token_hash: rawToken ?? undefined,
    password: form.get("password"),
    confirm: form.get("confirm"),
  });
  if (!input.success) {
    return fail("validation_failed", tokenHash);
  }
  const { password, confirm } = input.data;
  const recovery = createRecoveryClient(context.request, context.cookies);
  const supabase = createClient(context.request.headers, context.cookies);
  if (!recovery || !supabase) {
    return fail("not_configured", tokenHash);
  }
  if (password !== confirm) {
    return fail("password_mismatch", tokenHash);
  }
  // The checks that need no account run before the link is used up; the e-mail comparison follows once it is known.
  const problem = passwordProblem(password, "");
  if (problem) {
    return fail(problem, tokenHash);
  }

  let email: string;
  if (tokenHash) {
    // Only the token counts, never the cookie instead of it: in a shared browser the cookie may be another account's.
    const { data, error } = await recovery.client.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (error) {
      log("Reset link verification failed", error);
      const code = authErrorCode(error);
      return fail(code, code === "otp_expired" ? undefined : tokenHash);
    }
    if (!data.user) {
      log("Reset link verification failed", "no user in the answer");
      return fail("unknown");
    }
    email = data.user.email ?? "";
  } else {
    const { data, error } = await recovery.client.auth.getUser();
    if (error) {
      log("Recovery session check failed", error);
      return fail(sessionCheckFailure(error) === "outage" ? "unknown" : "otp_expired");
    }
    email = data.user.email ?? "";
  }

  // From here on the link is used up and the recovery cookie holds the state, so no redirect carries the token.
  const emailProblem = passwordProblem(password, email);
  if (emailProblem) {
    return fail(emailProblem);
  }

  const { error: updateError } = await recovery.client.auth.updateUser({
    password,
    data: { password_change_required: false },
  });
  if (updateError) {
    log("Password reset failed", updateError);
    return fail(authErrorCode(updateError));
  }

  // The password is already changed, so a failure here is only logged.
  const { error: signOutError } = await recovery.client.auth.signOut({ scope: "others" });
  if (signOutError) {
    log("Sign-out of other sessions failed", signOutError);
  }

  // Move the session to the normal cookie. No `signOut` on the recovery client after this: it would revoke that session.
  const signInFailed = (cause: unknown) => {
    log("Sign-in after the password reset failed", cause);
    recovery.expireRecoveryCookies();
    return context.redirect("/auth/signin?error=password_changed_signin_failed");
  };
  const { data: current, error: readError } = await recovery.client.auth.getSession();
  if (readError || !current.session) {
    return signInFailed(readError ?? "no recovery session");
  }
  const { error: moveError } = await supabase.auth.setSession({
    access_token: current.session.access_token,
    refresh_token: current.session.refresh_token,
  });
  if (moveError) {
    return signInFailed(moveError);
  }
  recovery.expireRecoveryCookies();

  return context.redirect("/szukaj");
};
