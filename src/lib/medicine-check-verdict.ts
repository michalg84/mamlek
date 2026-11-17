import { DEFAULT_MATCH_LEVEL, MATCH_LEVEL_TEXTS, isMatchLevel } from "@/lib/match-level";
import type { MedicineCheckItem, MedicineCheckResponse } from "@/types";

/** What the check screen shows for one answer of the medicine check. */
export interface CheckVerdict {
  kind: "variant" | "substance" | "none";
  title: string;
  detail: string | null;
  /** Kit items that are the checked medicine itself. */
  variants: MedicineCheckItem[];
  /** Kit items that only share the active composition. */
  same: MedicineCheckItem[];
  /** At least one same-substance item is shown, so the consult-a-pharmacist notice must be too. */
  caution: boolean;
  /** The registry lists no usable substance for the checked medicine, so same-substance items could not be found. */
  uncomparable: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The fields the selected-medicine card reads without checking. */
function isSearched(value: unknown) {
  return (
    isRecord(value) && typeof value.id === "number" && typeof value.name === "string" && Array.isArray(value.substances)
  );
}

/** The fields the item list reads without checking; fields that may be null in a real answer are left alone. */
function isItem(value: unknown) {
  return (
    isRecord(value) &&
    (value.match === "variant" || value.match === "substance") &&
    typeof value.id === "number" &&
    typeof value.name === "string" &&
    Array.isArray(value.substances) &&
    Array.isArray(value.units) &&
    value.units.every(isRecord) &&
    (value.expiresOn === null || typeof value.expiresOn === "string")
  );
}

/**
 * Checks the body of `GET /api/kit/check` before the screen uses it. Null means the answer is not one the screen can
 * show: an unknown match type would drop out of both lists and read as "Nie masz tego leku". A missing `level` is the
 * answer of a database without match levels, which always matched exactly; an unknown one is rejected.
 */
export function parseMedicineCheck(body: unknown): MedicineCheckResponse | null {
  if (
    !isRecord(body) ||
    !isSearched(body.searched) ||
    typeof body.comparable !== "boolean" ||
    !Array.isArray(body.items) ||
    !body.items.every(isItem) ||
    (body.level !== undefined && !isMatchLevel(body.level))
  ) {
    return null;
  }
  return { ...body, level: body.level ?? DEFAULT_MATCH_LEVEL } as unknown as MedicineCheckResponse;
}

/** "1 opakowanie", "2 opakowania", "5 opakowań", "22 opakowania", "12 opakowań". */
function packCount(count: number) {
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

/** An empty pack (quantity 0) is in the kit but gives no medicine; an unknown quantity (null) counts as having it. */
function isEmpty(item: MedicineCheckItem) {
  return item.quantity === 0;
}

/**
 * The empty packs among the matching kit items, in the order of the RPC. The verdict leaves them out, so the screen
 * lists them apart, below the verdict.
 */
export function emptyPacks(result: MedicineCheckResponse): MedicineCheckItem[] {
  return result.items.filter(isEmpty);
}

/** Turns the answer of the medicine check into the verdict the screen shows; empty packs do not count. */
export function checkVerdict(result: MedicineCheckResponse): CheckVerdict {
  // The RPC already orders the items (by match strength, then nearest expiry, unknown last, newest first): only split.
  const texts = MATCH_LEVEL_TEXTS[result.level];
  const items = result.items.filter((item) => !isEmpty(item));
  const variants = items.filter((item) => item.match === "variant");
  const same = items.filter((item) => item.match === "substance");
  const shared = { variants, same, caution: same.length > 0, uncomparable: !result.comparable };

  if (variants.length > 0) {
    return { kind: "variant", title: `Masz ten lek · ${packCount(variants.length)}`, detail: null, ...shared };
  }
  if (same.length > 0) {
    return {
      kind: "substance",
      title: texts.substanceTitle,
      detail: [...new Set(same.map((item) => item.name))].join(", "),
      ...shared,
    };
  }
  return {
    kind: "none",
    title: "Nie masz tego leku",
    detail: result.comparable ? texts.noneDetail : null,
    ...shared,
  };
}
