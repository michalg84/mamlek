import { IMPORT_MAX_ROWS } from "@/lib/kit-import-csv";
import type { ParsedExpiry, ParsedQuantity, ParsedRow } from "@/lib/kit-import-csv";
import { isQueryLongEnough, searchVariants } from "@/lib/registry-search";
import type { RegistrySearchIndex } from "@/lib/registry-search";
import type { KitItem, RegistryVariant, RowMatch } from "@/types";

// Rules of the kit-import screen (FR-009): when a row is assigned on its own, what counts as "already have" or a
// repeat, what blocks saving a page and how rows are split into pages. Pure: no React, no network.

export { IMPORT_MAX_ROWS };
/** Rows per page; also the most items one `POST /api/kit/import` accepts. */
export const IMPORT_PAGE_SIZE = 30;
/** Most suggestions shown for a row. */
export const IMPORT_SUGGESTIONS = 5;

/** Strength longer than this is cut in the suggestion list (`registry_search_list.sql`). */
const LIST_STRENGTH_MAX = 80;

/** Result of matching one row against the registry list; lives in `src/types.ts` because the worker protocol uses it. */
export type { RowMatch };

/** Why a row blocks saving its page. */
export type RowIssue =
  | "no-variant"
  | "no-package"
  | "invalid-expiry"
  | "invalid-quantity"
  | "quantity-over-pack"
  | "already-have"
  | "repeated-in-import";

/** State of one row on the approval screen. */
export interface ImportRow {
  parsed: ParsedRow;
  match: RowMatch;
  /** The chosen registry variant (set from an automatic match, or picked by the user). */
  variant: RegistryVariant | null;
  packageId: number | null;
  /** Starts as the parsed value; the user may correct or clear it. */
  expiry: ParsedExpiry;
  /** Starts as the parsed value; the user may correct or clear it. */
  quantity: ParsedQuantity;
  /** "add": the user accepted adding a variant already in the kit or earlier in the import. */
  duplicateDecision: "add" | null;
  removed: boolean;
}

/** What `rowIssues` needs to know besides the row itself. */
export interface RowIssueContext {
  /** Variant keys of the account's kit (`kitItemVariantKey`). */
  kitKeys: ReadonlySet<string>;
  /** Variant keys of the not-removed rows before this one in the file (`earlierVariantKeys`). */
  earlierKeys: ReadonlySet<string>;
  /** Upper bound of the quantity for the chosen pack; null when there is no pack or it has no cap. */
  packMax: number | null;
}

/** One item of the `POST /api/kit/import` body. */
export interface ImportItem {
  packageId: number;
  quantity: number | null;
  expiry: { month: number; year: number } | null;
}

/**
 * Up to three search queries for a row, most specific first: `name strength form`, `name strength`, `name`.
 * Empty parts are skipped and repeated queries dropped. A row without a name, or a malformed one, has none.
 */
export function rowQueries(row: ParsedRow): string[] {
  if (row.malformed || row.name === "") {
    return [];
  }
  const strength = row.strength ?? "";
  const form = row.form ?? "";
  const queries: string[] = [];
  for (const parts of [[row.name, strength, form], [row.name, strength], [row.name]]) {
    const query = parts.filter((part) => part !== "").join(" ");
    if (!queries.includes(query)) {
      queries.push(query);
    }
  }
  return queries;
}

/**
 * Assigns on its own only when the first (most specific) query has exactly one hit. Any other hit, including a
 * single one from a fallback query, gives suggestions (at most IMPORT_SUGGESTIONS); no hit at all gives none.
 */
export function matchRow(index: RegistrySearchIndex, queries: string[]): RowMatch {
  for (let i = 0; i < queries.length; i++) {
    if (!isQueryLongEnough(queries[i])) {
      continue;
    }
    const { results, total } = searchVariants(index, queries[i], IMPORT_SUGGESTIONS);
    if (total === 0) {
      continue;
    }
    if (i === 0 && total === 1) {
      return { kind: "auto", variant: results[0] };
    }
    return { kind: "choices", variants: results, total };
  }
  return { kind: "none" };
}

/** Variant identity as the database defines it: `lower(name) | lower(strength) | lower(form)`, null as empty. */
export function variantKey(name: string, strength: string | null, form: string | null): string {
  return `${name.toLowerCase()}|${(strength ?? "").toLowerCase()}|${(form ?? "").toLowerCase()}`;
}

/**
 * Key of a kit item's variant. The suggestion list cuts a strength longer than 80 characters to its first 79
 * plus `…`, so the item's strength is cut the same way to compare equal to the picked variant.
 */
export function kitItemVariantKey(item: KitItem): string {
  let strength = item.strength;
  if (strength !== null) {
    // Postgres counts code points, not UTF-16 units.
    const chars = Array.from(strength);
    if (chars.length > LIST_STRENGTH_MAX) {
      strength = `${chars.slice(0, LIST_STRENGTH_MAX - 1).join("")}…`;
    }
  }
  return variantKey(item.name, strength, item.form);
}

function rowKey(row: ImportRow): string | null {
  return row.variant ? variantKey(row.variant.name, row.variant.strength, row.variant.form) : null;
}

/** For each row, the variant keys of the not-removed rows before it in the file (the whole file, not one page). */
export function earlierVariantKeys(rows: readonly ImportRow[]): Set<string>[] {
  const running = new Set<string>();
  return rows.map((row) => {
    const before = new Set(running);
    const key = row.removed ? null : rowKey(row);
    if (key !== null) {
      running.add(key);
    }
    return before;
  });
}

/** A fresh row: an automatic match is already assigned; the parsed expiry and quantity are the starting values. */
export function createImportRow(parsed: ParsedRow, match: RowMatch): ImportRow {
  return {
    parsed,
    match,
    variant: match.kind === "auto" ? match.variant : null,
    packageId: null,
    expiry: parsed.expiry,
    quantity: parsed.quantity,
    duplicateDecision: null,
    removed: false,
  };
}

/** Assigns another variant: the pack is dropped and a duplicate decision made for the old variant is cleared. */
export function assignVariant(row: ImportRow, variant: RegistryVariant): ImportRow {
  return { ...row, variant, packageId: null, duplicateDecision: null };
}

/**
 * Reasons the row blocks saving its page, in a fixed order; empty means ready. A removed row has none. An
 * automatic assignment is not a reason. "Already have" and "repeated" are lifted by `duplicateDecision: "add"`.
 */
export function rowIssues(row: ImportRow, context: RowIssueContext): RowIssue[] {
  if (row.removed) {
    return [];
  }
  const issues: RowIssue[] = [];
  const key = rowKey(row);
  if (key === null) {
    issues.push("no-variant");
  } else if (row.packageId === null) {
    issues.push("no-package");
  }
  if (row.expiry.kind === "invalid") {
    issues.push("invalid-expiry");
  }
  if (row.quantity.kind === "invalid") {
    issues.push("invalid-quantity");
  } else if (
    row.quantity.kind === "ok" &&
    row.packageId !== null &&
    context.packMax !== null &&
    row.quantity.value > context.packMax
  ) {
    issues.push("quantity-over-pack");
  }
  if (key !== null && row.duplicateDecision !== "add") {
    if (context.kitKeys.has(key)) {
      issues.push("already-have");
    }
    if (context.earlierKeys.has(key)) {
      issues.push("repeated-in-import");
    }
  }
  return issues;
}

/** Rows of one page (0-based), in file order. A removed row keeps its place, so pages never shift. */
export function pageOf<T>(rows: readonly T[], page: number): T[] {
  return rows.slice(page * IMPORT_PAGE_SIZE, (page + 1) * IMPORT_PAGE_SIZE);
}

export function pageCount(rows: readonly unknown[]): number {
  return Math.ceil(rows.length / IMPORT_PAGE_SIZE);
}

/** The request item for a ready row. Throws on a row that is not ready: the screen never saves such a page. */
export function toImportItem(row: ImportRow): ImportItem {
  if (row.packageId === null) {
    throw new Error("Cannot import a row without a pack");
  }
  if (row.expiry.kind === "invalid" || row.quantity.kind === "invalid") {
    throw new Error("Cannot import a row with an invalid expiry or quantity");
  }
  return {
    packageId: row.packageId,
    quantity: row.quantity.kind === "ok" ? row.quantity.value : null,
    expiry: row.expiry.kind === "ok" ? { month: row.expiry.month, year: row.expiry.year } : null,
  };
}
