import type { RegistrySearchListPayload, RegistryVariant } from "@/types";

/** Queries shorter than this (letters and digits only, separators excluded) give no suggestions. */
export const MIN_QUERY_LENGTH = 3;
/** Default cap on the number of suggestions returned. */
export const MAX_RESULTS = 20;

const collator = new Intl.Collator("pl");

/** A variant with its precomputed normalized words; internal to the matcher. */
export interface RegistrySearchEntry {
  variant: RegistryVariant;
  /** Length of the original product name, the first sort key after the withdrawn flag. */
  nameLength: number;
  /** Numeric key of the strength, the sort key after the name; null when the strength is missing or unparseable. */
  strengthKey: StrengthKey | null;
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
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l");
}

/** Words = runs of [a-z0-9] after normalization. */
function wordsOf(text: string | null): string[] {
  if (!text) {
    return [];
  }
  return normalizeText(text).match(/[a-z0-9]+/g) ?? [];
}

/** Whether two names are the same word list after normalization: case, Polish letters and separators are ignored. */
export function sameName(a: string, b: string): boolean {
  const left = wordsOf(a);
  const right = wordsOf(b);
  return left.length === right.length && left.every((word, i) => word === right[i]);
}

/**
 * Whether every word of `text` is a whole word of `within` after normalization (not just the start of one), so a
 * strength of "4 mg" is not found in "40 mg".
 */
export function hasEveryWord(text: string, within: string | null): boolean {
  const words = new Set(wordsOf(within));
  return wordsOf(text).every((word) => words.has(word));
}

/** Whether the query has enough letters/digits (after normalization, separators excluded) to search. */
export function isQueryLongEnough(query: string): boolean {
  let length = 0;
  for (const word of wordsOf(query)) {
    length += word.length;
  }
  return length >= MIN_QUERY_LENGTH;
}

/**
 * Numeric sort key of a strength: the unit signature (e.g. `mg`, `mg/ml`, `mg+mg`, `(mg+mg)/ml`) and the numbers in
 * order (each component's value, then its own denominator's value, then the shared denominator's value).
 */
interface StrengthKey {
  signature: string;
  values: number[];
}

/** A number: digit groups separated by single spaces ("10 000"), or digits with an optional decimal comma or dot. */
const NUMBER = String.raw`(\d{1,3}(?: \d{3})+|\d+(?:[.,]\d+)?)`;
/** A unit: words without digits, whitespace or `/ + ( ) ; ,`, joined by single spaces ("mg", "j.m.", "mln j."). */
const UNIT = String.raw`([^\d\s/+();,]+(?: [^\d\s/+();,]+)*)`;
const AMOUNT_PATTERN = new RegExp(String.raw`^${NUMBER} *${UNIT}$`);
/** A denominator after `/`: an optional number (missing = 1) and a unit. */
const DENOMINATOR_PATTERN = new RegExp(String.raw`^(?:${NUMBER} *)?${UNIT}$`);
const TRAILING_NOTE_PATTERN = /\s*\([^()]*\)$/;
const SHARED_DENOMINATOR_PATTERN = /^\((.*)\)\s*\/\s*(.+)$/;
const COMPONENT_SEPARATOR = /\s*\+\s*/;
const MASS_TO_MG = new Map<string, number>([
  ["g", 1000],
  ["mg", 1],
  ["mcg", 0.001],
  ["µg", 0.001],
  ["μg", 0.001],
]);

interface Quantity {
  unit: string;
  value: number;
}

function parseNumber(text: string): number {
  return Number(text.replace(/ /g, "").replace(",", "."));
}

/** Lowercase without dots; mass units (g, mg, mcg, µg, mikrogram*) become mg with the value converted. */
function quantityOf(numberText: string | undefined, unitText: string): Quantity {
  const unit = unitText.toLowerCase().replace(/\./g, "");
  const value = numberText === undefined ? 1 : parseNumber(numberText);
  const factor = unit.startsWith("mikrogram") ? 0.001 : MASS_TO_MG.get(unit);
  return factor === undefined ? { unit, value } : { unit: "mg", value: value * factor };
}

function parseDenominator(text: string): Quantity | null {
  const match = DENOMINATOR_PATTERN.exec(text.trim());
  return match ? quantityOf(match[1], match[2]) : null;
}

/**
 * Turns a strength text into its numeric sort key, or null when it is missing or does not follow the grammar:
 * components joined by `+`, each an amount ("2,5 mg", "10 000 j.m.") with an optional own denominator ("/5 ml",
 * "/ml"), optionally wrapped in parentheses with a shared denominator ("(50 mg + 7,5 mg)/5 ml"). One trailing
 * parenthetical note ("1 mg/ml (0,1%)") is ignored. Lists ("5 mg; 10 mg"), ranges and free text give null.
 */
function strengthKeyOf(strength: string | null): StrengthKey | null {
  if (strength === null) {
    return null;
  }
  let body = strength.trim().replace(TRAILING_NOTE_PATTERN, "");
  let shared: Quantity | null = null;
  const sharedMatch = SHARED_DENOMINATOR_PATTERN.exec(body);
  if (sharedMatch) {
    body = sharedMatch[1];
    shared = parseDenominator(sharedMatch[2]);
    if (!shared) {
      return null;
    }
  }

  const units: string[] = [];
  const values: number[] = [];
  for (const component of body.trim().split(COMPONENT_SEPARATOR)) {
    const parts = component.split("/");
    if (parts.length > 2) {
      return null;
    }
    const amountMatch = AMOUNT_PATTERN.exec(parts[0].trim());
    if (!amountMatch) {
      return null;
    }
    const amount = quantityOf(amountMatch[1], amountMatch[2]);
    values.push(amount.value);
    if (parts.length === 2) {
      const denominator = parseDenominator(parts[1]);
      if (!denominator) {
        return null;
      }
      values.push(denominator.value);
      units.push(`${amount.unit}/${denominator.unit}`);
    } else {
      units.push(amount.unit);
    }
  }

  const signature = shared ? `(${units.join("+")})/${shared.unit}` : units.join("+");
  if (shared) {
    values.push(shared.value);
  }
  return { signature, values };
}

/** Parseable before null, then signature (plain string order), then values lexicographically (a shorter prefix first). */
function compareStrengthKeys(a: StrengthKey | null, b: StrengthKey | null): number {
  if (a === null || b === null) {
    return Number(a === null) - Number(b === null);
  }
  if (a.signature !== b.signature) {
    return a.signature < b.signature ? -1 : 1;
  }
  const length = Math.min(a.values.length, b.values.length);
  for (let i = 0; i < length; i++) {
    if (a.values[i] !== b.values[i]) {
      return a.values[i] - b.values[i];
    }
  }
  return a.values.length - b.values.length;
}

function compareEntries(a: RegistrySearchEntry, b: RegistrySearchEntry): number {
  return (
    Number(a.variant.withdrawn) - Number(b.variant.withdrawn) ||
    a.nameLength - b.nameLength ||
    collator.compare(a.variant.name, b.variant.name) ||
    compareStrengthKeys(a.strengthKey, b.strengthKey) ||
    collator.compare(a.variant.strength ?? "", b.variant.strength ?? "") ||
    a.variant.id - b.variant.id
  );
}

/**
 * Decodes the tuples, normalizes every field once and sorts the variants once (level order does not depend on the query).
 * Active variants sort before withdrawn ones; `searchVariants` fills the levels in this order, so inside every level
 * the active variants come first, while a withdrawn variant still beats every variant of a weaker level.
 */
export function buildSearchIndex(payload: RegistrySearchListPayload): RegistrySearchIndex {
  const entries = payload.variants.map(
    ([id, name, strength, form, commonName, substances, withdrawn]): RegistrySearchEntry => {
      const nameWords = wordsOf(name);
      const commonWords = wordsOf(commonName);
      const substanceWords = substances.flatMap(wordsOf);
      const extraWords = [...wordsOf(strength), ...wordsOf(form)];
      return {
        // The 7th tuple element is present only for a withdrawn variant; a list without it reads as all active.
        variant: { id, name, strength, form, commonName, substances, withdrawn: withdrawn === true },
        nameLength: name.length,
        strengthKey: strengthKeyOf(strength),
        nameWords,
        commonWords,
        substanceWords,
        extraWords,
        haystack: ` ${[...nameWords, ...commonWords, ...substanceWords, ...extraWords].join(" ")}`,
      };
    },
  );
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
