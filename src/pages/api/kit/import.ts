import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { expiryToDate, packQuantity } from "@/lib/kit-format";
import { kitImportRequest } from "@/lib/kit-request";
import { addKitItems, getPackages } from "@/lib/services/kit";
import type { ImportKitItemsItemError, ImportKitItemsResponse } from "@/types";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Saves one page of a kit import: every item is checked like `POST /api/kit`, then all are stored or none. */
export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 503);
  }
  if (!context.locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!context.request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Content-Type must be application/json" }, 415);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = kitImportRequest.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: "Invalid request",
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
      400,
    );
  }
  const items = parsed.data.items.map(({ packageId, quantity = null, expiry = null }) => ({
    packageId,
    quantity,
    expiry,
  }));

  try {
    const packs = await getPackages(
      supabase,
      items.map((item) => item.packageId),
    );
    for (const [index, item] of items.entries()) {
      const pack = packs.get(item.packageId);
      if (!pack) {
        const rejected: ImportKitItemsItemError = { error: "Package not found or withdrawn from the registry", index };
        return json(rejected, 400);
      }
      const { max } = packQuantity(pack.units);
      if (item.quantity !== null && max !== null && item.quantity > max) {
        const rejected: ImportKitItemsItemError = { error: `Quantity exceeds the pack size (${max})`, index };
        return json(rejected, 400);
      }
    }

    const { ids } = await addKitItems(
      supabase,
      items.map((item) => ({
        packageId: item.packageId,
        quantity: item.quantity,
        expiresOn: item.expiry ? expiryToDate(item.expiry.month, item.expiry.year) : null,
        expiryPrecision: item.expiry ? "month" : null,
      })),
    );
    const response: ImportKitItemsResponse = { ids };
    return json(response, 201);
  } catch (error) {
    // eslint-disable-next-line no-console -- the only trace of the failure; the response stays generic
    console.error(error);
    return json({ error: "Failed to add the medicines to the kit" }, 500);
  }
};
