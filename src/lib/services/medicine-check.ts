import type { SupabaseClient } from "@supabase/supabase-js";
import type { MedicineCheckResponse } from "@/types";

/**
 * Checks a registry product (the picked suggestion) against the signed-in account's kit (`medicine_check` RPC; RLS
 * limits the items to the owner). Null when the product does not exist. The RPC already returns the response shape.
 */
export async function getMedicineCheck(
  supabase: SupabaseClient,
  productId: number,
): Promise<MedicineCheckResponse | null> {
  const response = await supabase.rpc("medicine_check", { p_product_id: productId });
  if (response.error) {
    throw new Error(`Failed to check registry product ${productId} against the kit: ${response.error.message}`);
  }
  return (response.data ?? null) as MedicineCheckResponse | null;
}
