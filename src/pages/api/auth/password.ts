import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { authErrorCode, type AuthErrorCode } from "@/lib/auth-errors";
import { passwordProblem } from "@/lib/services/password-check";
import { createClient } from "@/lib/supabase";

const ChangePasswordInput = z.object({ current: z.string(), password: z.string(), confirm: z.string() });

export const POST: APIRoute = async (context) => {
  const { user } = context.locals;
  if (!user?.email) {
    return context.redirect("/auth/signin");
  }

  // The marker stays in the link of an error, so the screen keeps its forced wording.
  const forced = user.user_metadata.password_change_required === true;
  const fail = (code: AuthErrorCode) => context.redirect(`/konto/haslo?error=${code}${forced ? "&wymagana=1" : ""}`);

  const form = await context.request.formData();
  const input = ChangePasswordInput.safeParse({
    current: form.get("current"),
    password: form.get("password"),
    confirm: form.get("confirm"),
  });
  if (!input.success) {
    return fail("validation_failed");
  }
  const { current, password, confirm } = input.data;

  if (password !== confirm) {
    return fail("password_mismatch");
  }
  // The same rule as sign-up, before any call to Supabase.
  const problem = passwordProblem(password, user.email);
  if (problem) {
    return fail(problem);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("not_configured");
  }

  // The session alone is not enough to change the password: the current one proves the person at the keyboard.
  const { error: currentError } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
  if (currentError) {
    // eslint-disable-next-line no-console -- the cause of a failed check of the current password must reach the log
    console.error("Current password check failed", currentError);
    // Only a wrong password is "wrong password"; a rate limit or an outage keeps its own message.
    return fail(currentError.code === "invalid_credentials" ? "current_password_invalid" : authErrorCode(currentError));
  }

  const { error } = await supabase.auth.updateUser({ password, data: { password_change_required: false } });
  if (error) {
    // eslint-disable-next-line no-console -- the cause of a failed password change must reach the log
    console.error("Password change failed", error);
    return fail(authErrorCode(error));
  }

  return context.redirect("/konto/haslo?zmieniono=1");
};
