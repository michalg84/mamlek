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
 * Registry `capacity_unit` words for things a user counts one by one (tablets, capsules, patches). Lower case, compared
 * after trimming. Doses (`dawek`, `dawka`) and measures (ml, g, mg) are left out on purpose.
 */
const COUNTED_UNITS = new Set([
  "tabl.",
  "tabletek",
  "kaps.",
  "szt.",
  "pastylek",
  "pastylki",
  "plastrów",
  "plastry",
  "plaster",
  "systemów",
  "systemy",
]);

/** A positive safe integer written as plain digits ("90"), or null for anything else ("0", "0,5", "", null). */
function positiveInteger(value: string | null | undefined): number | null {
  const trimmed = present(value);
  if (trimmed === null || !/^\d+$/.test(trimmed)) {
    return null;
  }
  const number = Number(trimmed);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

/** Quantity unit and size of a pack (`packQuantity`); null when the pack gives none. */
export interface PackQuantity {
  unit: string | null;
  max: number | null;
}

/**
 * Quantity unit and size of a pack (a quantity above the size is allowed, with a warning). Only a single-entry pack has them:
 * - when its `capacity_unit` is counted one by one (tablets, capsules, ...) and its `capacity` is a positive integer,
 *   the quantity is in those pieces: max = count × capacity (capacity alone without a count; capped at
 *   `MAX_QUANTITY`), unit = the `capacity_unit` ("1 butelka 90 tabl." → 90 tabl.);
 * - otherwise, with a positive integer count: unit = the entry's kind, max = its count ("4 fiol. 5 ml" → 4 fiol.).
 * Anything else has no cap and no unit word.
 */
export function packQuantity(units: RegistryPackageUnit[]): PackQuantity {
  if (units.length !== 1) {
    return { unit: null, max: null };
  }
  const [unit] = units;
  const count = positiveInteger(unit.count);
  const capacity = positiveInteger(unit.capacity);
  const capacityUnit = present(unit.capacity_unit);
  const countPresent = present(unit.count) !== null;
  if (
    capacity !== null &&
    capacityUnit !== null &&
    COUNTED_UNITS.has(capacityUnit.toLowerCase()) &&
    (count !== null || !countPresent)
  ) {
    return { unit: capacityUnit, max: Math.min((count ?? 1) * capacity, MAX_QUANTITY) };
  }
  if (count === null) {
    return { unit: null, max: null };
  }
  return { unit: present(unit.kind), max: count };
}

/** True when the typed quantity is a whole number above the pack size `max`: saved anyway, with a warning. */
export function overPackSize(text: string, max: number | null): boolean {
  const trimmed = text.trim();
  if (max === null || trimmed === "") {
    return false;
  }
  const value = Number(trimmed);
  return Number.isInteger(value) && value > max;
}

/** Why 0 is refused when an item is added. */
export const EMPTY_PACK_ON_ADD = "Puste opakowanie nie trafia do apteczki: podaj 1 lub więcej albo zostaw pole puste";

/**
 * Quantity typed by the user, checked like the API does: empty text is an unknown quantity (`null`), anything else
 * must be an integer from `min` up to `MAX_QUANTITY`. `min` is 1 when an item is added (an empty pack is not added)
 * and 0 when a stored item is edited (the pack was used up). A quantity above the pack size is valid (a blister of 12
 * can hold 14 loose tablets): the field only warns about it, see `overPackSize`. `badInput` is the
 * `validity.badInput` of the number field the text came from.
 */
export function parseQuantityInput(
  text: string,
  badInput = false,
  min: 0 | 1 = 0,
): { value: number | null } | { error: string } {
  const trimmed = text.trim();
  const notANumber = `Podaj liczbę całkowitą, ${min} lub większą`;
  // A number field answers "" for something it cannot read ("-", "1e"): that is a mistake, not an unknown quantity.
  if (badInput) {
    return { error: notANumber };
  }
  if (trimmed === "") {
    return { value: null };
  }
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0) {
    return { error: notANumber };
  }
  if (value < min) {
    return { error: EMPTY_PACK_ON_ADD };
  }
  if (value > MAX_QUANTITY) {
    return { error: `Ilość nie może być większa niż ${MAX_QUANTITY}` };
  }
  return { value };
}

/**
 * Expiry picked in the month and year selects (values as text, "" = not picked): both empty is an unknown date
 * (`null`), only one of them is an error.
 */
export function parseExpiryInput(
  month: string,
  year: string,
): { value: { month: number; year: number } | null } | { error: string } {
  if (month === "" && year === "") {
    return { value: null };
  }
  if (month === "" || year === "") {
    return { error: "Wybierz miesiąc i rok albo zostaw oba pola puste" };
  }
  return { value: { month: Number(month), year: Number(year) } };
}

/** Month and year of a stored expiry date as select values ("3", "2027"); both "" for an unknown date. */
export function expiryInput(expiresOn: string | null): { month: string; year: string } {
  if (expiresOn === null) {
    return { month: "", year: "" };
  }
  const [year, month] = expiresOn.split("-");
  return { month: String(Number(month)), year: String(Number(year)) };
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

/** Where a pack's expiry date stands on `today`: past it, ending this month or the next, later, or unknown. */
export type ExpiryStatus = "expired" | "expiring" | "valid" | "unknown";

/** The month after today's, as "YYYY-MM" (December rolls over to January of the next year). */
function nextMonth(today: string): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return month === 12 ? `${String(year + 1).padStart(4, "0")}-01` : `${today.slice(0, 4)}-${pad2(month + 1)}`;
}

/**
 * The state of a pack's expiry date on `today` (both YYYY-MM-DD). A pack not yet expired is "expiring" when its date
 * falls in the current or the next calendar month: dates are stored by month, so the warning counts months too.
 */
export function expiryStatus(expiresOn: string | null, today: string): ExpiryStatus {
  if (expiresOn === null) {
    return "unknown";
  }
  if (isExpired(expiresOn, today)) {
    return "expired";
  }
  return expiresOn.slice(0, 7) <= nextMonth(today) ? "expiring" : "valid";
}

/** "1 opakowanie", "2 opakowania", "5 opakowań", "22 opakowania", "12 opakowań". */
export function packCount(count: number): string {
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (count === 1) {
    return "1 opakowanie";
  }
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return `${count} opakowania`;
  }
  return `${count} opakowań`;
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
