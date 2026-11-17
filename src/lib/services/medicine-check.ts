import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_MATCH_LEVEL } from "@/lib/match-level";
import type { MatchLevel, MedicineCheckResponse } from "@/types";

/**
 * Checks a registry product (the picked suggestion) against the signed-in account's kit (`medicine_check` RPC; RLS
 * limits the items to the owner) on a match level. Null when the product does not exist. The RPC already returns the
 * response shape. `p_level` is sent only for a level other than the default, so the default works on a database that
 * does not know it yet (between the merge and `db push`); such a database answers without `level`.
 */
export async function getMedicineCheck(
  supabase: SupabaseClient,
  productId: number,
  level: MatchLevel = DEFAULT_MATCH_LEVEL,
): Promise<MedicineCheckResponse | null> {
  const args =
    level === DEFAULT_MATCH_LEVEL ? { p_product_id: productId } : { p_product_id: productId, p_level: level };
  const response = await supabase.rpc("medicine_check", args);
  if (response.error) {
    throw new Error(
      `Failed to check registry product ${productId} against the kit on level ${level}: ${response.error.message}`,
      { cause: response.error },
    );
  }
  const data = (response.data ?? null) as (Omit<MedicineCheckResponse, "level"> & { level?: MatchLevel }) | null;
  return data === null ? null : { ...data, level: data.level ?? DEFAULT_MATCH_LEVEL };
}
