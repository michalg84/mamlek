import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { getSearchListPayload } from "@/lib/services/registry-search-list";

const versionParam = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const GET: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 503);
  }
  if (!context.locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const rawVersion = context.url.searchParams.get("v");
  if (rawVersion !== null && !versionParam.safeParse(rawVersion).success) {
    return json({ error: "Invalid parameter v: expected a positive integer" }, 400);
  }

  let list;
  try {
    list = await getSearchListPayload(supabase);
  } catch (error) {
    // eslint-disable-next-line no-console -- the only trace of the failure; the response stays generic
    console.error(error);
    return json({ error: "Failed to load the registry search list" }, 500);
  }
  if (!list) {
    // eslint-disable-next-line no-console -- RLS returns no rows (not an error) for a rejected session, same as an unbuilt list
    console.warn(
      "registry search list: no row visible to the signed-in user (list not built, or session rejected by RLS)",
    );
    return json({ error: "Registry search list not found" }, 404);
  }

  // The body is the stored JSON text passed through as is; the version in the URL makes it cacheable until the next import.
  // Only the canonical spelling of the version is immutable, so "?v=007" and "?v=7" do not become two cache entries.
  const immutable = rawVersion === String(list.version);
  return new Response(list.payload, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": immutable ? "private, max-age=31536000, immutable" : "private, no-cache",
    },
  });
};
