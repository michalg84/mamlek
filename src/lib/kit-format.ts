import type { RegistryPackageUnit } from "@/types";

// Pure helpers shared by the API (validation, storage) and the browser (form, list). No server-only imports.

const UNKNOWN = "nieznane";

/** Upper bound for a quantity when the pack gives no cap; keeps it far below the Postgres `integer` limit. */
export const MAX_QUANTITY = 100000;

function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Pack label: every unit entry as `<count> <kind>[ <capacity> <capacity_unit>]`, joined with " + ". */
export function packLabel(units: RegistryPackageUnit[]): string {
  const parts = units
    .map((unit) =>
      [unit.count, unit.kind, unit.capacity, unit.capacity_unit]
        .map(present)
        .filter((part) => part !== null)
        .join(" "),
    )
    .filter((part) => part !== "");
  return parts.length > 0 ? parts.join(" + ") : "opakowanie";
}

/**
 * Quantity unit and upper bound of a pack. Only a single-entry pack with a positive integer count has
 * them (unit = the entry's kind, max = its count); anything else has no cap and no unit word.
 */
export function packQuantity(units: RegistryPackageUnit[]): { unit: string | null; max: number | null } {
  if (units.length !== 1) {
    return { unit: null, max: null };
  }
  const [unit] = units;
  const count = present(unit.count);
  if (count === null || !/^\d+$/.test(count)) {
    return { unit: null, max: null };
  }
  const max = Number(count);
  if (!Number.isSafeInteger(max) || max <= 0) {
    return { unit: null, max: null };
  }
  return { unit: present(unit.kind), max };
}

/** ISO date (YYYY-MM-DD) of the last day of the given month. `month` is 1-12. */
export function expiryToDate(month: number, year: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(lastDay)}`;
}

/** Display of an expiry date by its precision: "MM/RRRR" (month), "DD.MM.RRRR" (day), "nieznane" (null). */
export function formatExpiry(expiresOn: string | null, precision: "month" | "day" | null): string {
  if (expiresOn === null) {
    return UNKNOWN;
  }
  const [year, month, day] = expiresOn.split("-");
  return precision === "day" ? `${day}.${month}.${year}` : `${month}/${year}`;
}

/** Today's local date as YYYY-MM-DD, comparable with `expiresOn` as a string. */
export function todayIso(): string {
  const now = new Date();
  return `${String(now.getFullYear()).padStart(4, "0")}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * True when the pack is past its expiry date. For month precision `expiresOn` is the last day of the month,
 * so the pack is usable through that month. An unknown date is never expired.
 */
export function isExpired(expiresOn: string | null, today: string): boolean {
  return expiresOn !== null && expiresOn < today;
}

/** Display of a remaining quantity: "12 z 30 sasz.", "12" (no known cap) or "nieznane". */
export function formatQuantity(quantity: number | null, units: RegistryPackageUnit[]): string {
  if (quantity === null) {
    return UNKNOWN;
  }
  const { unit, max } = packQuantity(units);
  if (max === null) {
    return String(quantity);
  }
  return `${quantity} z ${[max, unit].filter((part) => part !== null).join(" ")}`;
}
