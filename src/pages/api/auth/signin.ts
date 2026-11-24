import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { authErrorCode } from "@/lib/auth-errors";
import { passwordProblem } from "@/lib/services/password-check";
import { createClient } from "@/lib/supabase";

const SignInInput = z.object({ email: z.string(), password: z.string() });

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const input = SignInInput.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!input.success) {
    return context.redirect("/auth/signin?error=validation_failed");
  }
  const { email, password } = input.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin?error=not_configured");
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // The page shows only a message for the code; the original error stays in the server log.
    // eslint-disable-next-line no-console -- the cause of a failed sign-in must reach the log
    console.error("Sign-in failed", error);
    return context.redirect(`/auth/signin?error=${authErrorCode(error)}`);
  }

  // The password is only readable here, so this is where an old password is judged by the current rule. The result is
  // kept as a marker on the user; the middleware keeps a marked user on the change screen until the password changes.
  // Supabase's own `weakPassword` is not used: it knows only the length setting, not the list.
  const required = passwordProblem(password, data.user.email ?? email) !== null;
  if ((data.user.user_metadata.password_change_required === true) !== required) {
    const { error: markerError } = await supabase.auth.updateUser({ data: { password_change_required: required } });
    if (markerError) {
      // eslint-disable-next-line no-console -- a marker that could not be written must reach the log with its cause
      console.error("Password change marker not saved", markerError);
      if (required) {
        // A weak password that could not be marked would pass the gate: fail closed and end the session.
        await supabase.auth.signOut({ scope: "local" });
        return context.redirect("/auth/signin?error=password_check_failed");
      }
    }
  }

  return context.redirect(required ? "/konto/haslo?wymagana=1" : "/szukaj");
};
