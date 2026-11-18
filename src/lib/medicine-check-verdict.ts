import { expiryStatus, formatExpiry, packCount } from "@/lib/kit-format";
import { DEFAULT_MATCH_LEVEL, MATCH_LEVEL_TEXTS, isMatchLevel } from "@/lib/match-level";
import type { MedicineCheckItem, MedicineCheckResponse } from "@/types";

/** What the check screen shows for one answer of the medicine check. */
export interface CheckVerdict {
  /** "expired": the kit holds the medicine, but every pack of it with something left is past its date. */
  kind: "variant" | "expired" | "substance" | "none";
  title: string;
  detail: string | null;
  /** Kit items that are the checked medicine itself: the packs still valid first, then the expired ones. */
  variants: MedicineCheckItem[];
  /** Kit items that only share the active composition, ordered like `variants`. */
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

function isExpiredPack(item: MedicineCheckItem, today: string) {
  return expiryStatus(item.expiresOn, today) === "expired";
}

/**
 * The expired packs with something left among the matching kit items, in the order of the RPC. They stay in the item
 * lists (last), and the screen announces their number.
 */
export function expiredPacks(result: MedicineCheckResponse, today: string): MedicineCheckItem[] {
  return result.items.filter((item) => !isEmpty(item) && isExpiredPack(item, today));
}

/** The latest expiry date among the items (all dated), shown with that item's precision. */
function latestExpiry(items: MedicineCheckItem[]): string {
  const latest = items.reduce((last, item) => ((item.expiresOn ?? "") > (last.expiresOn ?? "") ? item : last));
  return formatExpiry(latest.expiresOn, latest.expiryPrecision);
}

/** One match group split into the packs still valid (an unknown date included) and the expired ones. */
function splitByExpiry(items: MedicineCheckItem[], today: string) {
  const valid = items.filter((item) => !isExpiredPack(item, today));
  const expired = items.filter((item) => isExpiredPack(item, today));
  const ending = valid.length > 0 && valid.every((item) => expiryStatus(item.expiresOn, today) === "expiring");
  return { valid, expired, ordered: [...valid, ...expired], ending };
}

/**
 * Turns the answer of the medicine check into the verdict the screen shows on `today` (YYYY-MM-DD). Empty packs do not
 * count; expired packs do not count toward "Masz ten lek", but they keep the medicine apart from "Nie masz".
 */
export function checkVerdict(result: MedicineCheckResponse, today: string): CheckVerdict {
  // The RPC already orders the items (by match strength, then nearest expiry, unknown last, newest first): only split.
  const texts = MATCH_LEVEL_TEXTS[result.level];
  const items = result.items.filter((item) => !isEmpty(item));
  const variants = splitByExpiry(
    items.filter((item) => item.match === "variant"),
    today,
  );
  const same = splitByExpiry(
    items.filter((item) => item.match === "substance"),
    today,
  );
  const shared = {
    variants: variants.ordered,
    same: same.ordered,
    caution: same.ordered.length > 0,
    uncomparable: !result.comparable,
  };

  if (variants.valid.length > 0) {
    return {
      kind: "variant",
      title: `Masz ten lek · ${packCount(variants.valid.length)}`,
      detail: variants.ending ? `Ważność kończy się ${latestExpiry(variants.valid)}` : null,
      ...shared,
    };
  }
  if (variants.expired.length > 0) {
    return {
      kind: "expired",
      title: "Masz ten lek, ale przeterminowany",
      detail: `Termin ważności minął: ${latestExpiry(variants.expired)}`,
      ...shared,
    };
  }
  if (same.ordered.length > 0) {
    const names = [...new Set(same.ordered.map((item) => item.name))].join(", ");
    let suffix = "";
    if (same.valid.length === 0) {
      suffix = " · wszystkie przeterminowane";
    } else if (same.ending && same.expired.length === 0) {
      suffix = ` · ważność kończy się ${latestExpiry(same.valid)}`;
    }
    return { kind: "substance", title: texts.substanceTitle, detail: names + suffix, ...shared };
  }
  return {
    kind: "none",
    title: "Nie masz tego leku",
    detail: result.comparable ? texts.noneDetail : null,
    ...shared,
  };
}
