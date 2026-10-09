import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { getVariantPackages } from "@/lib/services/kit";

const productParam = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());

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

  const product = productParam.safeParse(context.url.searchParams.get("product") ?? "");
  if (!product.success) {
    return json({ error: "Invalid parameter product: expected a positive integer" }, 400);
  }

  try {
    const packages = await getVariantPackages(supabase, product.data);
    return json({ packages }, 200);
  } catch (error) {
    // eslint-disable-next-line no-console -- the only trace of the failure; the response stays generic
    console.error(error);
    return json({ error: "Failed to load the packs of this medicine" }, 500);
  }
};
