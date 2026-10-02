import type { RegistrySearchListPayload, RegistryVariant } from "@/types";

/** Queries shorter than this (letters and digits only, separators excluded) give no suggestions. */
export const MIN_QUERY_LENGTH = 3;
/** Default cap on the number of suggestions returned. */
export const MAX_RESULTS = 20;

const collator = new Intl.Collator("pl");

/** A variant with its precomputed normalized words; internal to the matcher. */
export interface RegistrySearchEntry {
  variant: RegistryVariant;
  /** Length of the original product name, the first sort key. */
  nameLength: number;
  nameWords: string[];
  commonWords: string[];
  /** Words of all active substances together. */
  substanceWords: string[];
  /** Words of strength and form. */
  extraWords: string[];
  /** Every word of the entry, each preceded by a space; a cheap necessary condition for any match. */
  haystack: string;
}

/** Search index built once per downloaded list; entries are already in final within-level order. */
export interface RegistrySearchIndex {
  version: number;
  snapshotDate: string;
  entries: RegistrySearchEntry[];
}

export interface RegistrySearchResult {
  results: RegistryVariant[];
  /** Number of all matching variants, before truncation to `limit`. */
  total: number;
}

/** Lowercase, strip diacritics (NFD + combining marks) and map `ł` to `l`. */
export function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
}

/** Words = runs of [a-z0-9] after normalization. */
function wordsOf(text: string | null): string[] {
  if (!text) {
    return [];
  }
  return normalizeText(text).match(/[a-z0-9]+/g) ?? [];
}

/** Whether the query has enough letters/digits (after normalization, separators excluded) to search. */
export function isQueryLongEnough(query: string): boolean {
  let length = 0;
  for (const word of wordsOf(query)) {
    length += word.length;
  }
  return length >= MIN_QUERY_LENGTH;
}

function compareEntries(a: RegistrySearchEntry, b: RegistrySearchEntry): number {
  return (
    a.nameLength - b.nameLength ||
    collator.compare(a.variant.name, b.variant.name) ||
    collator.compare(a.variant.strength ?? "", b.variant.strength ?? "") ||
    a.variant.id - b.variant.id
  );
}

/** Decodes the tuples, normalizes every field once and sorts the variants once (level order does not depend on the query). */
export function buildSearchIndex(payload: RegistrySearchListPayload): RegistrySearchIndex {
  const entries = payload.variants.map(([id, name, strength, form, commonName, substances]): RegistrySearchEntry => {
    const nameWords = wordsOf(name);
    const commonWords = wordsOf(commonName);
    const substanceWords = substances.flatMap(wordsOf);
    const extraWords = [...wordsOf(strength), ...wordsOf(form)];
    return {
      variant: { id, name, strength, form, commonName, substances },
      nameLength: name.length,
      nameWords,
      commonWords,
      substanceWords,
      extraWords,
      haystack: ` ${[...nameWords, ...commonWords, ...substanceWords, ...extraWords].join(" ")}`,
    };
  });
  entries.sort(compareEntries);
  return { version: payload.version, snapshotDate: payload.snapshotDate, entries };
}

function hasPrefix(words: string[], prefix: string): boolean {
  for (const word of words) {
    if (word.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/** Every query word after the first must start some word of the level's field, or of strength/form. */
function restMatches(queryWords: string[], field: string[], extra: string[]): boolean {
  for (let i = 1; i < queryWords.length; i++) {
    const word = queryWords[i];
    if (!hasPrefix(field, word) && !hasPrefix(extra, word)) {
      return false;
    }
  }
  return true;
}

/** Level of the entry for the query: 0 = A, 1 = B, 2 = C, 3 = D, -1 = no match. The first matching level wins. */
function levelOf(entry: RegistrySearchEntry, queryWords: string[]): number {
  const first = queryWords[0];
  const { nameWords, commonWords, substanceWords, extraWords } = entry;

  if (nameWords.length > 0) {
    if (nameWords[0].startsWith(first) && restMatches(queryWords, nameWords, extraWords)) {
      return 0;
    }
    for (let i = 1; i < nameWords.length; i++) {
      if (nameWords[i].startsWith(first)) {
        if (restMatches(queryWords, nameWords, extraWords)) {
          return 1;
        }
        break;
      }
    }
  }
  if (hasPrefix(commonWords, first) && restMatches(queryWords, commonWords, extraWords)) {
    return 2;
  }
  if (hasPrefix(substanceWords, first) && restMatches(queryWords, substanceWords, extraWords)) {
    return 3;
  }
  return -1;
}

/**
 * Single pass over the pre-sorted entries. Keeps the first `limit` matches in level order (A, B, C, D) and counts all of them.
 * Queries shorter than MIN_QUERY_LENGTH give an empty result.
 */
export function searchVariants(index: RegistrySearchIndex, query: string, limit = MAX_RESULTS): RegistrySearchResult {
  const queryWords = wordsOf(query);
  if (!isQueryLongEnough(query)) {
    return { results: [], total: 0 };
  }
  const tokens = queryWords.map((word) => ` ${word}`);

  const levels: RegistryVariant[][] = [[], [], [], []];
  let total = 0;
  for (const entry of index.entries) {
    let possible = true;
    for (const token of tokens) {
      if (!entry.haystack.includes(token)) {
        possible = false;
        break;
      }
    }
    if (!possible) {
      continue;
    }
    const level = levelOf(entry, queryWords);
    if (level < 0) {
      continue;
    }
    total++;
    if (levels[level].length < limit) {
      levels[level].push(entry.variant);
    }
  }

  return { results: levels.flat().slice(0, limit), total };
}
