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

/** Body of `POST /api/kit/import`: one page of the import, 1 to IMPORT_PAGE_SIZE items. */
export const kitImportRequest = z
  .object({
    items: z.array(kitItemRequest).min(1).max(IMPORT_PAGE_SIZE),
  })
  .strict();
