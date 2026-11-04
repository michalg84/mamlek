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
 * Packs of the same product that look the same to the user (same `packLabel`) collapse to the first one. The registry
 * lists the same pack size under several GTINs (e.g. Rennie Fruit: 12, 12, 24, 24, ...), and a picker with identical
 * choices only confuses. Packs of different products (e.g. a parallel import by another holder) stay apart: the
 * pickers tell them by the holder. The order of the remaining packs is kept.
 */
export function uniquePacks<T extends { productId: number; units: RegistryPackageUnit[] }>(packs: T[]): T[] {
  const seen = new Set<string>();
  return packs.filter((pack) => {
    const key = `${pack.productId}|${packLabel(pack.units)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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

/**
 * Quantity typed by the user, checked like the API does: empty text is an unknown quantity (`null`), anything else
 * must be an integer from 0 up to `max` (the pack size) or, for a pack without one, `MAX_QUANTITY`.
 */
export function parseQuantityInput(text: string, max: number | null): { value: number | null } | { error: string } {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { value: null };
  }
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0) {
    return { error: "Podaj liczbę całkowitą, 0 lub większą" };
  }
  const limit = max ?? MAX_QUANTITY;
  if (value > limit) {
    return { error: `Ilość nie może być większa niż ${limit}` };
  }
  return { value };
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

/**
 * Today's date as YYYY-MM-DD, comparable with `expiresOn` as a string. Without `timeZone` it is the local date of the
 * runtime; with one (e.g. "Europe/Warsaw") it is the date in that zone, which lets a server running in UTC answer for
 * a user elsewhere.
 */
export function todayIso(timeZone?: string): string {
  if (timeZone === undefined) {
    const now = new Date();
    return `${String(now.getFullYear()).padStart(4, "0")}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
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
