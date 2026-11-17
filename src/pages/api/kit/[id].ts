import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { expiryToDate } from "@/lib/kit-format";
import { kitItemIdParam, kitItemUpdateRequest } from "@/lib/kit-request";
import { deleteKitItem, getKitItem, getVariantPackages, updateKitItem, type KitItemChanges } from "@/lib/services/kit";
import type { UpdateKitItemResponse } from "@/types";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const PATCH: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 503);
  }
  if (!context.locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Before the id, to answer in the same order as POST /api/kit.
  if (!context.request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Content-Type must be application/json" }, 415);
  }
  const id = kitItemIdParam.safeParse(context.params.id);
  if (!id.success) {
    return json({ error: "Invalid kit item id" }, 400);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = kitItemUpdateRequest.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: "Invalid request",
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
      400,
    );
  }
  const { packageId, quantity, expiry } = parsed.data;

  try {
    // RLS hides another account's row, so it is "not found" like a row that never existed.
    const item = await getKitItem(supabase, id.data);
    if (!item) {
      return json({ error: "Not found" }, 404);
    }

    // A quantity above the pack size is accepted (the screen only warns), so neither the stored nor a new pack caps it.
    if (packageId !== undefined && packageId !== item.packageId) {
      // The new pack must be a pack of the same medicine (variant). The variant's packs include withdrawn ones, so
      // membership does not prove the pack is active: a withdrawn medicine can still be kept, its pack included.
      const siblings = await getVariantPackages(supabase, item.productId);
      if (!siblings.some((pack) => pack.packageId === packageId)) {
        return json({ error: "Package is not a pack of this medicine" }, 400);
      }
    }

    // An absent key is left out of the update (unchanged); null clears the column.
    const changes: KitItemChanges = {};
    if (packageId !== undefined) {
      changes.package_id = packageId;
    }
    if (quantity !== undefined) {
      changes.quantity = quantity;
    }
    if (expiry !== undefined) {
      changes.expires_on = expiry ? expiryToDate(expiry.month, expiry.year) : null;
      changes.expiry_precision = expiry ? "month" : null;
    }

    const updated = await updateKitItem(supabase, id.data, changes);
    if (!updated) {
      return json({ error: "Not found" }, 404);
    }
    const response: UpdateKitItemResponse = { item: updated };
    return json(response, 200);
  } catch (error) {
    // eslint-disable-next-line no-console -- the only trace of the failure; the response stays generic
    console.error(error);
    return json({ error: "Failed to update the kit item" }, 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 503);
  }
  if (!context.locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const id = kitItemIdParam.safeParse(context.params.id);
  if (!id.success) {
    return json({ error: "Invalid kit item id" }, 400);
  }

  try {
    if (!(await deleteKitItem(supabase, id.data))) {
      return json({ error: "Not found" }, 404);
    }
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // eslint-disable-next-line no-console -- the only trace of the failure; the response stays generic
    console.error(error);
    return json({ error: "Failed to delete the kit item" }, 500);
  }
};
