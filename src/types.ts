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
