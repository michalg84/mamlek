/** Version stamp of the registry search list (no payload). */
export interface RegistrySearchListVersion {
  version: number;
  snapshotDate: string;
}

/** One variant as stored in the list payload: [id, name, strength, form, commonName, substances]. */
export type RegistryVariantTuple = [
  id: number,
  name: string,
  strength: string | null,
  form: string | null,
  commonName: string | null,
  substances: string[],
];

/** Parsed shape of `registry_search_list.payload`. */
export interface RegistrySearchListPayload {
  version: number;
  snapshotDate: string;
  variants: RegistryVariantTuple[];
}

/** A variant tuple decoded into an object. */
export interface RegistryVariant {
  id: number;
  name: string;
  strength: string | null;
  form: string | null;
  commonName: string | null;
  substances: string[];
}

/** One entry of `registry_packages.units`: raw registry strings (count is a number as text, e.g. "30"). */
export interface RegistryPackageUnit {
  count: string | null;
  kind: string | null;
  capacity: string | null;
  capacity_unit: string | null;
  info: string | null;
}

/** An active pack of a variant, as returned by `GET /api/registry/packages`. */
export interface RegistryVariantPackage {
  packageId: number;
  productId: number;
  gtin: string | null;
  availabilityCategory: string | null;
  units: RegistryPackageUnit[];
  holder: string | null;
}

/** One physical pack in the signed-in account's kit, joined with its registry product. */
export interface KitItem {
  id: number;
  packageId: number;
  name: string;
  strength: string | null;
  form: string | null;
  holder: string | null;
  units: RegistryPackageUnit[];
  quantity: number | null;
  /** ISO date (YYYY-MM-DD); for month precision the last day of the month. */
  expiresOn: string | null;
  expiryPrecision: "month" | "day" | null;
  /** The pack or its product has disappeared from the registry. */
  withdrawn: boolean;
  createdAt: string;
}

/** Body of `POST /api/kit`. */
export interface AddKitItemRequest {
  packageId: number;
  quantity?: number | null;
  expiry?: { month: number; year: number } | null;
}

/** Body of a successful `POST /api/kit` (201). */
export interface AddKitItemResponse {
  id: number;
}

/** Page -> search worker: the raw list bytes (transferred, not copied), then queries. */
export type RegistrySearchWorkerRequest =
  { type: "load"; buffer: ArrayBuffer } | { type: "search"; id: number; query: string };

/** Search worker -> page. `results` echo the `id` and `query` of the request they answer. */
export type RegistrySearchWorkerResponse =
  | { type: "ready"; variantCount: number; buildMs: number }
  | { type: "error" }
  | { type: "results"; id: number; query: string; results: RegistryVariant[]; total: number };
