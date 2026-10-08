import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { expiryToDate, packQuantity } from "@/lib/kit-format";
import { addKitItem, getPackage } from "@/lib/services/kit";
import type { AddKitItemResponse } from "@/types";

const addRequest = z
  .object({
    packageId: z.number().int().positive(),
    quantity: z.number().int().min(0).nullable().optional(),
    expiry: z
      .object({ month: z.number().int().min(1).max(12), year: z.number().int().min(2000).max(2100) })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 503);
  }
  if (!context.locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = addRequest.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: "Invalid request",
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
      400,
    );
  }
  const { packageId, quantity = null, expiry = null } = parsed.data;

  try {
    const pack = await getPackage(supabase, packageId);
    if (!pack) {
      return json({ error: "Package not found or withdrawn from the registry" }, 400);
    }
    const { max } = packQuantity(pack.units);
    if (quantity !== null && max !== null && quantity > max) {
      return json({ error: `Quantity exceeds the pack size (${max})` }, 400);
    }

    const { id } = await addKitItem(supabase, {
      packageId,
      quantity,
      expiresOn: expiry ? expiryToDate(expiry.month, expiry.year) : null,
      expiryPrecision: expiry ? "month" : null,
    });
    const response: AddKitItemResponse = { id };
    return json(response, 201);
  } catch (error) {
    // eslint-disable-next-line no-console -- the only trace of the failure; the response stays generic
    console.error(error);
    return json({ error: "Failed to add the medicine to the kit" }, 500);
  }
};
