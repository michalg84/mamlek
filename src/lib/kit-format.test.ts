import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_QUANTITY,
  expiryInput,
  formatQuantity,
  packQuantity,
  parseExpiryInput,
  parseQuantityInput,
  todayIso,
  uniquePacks,
} from "@/lib/kit-format";
import type { RegistryPackageUnit } from "@/types";

function tablets(capacity: string): RegistryPackageUnit[] {
  return [{ count: null, kind: null, capacity, capacity_unit: "tabl.", info: null }];
}

describe("uniquePacks", () => {
  it("collapses packs that read the same, keeping the first of each and the order", () => {
    // Rennie Fruit in the registry: the same sizes under different GTINs (12, 12, 24, 24, 36, 36).
    const packs = [
      { id: 1, productId: 1, units: tablets("12") },
      { id: 2, productId: 1, units: tablets("12") },
      { id: 3, productId: 1, units: tablets("24") },
      { id: 4, productId: 1, units: tablets("24") },
      { id: 5, productId: 1, units: tablets("36") },
      { id: 6, productId: 1, units: tablets("36") },
    ];
    expect(uniquePacks(packs).map((pack) => pack.id)).toEqual([1, 3, 5]);
  });

  it("keeps packs that differ in size or in the number of units", () => {
    const blister = [{ count: "2", kind: "blistry", capacity: "10", capacity_unit: "tabl.", info: null }];
    const packs = [
      { id: 1, productId: 1, units: tablets("10") },
      { id: 2, productId: 1, units: tablets("20") },
      { id: 3, productId: 1, units: blister },
    ];
    expect(uniquePacks(packs).map((pack) => pack.id)).toEqual([1, 2, 3]);
  });

  it("keeps a pack with the same label of another product (another holder), collapsing only within one product", () => {
    // Same label "30 tabl.": two GTINs of product 1 (collapse) and one pack of product 2, a parallel import.
    const packs = [
      { id: 801, productId: 1, units: tablets("30") },
      { id: 802, productId: 1, units: tablets("30") },
      { id: 901, productId: 2, units: tablets("30") },
    ];
    expect(uniquePacks(packs).map((pack) => pack.id)).toEqual([801, 901]);
  });
});

function entry(count: string | null, kind: string | null, capacity: string | null, capacityUnit: string | null) {
  return { count, kind, capacity, capacity_unit: capacityUnit, info: null };
}

describe("packQuantity", () => {
  // Shapes as the registry writes them (count, kind, capacity, capacity_unit); expected values typed from the shape.
  it("counts a bottle of tablets in tablets: „1 butelka 90 tabl.” → 90 tabl.", () => {
    expect(packQuantity([entry("1", "butelka", "90", "tabl.")])).toEqual({ unit: "tabl.", max: 90 });
  });

  it("multiplies the count by the capacity: „2 blistry 10 tabl.” → 20 tabl.", () => {
    expect(packQuantity([entry("2", "blistry", "10", "tabl.")])).toEqual({ unit: "tabl.", max: 20 });
  });

  it("takes the capacity alone without a count: „12 tabl.” → 12 tabl.", () => {
    expect(packQuantity([entry(null, null, "12", "tabl.")])).toEqual({ unit: "tabl.", max: 12 });
  });

  it("counts capsules, pieces and patches the same way", () => {
    expect(packQuantity([entry(null, null, "28", "kaps.")])).toEqual({ unit: "kaps.", max: 28 });
    expect(packQuantity([entry("3", "sasz.", "5", "szt.")])).toEqual({ unit: "szt.", max: 15 });
    expect(packQuantity([entry(null, null, "8", "plastrów")])).toEqual({ unit: "plastrów", max: 8 });
    expect(packQuantity([entry("1", "tuba", "30", "Systemów")])).toEqual({ unit: "Systemów", max: 30 });
  });

  it("matches the unit whatever its case and surrounding spaces, and shows it trimmed as the registry writes it", () => {
    expect(packQuantity([entry("1", "butelka", "90", " TABL. ")])).toEqual({ unit: "TABL.", max: 90 });
    expect(packQuantity([entry(null, null, " 12 ", "Tabletek")])).toEqual({ unit: "Tabletek", max: 12 });
  });

  it("keeps the old rule for doses: „1 inhalator 200 dawek” → 1 inhalator", () => {
    expect(packQuantity([entry("1", "inhalator", "200", "dawek")])).toEqual({ unit: "inhalator", max: 1 });
  });

  it("keeps the old rule for a measure: „1 butelka 100 ml” → 1 butelka, „4 fiol. 5 ml” → 4 fiol.", () => {
    expect(packQuantity([entry("1", "butelka", "100", "ml")])).toEqual({ unit: "butelka", max: 1 });
    expect(packQuantity([entry("4", "fiol.", "5", "ml")])).toEqual({ unit: "fiol.", max: 4 });
  });

  it("keeps the old rule for a count without a capacity: „10 sasz.” → 10 sasz.", () => {
    expect(packQuantity([entry("10", "sasz.", null, null)])).toEqual({ unit: "sasz.", max: 10 });
  });

  it("keeps the old rule for a fractional capacity: „2 blistry 0,5 tabl.” → 2 blistry, „0,5 tabl.” → none", () => {
    expect(packQuantity([entry("2", "blistry", "0,5", "tabl.")])).toEqual({ unit: "blistry", max: 2 });
    expect(packQuantity([entry(null, null, "0,5", "tabl.")])).toEqual({ unit: null, max: null });
  });

  it("keeps the old rule when the count is there but no positive integer", () => {
    expect(packQuantity([entry("0", "butelka", "90", "tabl.")])).toEqual({ unit: null, max: null });
    expect(packQuantity([entry("1,5", "butelka", "90", "tabl.")])).toEqual({ unit: null, max: null });
  });

  it("caps the product at MAX_QUANTITY: „1000 blistrów 1000 tabl.” → 100000 tabl.", () => {
    expect(packQuantity([entry("1000", "blistrów", "1000", "tabl.")])).toEqual({ unit: "tabl.", max: 100000 });
  });

  it("gives no unit and no cap to a pack of several entries or of none", () => {
    const syringeAndNeedle = [entry("1", "amp.-strzyk.", "1", "ml"), entry("1", "igła", null, null)];
    expect(packQuantity(syringeAndNeedle)).toEqual({ unit: null, max: null });
    expect(packQuantity([entry("1", "butelka", "90", "tabl."), entry("1", "miarka", null, null)])).toEqual({
      unit: null,
      max: null,
    });
    expect(packQuantity([])).toEqual({ unit: null, max: null });
  });
});

describe("formatQuantity", () => {
  it("shows the quantity with the cap and the unit of the pack", () => {
    expect(formatQuantity(8, [entry(null, null, "12", "tabl.")])).toBe("8 z 12 tabl.");
    expect(formatQuantity(60, [entry("1", "butelka", "90", "tabl.")])).toBe("60 z 90 tabl.");
    expect(formatQuantity(3, [entry("4", "fiol.", "5", "ml")])).toBe("3 z 4 fiol.");
  });

  it("shows the bare number for a pack without a cap and „nieznane” for an unknown quantity", () => {
    expect(formatQuantity(7, [entry(null, null, "100", "ml")])).toBe("7");
    expect(formatQuantity(null, [entry(null, null, "12", "tabl.")])).toBe("nieznane");
  });
});

describe("todayIso", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("without a time zone is the local date of the runtime", () => {
    // Built from local parts, so the expectation does not depend on the zone the test runs in.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 31, 23, 30));
    expect(todayIso()).toBe("2026-10-31");
  });

  it("in Europe/Warsaw is already the next day at 23:30 UTC on the last day of a month (winter time)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-30T23:30:00Z"));
    expect(todayIso("Europe/Warsaw")).toBe("2026-12-01");
  });

  it("in Europe/Warsaw is already the next day at 22:30 UTC on the last day of a month (summer time)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-30T22:30:00Z"));
    expect(todayIso("Europe/Warsaw")).toBe("2026-07-01");
  });

  it("in Europe/Warsaw is still the same day an hour earlier", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-30T22:30:00Z"));
    expect(todayIso("Europe/Warsaw")).toBe("2026-11-30");
  });
});

describe("parseQuantityInput", () => {
  it("reads empty or blank text as an unknown quantity", () => {
    expect(parseQuantityInput("", 30)).toEqual({ value: null });
    expect(parseQuantityInput("   ", 30)).toEqual({ value: null });
  });

  it("accepts 0 and the pack size, and refuses one more than the pack size", () => {
    expect(parseQuantityInput("0", 30)).toEqual({ value: 0 });
    expect(parseQuantityInput(" 30 ", 30)).toEqual({ value: 30 });
    expect(parseQuantityInput("31", 30)).toEqual({ error: "Ilość nie może być większa niż 30" });
  });

  it("caps a pack without a size at MAX_QUANTITY", () => {
    expect(parseQuantityInput(String(MAX_QUANTITY), null)).toEqual({ value: MAX_QUANTITY });
    expect(parseQuantityInput(String(MAX_QUANTITY + 1), null)).toEqual({
      error: `Ilość nie może być większa niż ${MAX_QUANTITY}`,
    });
  });

  it("refuses a negative number, a fraction and text that is no number", () => {
    const error = { error: "Podaj liczbę całkowitą, 0 lub większą" };
    expect(parseQuantityInput("-1", 30)).toEqual(error);
    expect(parseQuantityInput("1.5", 30)).toEqual(error);
    expect(parseQuantityInput("abc", 30)).toEqual(error);
  });

  it("refuses an empty value the number field reported as unreadable, instead of reading it as unknown", () => {
    expect(parseQuantityInput("", 30, true)).toEqual({ error: "Podaj liczbę całkowitą, 0 lub większą" });
    expect(parseQuantityInput("", 30, false)).toEqual({ value: null });
  });
});

describe("parseExpiryInput", () => {
  it("reads both selects empty as an unknown date and both picked as month and year", () => {
    expect(parseExpiryInput("", "")).toEqual({ value: null });
    expect(parseExpiryInput("3", "2027")).toEqual({ value: { month: 3, year: 2027 } });
  });

  it("refuses only one of the two picked", () => {
    const error = { error: "Wybierz miesiąc i rok albo zostaw oba pola puste" };
    expect(parseExpiryInput("3", "")).toEqual(error);
    expect(parseExpiryInput("", "2027")).toEqual(error);
  });
});

describe("expiryInput", () => {
  it("gives the select values of a stored date, without leading zeros, and empty ones for an unknown date", () => {
    expect(expiryInput("2027-03-31")).toEqual({ month: "3", year: "2027" });
    expect(expiryInput("2027-12-15")).toEqual({ month: "12", year: "2027" });
    expect(expiryInput(null)).toEqual({ month: "", year: "" });
  });
});
