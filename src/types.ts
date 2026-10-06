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

/** Page -> search worker: the raw list bytes (transferred, not copied), then queries. */
export type RegistrySearchWorkerRequest =
  { type: "load"; buffer: ArrayBuffer } | { type: "search"; id: number; query: string };

/** Search worker -> page. `results` echo the `id` and `query` of the request they answer. */
export type RegistrySearchWorkerResponse =
  | { type: "ready"; variantCount: number; buildMs: number }
  | { type: "error" }
  | { type: "results"; id: number; query: string; results: RegistryVariant[]; total: number };
