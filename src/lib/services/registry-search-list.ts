import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegistrySearchListVersion } from "@/types";

// PostgREST returns bigint columns as JSON numbers; the list version stays far below 2^53.

/** Current list version and snapshot date; does not read the (large) payload. */
export async function getSearchListVersion(supabase: SupabaseClient): Promise<RegistrySearchListVersion | null> {
  const { data, error } = await supabase.from("registry_search_list").select("version, snapshot_date").maybeSingle();
  if (error) {
    throw new Error(`Failed to read registry search list version: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  return { version: Number(data.version), snapshotDate: String(data.snapshot_date) };
}

/** Current list version with the payload as JSON text, unparsed. */
export async function getSearchListPayload(
  supabase: SupabaseClient,
): Promise<{ version: number; payload: string } | null> {
  const { data, error } = await supabase.from("registry_search_list").select("version, payload").maybeSingle();
  if (error) {
    throw new Error(`Failed to read registry search list: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  return { version: Number(data.version), payload: String(data.payload) };
}
