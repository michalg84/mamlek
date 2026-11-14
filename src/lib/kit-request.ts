import { z } from "astro/zod";
import { MAX_QUANTITY } from "@/lib/kit-format";
import { IMPORT_PAGE_SIZE } from "@/lib/kit-import";

// Request schemas of the kit write routes. `POST /api/kit` and `POST /api/kit/import` check an item with the same
// schema, so their boundaries cannot drift apart.

/** One kit item: an active pack, an optional quantity and an optional month of expiry. */
export const kitItemRequest = z
  .object({
    packageId: z.number().int().positive(),
    quantity: z.number().int().min(0).max(MAX_QUANTITY).nullable().optional(),
    expiry: z
      .object({ month: z.number().int().min(1).max(12), year: z.number().int().min(2000).max(2100) })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

/**
 * Body of `PATCH /api/kit/[id]`: a partial change with the field rules of `kitItemRequest`. A key that is absent leaves
 * the stored value alone and `null` clears it (unlike POST, where absent means null). `packageId` cannot be cleared.
 */
export const kitItemUpdateRequest = z
  .object({
    packageId: kitItemRequest.shape.packageId.optional(),
    quantity: kitItemRequest.shape.quantity,
    expiry: kitItemRequest.shape.expiry,
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: "At least one field is required" });

/** The `[id]` path segment of a kit item: digits only, no sign or leading zero, a safe integer; parsed to a number. */
export const kitItemIdParam = z
  .string()
  .regex(/^[1-9]\d*$/)
  .refine((id) => Number.isSafeInteger(Number(id)))
  .transform(Number);

/** Body of `POST /api/kit/import`: one page of the import, 1 to IMPORT_PAGE_SIZE items. */
export const kitImportRequest = z
  .object({
    items: z.array(kitItemRequest).min(1).max(IMPORT_PAGE_SIZE),
  })
  .strict();
