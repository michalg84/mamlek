import { describe, expect, it } from "vitest";
import { formatRegistryDate, isRegistryStale, REGISTRY_MAX_AGE_DAYS } from "./registry-date";

describe("formatRegistryDate", () => {
  it("formats an ISO date as D.MM.YYYY", () => {
    expect(formatRegistryDate("2026-11-08")).toBe("8.11.2026");
    expect(formatRegistryDate("2026-12-31")).toBe("31.12.2026");
  });

  it("returns an unparsable value unchanged", () => {
    expect(formatRegistryDate("not a date")).toBe("not a date");
  });
});

describe("isRegistryStale", () => {
  it("allows 7 days and flags 8", () => {
    expect(REGISTRY_MAX_AGE_DAYS).toBe(7);
    expect(isRegistryStale("2026-11-10", "2026-11-17")).toBe(false);
    expect(isRegistryStale("2026-11-10", "2026-11-18")).toBe(true);
  });

  it("is not stale on the same day", () => {
    expect(isRegistryStale("2026-11-18", "2026-11-18")).toBe(false);
  });

  it("counts across a month and a year boundary", () => {
    // 2026-10-25 -> 2026-11-01 is 7 days, -> 2026-11-02 is 8.
    expect(isRegistryStale("2026-10-25", "2026-11-01")).toBe(false);
    expect(isRegistryStale("2026-10-25", "2026-11-02")).toBe(true);
    // 2026-12-25 -> 2027-01-01 is 7 days, -> 2027-01-02 is 8.
    expect(isRegistryStale("2026-12-25", "2027-01-01")).toBe(false);
    expect(isRegistryStale("2026-12-25", "2027-01-02")).toBe(true);
  });

  it("counts 29 February of a leap year", () => {
    // 2028-02-25 -> 2028-03-03 is 7 days (26, 27, 28, 29, 1, 2, 3), -> 2028-03-04 is 8.
    expect(isRegistryStale("2028-02-25", "2028-03-03")).toBe(false);
    expect(isRegistryStale("2028-02-25", "2028-03-04")).toBe(true);
  });

  it("does not flag a future snapshot date", () => {
    expect(isRegistryStale("2026-11-20", "2026-11-18")).toBe(false);
  });

  it("does not flag unparsable input", () => {
    expect(isRegistryStale("garbage", "2026-11-18")).toBe(false);
    expect(isRegistryStale("2026-11-10", "garbage")).toBe(false);
    expect(isRegistryStale("", "")).toBe(false);
  });

  it("honours a custom threshold", () => {
    expect(isRegistryStale("2026-11-16", "2026-11-18", 1)).toBe(true);
    expect(isRegistryStale("2026-11-17", "2026-11-18", 1)).toBe(false);
  });
});
