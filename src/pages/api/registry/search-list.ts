import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { getSearchListPayload } from "@/lib/services/registry-search-list";

const versionParam = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
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
  let requestedVersion: number | null = null;
  if (rawVersion !== null) {
    const parsed = versionParam.safeParse(rawVersion);
    if (!parsed.success) {
      return json({ error: "Invalid parameter v: expected a positive integer" }, 400);
    }
    requestedVersion = parsed.data;
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
    return json({ error: "Registry search list not found" }, 404);
  }

  // The body is the stored JSON text passed through as is; the version in the URL makes it cacheable until the next import.
  return new Response(list.payload, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": requestedVersion === list.version ? "private, max-age=31536000, immutable" : "private, no-cache",
    },
  });
};
