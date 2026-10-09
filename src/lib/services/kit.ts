import type { SupabaseClient } from "@supabase/supabase-js";
import type { KitItem, RegistryPackageUnit, RegistryVariantPackage } from "@/types";

// PostgREST returns bigint columns as JSON numbers; registry and kit ids stay far below 2^53.

interface VariantPackageRow {
  package_id: number;
  product_id: number;
  gtin: string | null;
  availability_category: string | null;
  units: RegistryPackageUnit[] | null;
  marketing_authorization_holder: string | null;
}

interface PackageRow {
  id: number;
  product_id: number;
  gtin: string | null;
  availability_category: string | null;
  units: RegistryPackageUnit[] | null;
  registry_products: { marketing_authorization_holder: string | null; removed_at: string | null } | null;
}

interface KitItemRow {
  id: number;
  package_id: number;
  quantity: number | null;
  expires_on: string | null;
  expiry_precision: "month" | "day" | null;
  created_at: string;
  registry_packages: {
    units: RegistryPackageUnit[] | null;
    removed_at: string | null;
    registry_products: {
      name: string;
      strength: string | null;
      pharmaceutical_form: string | null;
      marketing_authorization_holder: string | null;
      removed_at: string | null;
    };
  };
}

/** Active packs of every active product sharing the variant of `productId` (the picked suggestion). */
export async function getVariantPackages(
  supabase: SupabaseClient,
  productId: number,
): Promise<RegistryVariantPackage[]> {
  const response = await supabase.rpc("registry_variant_packages", { p_product_id: productId });
  if (response.error) {
    throw new Error(`Failed to read packs of registry product ${productId}: ${response.error.message}`);
  }
  return ((response.data ?? []) as VariantPackageRow[]).map((row) => ({
    packageId: row.package_id,
    productId: row.product_id,
    gtin: row.gtin,
    availabilityCategory: row.availability_category,
    units: row.units ?? [],
    holder: row.marketing_authorization_holder,
  }));
}

/** The pack with its units, or null when it does not exist or is withdrawn (pack or product removed). */
export async function getPackage(supabase: SupabaseClient, packageId: number): Promise<RegistryVariantPackage | null> {
  const { data, error } = await supabase
    .from("registry_packages")
    .select(
      "id, product_id, gtin, availability_category, units, registry_products!inner(marketing_authorization_holder, removed_at)",
    )
    .eq("id", packageId)
    .is("removed_at", null)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read registry package ${packageId}: ${error.message}`);
  }
  const row = data as unknown as PackageRow | null;
  if (row?.registry_products?.removed_at !== null) {
    return null;
  }
  return {
    packageId: row.id,
    productId: row.product_id,
    gtin: row.gtin,
    availabilityCategory: row.availability_category,
    units: row.units ?? [],
    holder: row.registry_products.marketing_authorization_holder,
  };
}

/** Adds one pack to the signed-in account's kit; the owner is set by the database (`user_id` default). */
export async function addKitItem(
  supabase: SupabaseClient,
  input: {
    packageId: number;
    quantity: number | null;
    expiresOn: string | null;
    expiryPrecision: "month" | "day" | null;
  },
): Promise<{ id: number }> {
  const { data, error } = await supabase
    .from("kit_items")
    .insert({
      package_id: input.packageId,
      quantity: input.quantity,
      expires_on: input.expiresOn,
      expiry_precision: input.expiryPrecision,
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(`Failed to add kit item for package ${input.packageId}: ${error.message}`);
  }
  return { id: Number(data.id) };
}

/** The signed-in account's kit, newest first (RLS limits the rows to the owner). */
export async function listKitItems(supabase: SupabaseClient): Promise<KitItem[]> {
  const { data, error } = await supabase
    .from("kit_items")
    .select(
      "id, package_id, quantity, expires_on, expiry_precision, created_at, registry_packages!inner(units, removed_at, registry_products!inner(name, strength, pharmaceutical_form, marketing_authorization_holder, removed_at))",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) {
    throw new Error(`Failed to read kit items: ${error.message}`);
  }
  return (data as unknown as KitItemRow[]).map((row) => {
    const pack = row.registry_packages;
    const product = pack.registry_products;
    return {
      id: row.id,
      packageId: row.package_id,
      name: product.name,
      strength: product.strength,
      form: product.pharmaceutical_form,
      holder: product.marketing_authorization_holder,
      units: pack.units ?? [],
      quantity: row.quantity,
      expiresOn: row.expires_on,
      expiryPrecision: row.expiry_precision,
      withdrawn: pack.removed_at !== null || product.removed_at !== null,
      createdAt: row.created_at,
    };
  });
}

/** How many kit items of the signed-in account are an instance of this pack. */
export async function countKitItemsWithPackage(supabase: SupabaseClient, packageId: number): Promise<number> {
  const { count, error } = await supabase
    .from("kit_items")
    .select("id", { count: "exact", head: true })
    .eq("package_id", packageId);
  if (error) {
    throw new Error(`Failed to count kit items of package ${packageId}: ${error.message}`);
  }
  return count ?? 0;
}
