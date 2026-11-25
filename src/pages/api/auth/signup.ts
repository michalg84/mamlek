import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { authErrorCode } from "@/lib/auth-errors";
import { passwordProblem } from "@/lib/services/password-check";
import { readForm } from "@/lib/read-form";
import { createClient } from "@/lib/supabase";

const SignUpInput = z.object({ email: z.string(), password: z.string() });

export const POST: APIRoute = async (context) => {
  const form = await readForm(context.request);
  if (!form) {
    return context.redirect("/auth/signup?error=validation_failed");
  }
  const input = SignUpInput.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!input.success) {
    return context.redirect("/auth/signup?error=validation_failed");
  }
  const { email, password } = input.data;

  // The whole password rule before Supabase is called: the form checks only the length, the server is the last gate.
  const problem = passwordProblem(password, email);
  if (problem) {
    return context.redirect(`/auth/signup?error=${problem}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signup?error=not_configured");
  }
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    // The page shows only a message for the code; the original error stays in the server log.
    // eslint-disable-next-line no-console -- the cause of a failed sign-up must reach the log
    console.error("Sign-up failed", error);
    return context.redirect(`/auth/signup?error=${authErrorCode(error)}`);
  }

  // With e-mail confirmation off Supabase returns a session right away; with it on the user must confirm first.
  return context.redirect(data.session ? "/szukaj" : "/auth/confirm-email");
};
