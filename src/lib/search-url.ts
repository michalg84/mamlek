/** What the address of `/szukaj` says about the screen: a picked variant or a substance filter, never both. */
export interface SearchUrlState {
  variantId: number | null;
  substance: string | null;
}

/** A substance name longer than this is not a registry name; the parameter is ignored. */
export const MAX_SUBSTANCE_LENGTH = 200;

/**
 * Reads the `lek` and `substancja` parameters of `/szukaj`. Shared by the page (`Astro.url`) and by the client on
 * `popstate`, so both read an address the same way. A wrong value is ignored, never an error. With both parameters
 * `lek` wins and `substance` is null.
 */
export function parseSearchState(params: URLSearchParams): SearchUrlState {
  const lek = params.get("lek");
  if (lek !== null && /^\d+$/.test(lek)) {
    const id = Number(lek);
    if (Number.isSafeInteger(id)) {
      return { variantId: id, substance: null };
    }
  }
  const substance = params.get("substancja")?.trim() ?? "";
  if (substance === "" || substance.length > MAX_SUBSTANCE_LENGTH) {
    return { variantId: null, substance: null };
  }
  return { variantId: null, substance };
}

/** Address of the list of medicines that have this substance. */
export function substanceHref(substance: string): string {
  return `/szukaj?substancja=${encodeURIComponent(substance)}`;
}

/** Address of the search screen with this medicine picked (`id` is a list id). */
export function variantHref(id: number): string {
  return `/szukaj?lek=${id}`;
}

/** Address of the kit page with the add form showing this medicine (`id` is a list id). */
export function addToKitHref(id: number): string {
  return `/apteczka?lek=${id}#add-heading`;
}
