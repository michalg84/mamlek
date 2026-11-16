import type { APIRoute } from "astro";
import { authErrorCode } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin?error=not_configured");
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // The page shows only a message for the code; the original error stays in the server log.
    // eslint-disable-next-line no-console -- the cause of a failed sign-in must reach the log
    console.error("Sign-in failed", error);
    return context.redirect(`/auth/signin?error=${authErrorCode(error)}`);
  }

  return context.redirect("/szukaj");
};
