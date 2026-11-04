import { afterEach, describe, expect, it, vi } from "vitest";
import { todayIso, uniquePacks } from "@/lib/kit-format";
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
