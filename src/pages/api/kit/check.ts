import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { DEFAULT_MATCH_LEVEL, MATCH_LEVELS } from "@/lib/match-level";
import { getMedicineCheck } from "@/lib/services/medicine-check";

const productParam = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const levelParam = z.enum(MATCH_LEVELS);

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
  const rawLevel = context.url.searchParams.get("level");
  const level =
    rawLevel === null ? { success: true as const, data: DEFAULT_MATCH_LEVEL } : levelParam.safeParse(rawLevel);
  if (!level.success) {
    return json({ error: `Invalid parameter level: expected one of ${MATCH_LEVELS.join(", ")}` }, 400);
  }

  try {
    const result = await getMedicineCheck(supabase, product.data, level.data);
    if (result === null) {
      return json({ error: "Medicine not found" }, 404);
    }
    return json(result, 200);
  } catch (error) {
    // eslint-disable-next-line no-console -- the only trace of the failure; the response stays generic
    console.error(error);
    return json({ error: "Failed to check the medicine against the kit" }, 500);
  }
};
