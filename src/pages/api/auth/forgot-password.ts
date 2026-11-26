import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { forgotPasswordErrorCode } from "@/lib/password-reset";
import { readForm } from "@/lib/read-form";
import { createStatelessClient } from "@/lib/supabase";

/** No address format check here: Supabase has its own, and an address it accepted at sign-up must work. */
const Input = z.object({
  email: z.string().trim().min(1),
});

export const POST: APIRoute = async (context) => {
  const fail = (error: string) => context.redirect(`/auth/forgot-password?error=${encodeURIComponent(error)}`);

  const form = await readForm(context.request);
  if (!form) {
    return fail("validation_failed");
  }
  const input = Input.safeParse({ email: form.get("email") });
  if (!input.success) {
    return fail("validation_failed");
  }
  const supabase = createStatelessClient();
  if (!supabase) {
    return fail("not_configured");
  }

  // No `redirectTo`: the mail template builds the link from the site URL.
  const { error } = await supabase.auth.resetPasswordForEmail(input.data.email);
  if (error) {
    // eslint-disable-next-line no-console -- the cause of a failed reset request must reach the log
    console.error("Password reset request failed", error);
    const code = forgotPasswordErrorCode(error);
    if (code) {
      return fail(code);
    }
    // Falling through to the success answer is a deliberate exception to "never turn an error into a success
    // redirect": the e-mail rate limit and a failed send happen only for an address that has an account, so showing
    // them would reveal who is registered. The cause is in the log above.
  }

  return context.redirect("/auth/forgot-password?wyslano=1");
};
