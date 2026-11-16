/** Version stamp of the registry search list (no payload). */
export interface RegistrySearchListVersion {
  version: number;
  snapshotDate: string;
}

/**
 * One variant as stored in the list payload: [id, name, strength, form, commonName, substances, withdrawn?]. The 7th
 * element is present (`true`) only for a variant withdrawn from the registry; its absence means active, so a list built
 * before the withdrawn-medicine-in-kit migration reads as all active.
 */
export type RegistryVariantTuple = [
  id: number,
  name: string,
  strength: string | null,
  form: string | null,
  commonName: string | null,
  substances: string[],
  withdrawn?: true,
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
  /** Every product of the variant is withdrawn from the registry. */
  withdrawn: boolean;
}

/** One entry of `registry_packages.units`: raw registry strings (count is a number as text, e.g. "30"). */
export interface RegistryPackageUnit {
  count: string | null;
  kind: string | null;
  capacity: string | null;
  capacity_unit: string | null;
  info: string | null;
}

/** A pack of a variant, active or withdrawn, as returned by `GET /api/registry/packages`. */
export interface RegistryVariantPackage {
  packageId: number;
  productId: number;
  gtin: string | null;
  availabilityCategory: string | null;
  units: RegistryPackageUnit[];
  holder: string | null;
  /** The pack or its product has disappeared from the registry. */
  withdrawn: boolean;
}

/** One physical pack in the signed-in account's kit, joined with its registry product. */
export interface KitItem {
  id: number;
  packageId: number;
  /** Registry product of the pack; the edit panel reads the packs of its variant. */
  productId: number;
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

/**
 * Body of `PATCH /api/kit/[id]`: only the keys present are changed. `packageId` moves the item to another pack of the
 * same medicine; `quantity: null` and `expiry: null` clear the value.
 */
export interface UpdateKitItemRequest {
  packageId?: number;
  quantity?: number | null;
  expiry?: { month: number; year: number } | null;
}

/** Body of a successful `PATCH /api/kit/[id]` (200): the item as stored. */
export interface UpdateKitItemResponse {
  item: KitItem;
}

/** Body of a successful `POST /api/kit/import` (201): the new ids in the order of the request's items. */
export interface ImportKitItemsResponse {
  ids: number[];
}

/** Body of a `POST /api/kit/import` rejected for one item (400): `index` is its 0-based position in `items`. */
export interface ImportKitItemsItemError {
  error: string;
  index: number;
}

/** A kit item matching the checked medicine, as returned by `GET /api/kit/check`. */
export interface MedicineCheckItem {
  id: number;
  packageId: number;
  /** "variant": the same medicine (name, strength, form); "substance": the same active composition. */
  match: "variant" | "substance";
  /** Which set matched a "substance" item ("common_name" wins when both do); null for "variant" items. */
  matchedBy: "common_name" | "substances" | null;
  name: string;
  strength: string | null;
  form: string | null;
  holder: string | null;
  commonName: string | null;
  /** Raw active substance names in registry position order (possibly empty). */
  substances: string[];
  units: RegistryPackageUnit[];
  quantity: number | null;
  /** ISO date (YYYY-MM-DD); for month precision the last day of the month. */
  expiresOn: string | null;
  expiryPrecision: "month" | "day" | null;
  /** The pack or its product has disappeared from the registry. */
  withdrawn: boolean;
  createdAt: string;
}

/** Body of a successful `GET /api/kit/check` (200). Items: variant matches first, then nearest expiry, newest first. */
export interface MedicineCheckResponse {
  /** The checked medicine with its full (untruncated) strength. */
  searched: RegistryVariant;
  /** The searched medicine has a usable common name or substance set, so "substance" matches were possible. */
  comparable: boolean;
  items: MedicineCheckItem[];
}

/** Result of matching one kit-import row against the registry list (`matchRow` in `src/lib/kit-import.ts`). */
export type RowMatch =
  | { kind: "auto"; variant: RegistryVariant }
  | { kind: "choices"; variants: RegistryVariant[]; total: number }
  | { kind: "none" };

/** What `matchRow` needs to know about one kit-import row (built by `rowMatchRequest` in `src/lib/kit-import.ts`). */
export interface RowMatchRequest {
  /** Search queries, most specific first. */
  queries: string[];
  /**
   * The row's name when the row is complete (name, strength and form); only then may a single hit be assigned on its
   * own, and only when the hit has this name. Null for an incomplete row: it only gets suggestions.
   */
  exactName: string | null;
  /**
   * The row's strength, set together with `exactName`. Search matches strength words by prefix ("4" finds "40 mg"),
   * so an automatic assignment also needs each of these words as a whole word of the hit's strength.
   */
  exactStrength: string | null;
}

/**
 * Page -> search worker: the raw list bytes (transferred, not copied), then queries. `match` carries the match
 * request of each kit-import row (`rowMatchRequest`), in row order.
 */
export type RegistrySearchWorkerRequest =
  | { type: "load"; buffer: ArrayBuffer }
  | { type: "search"; id: number; query: string }
  | { type: "match"; id: number; rows: RowMatchRequest[] };

/**
 * Search worker -> page. `results` echo the `id` and `query` of the request they answer; `matches` echo the `id` and
 * hold one match per requested row, in row order.
 */
export type RegistrySearchWorkerResponse =
  | { type: "ready"; variantCount: number; buildMs: number }
  | { type: "error" }
  | { type: "results"; id: number; query: string; results: RegistryVariant[]; total: number }
  | { type: "matches"; id: number; matches: RowMatch[] };
