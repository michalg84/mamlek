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
 * show: an unknown match type would drop out of both lists and read as "Nie masz tego leku".
 */
export function parseMedicineCheck(body: unknown): MedicineCheckResponse | null {
  if (
    !isRecord(body) ||
    !isSearched(body.searched) ||
    typeof body.comparable !== "boolean" ||
    !Array.isArray(body.items) ||
    !body.items.every(isItem)
  ) {
    return null;
  }
  return body as unknown as MedicineCheckResponse;
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

/** Turns the answer of the medicine check into the verdict the screen shows. */
export function checkVerdict(result: MedicineCheckResponse): CheckVerdict {
  // The RPC already orders the items (variant first, nearest expiry, unknown last, newest first): only split them.
  const variants = result.items.filter((item) => item.match === "variant");
  const same = result.items.filter((item) => item.match === "substance");
  const shared = { variants, same, caution: same.length > 0, uncomparable: !result.comparable };

  if (variants.length > 0) {
    return { kind: "variant", title: `Masz ten lek · ${packCount(variants.length)}`, detail: null, ...shared };
  }
  if (same.length > 0) {
    return {
      kind: "substance",
      title: "Masz lek z tą samą substancją czynną",
      detail: [...new Set(same.map((item) => item.name))].join(", "),
      ...shared,
    };
  }
  return {
    kind: "none",
    title: "Nie masz tego leku",
    detail: result.comparable ? "Ani leku z tą samą substancją czynną" : null,
    ...shared,
  };
}
