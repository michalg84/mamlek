import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) {
      // supabase-js removes the session cookies even when the server call fails, so the user is signed out here
      // either way; the failure is logged because the session may still be valid on the server.
      // eslint-disable-next-line no-console -- the cause of a failed sign-out must reach the log
      console.error("Sign-out failed", error);
    }
  }
  return context.redirect("/");
};
