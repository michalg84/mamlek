import { describe, expect, it } from "vitest";
import { kitItemIdParam, kitItemUpdateRequest } from "./kit-request";

// Boundaries are typed by hand from the add-medicine-to-kit plan and the F1 review fix (quantity 0..100000, month 1-12,
// year 2000-2100), not imported from the code under test.

describe("kitItemUpdateRequest", () => {
  it.each([
    ["only packageId", { packageId: 5 }],
    ["only quantity", { quantity: 3 }],
    ["only expiry", { expiry: { month: 6, year: 2030 } }],
    ["quantity null (unknown)", { quantity: null }],
    ["expiry null (clear)", { expiry: null }],
    ["all fields", { packageId: 5, quantity: 0, expiry: { month: 1, year: 2000 } }],
  ])("accepts %s", (_name, body) => {
    expect(kitItemUpdateRequest.safeParse(body).success).toBe(true);
  });

  it("keeps an absent key absent and a null as null", () => {
    expect(kitItemUpdateRequest.parse({ quantity: 4 })).toEqual({ quantity: 4 });
    expect(kitItemUpdateRequest.parse({ expiry: null })).toEqual({ expiry: null });
  });

  it.each([
    ["an empty body", {}],
    ["an unknown key", { quantity: 1, extra: true }],
    ["userId", { userId: "x" }],
    ["user_id", { quantity: 1, user_id: "x" }],
    ["packageId null", { packageId: null }],
    ["packageId zero", { packageId: 0 }],
    ["packageId negative", { packageId: -1 }],
    ["packageId fractional", { packageId: 1.5 }],
    ["packageId a string", { packageId: "5" }],
    ["quantity negative", { quantity: -1 }],
    ["quantity above 100000", { quantity: 100_001 }],
    ["quantity fractional", { quantity: 1.5 }],
    ["quantity a string", { quantity: "5" }],
    ["expiry month 0", { expiry: { month: 0, year: 2030 } }],
    ["expiry month 13", { expiry: { month: 13, year: 2030 } }],
    ["expiry year 1999", { expiry: { month: 6, year: 1999 } }],
    ["expiry year 2101", { expiry: { month: 6, year: 2101 } }],
    ["expiry with an extra key", { expiry: { month: 6, year: 2030, day: 1 } }],
    ["expiry a string", { expiry: "2030-06" }],
    ["an array", []],
    ["null", null],
  ])("rejects %s", (_name, body) => {
    expect(kitItemUpdateRequest.safeParse(body).success).toBe(false);
  });

  it.each([
    ["quantity 0", { quantity: 0 }],
    ["quantity 100000", { quantity: 100_000 }],
    ["expiry month 1", { expiry: { month: 1, year: 2030 } }],
    ["expiry month 12", { expiry: { month: 12, year: 2030 } }],
    ["expiry year 2000", { expiry: { month: 6, year: 2000 } }],
    ["expiry year 2100", { expiry: { month: 6, year: 2100 } }],
  ])("accepts the boundary value %s", (_name, body) => {
    expect(kitItemUpdateRequest.safeParse(body).success).toBe(true);
  });
});

describe("kitItemIdParam", () => {
  it.each([
    ["1", 1],
    ["42", 42],
    ["9007199254740991", Number.MAX_SAFE_INTEGER],
  ])("parses %s", (text, expected) => {
    expect(kitItemIdParam.parse(text)).toBe(expected);
  });

  it.each([
    ["letters", "abc"],
    ["zero", "0"],
    ["negative", "-1"],
    ["fractional", "1.5"],
    ["a leading zero", "01"],
    ["a plus sign", "+1"],
    ["exponent notation", "1e3"],
    ["hex", "0x10"],
    ["spaces", " 1"],
    ["empty", ""],
    ["2^53", "9007199254740992"],
    ["a very long string", "9".repeat(500)],
  ])("rejects %s", (_name, text) => {
    expect(kitItemIdParam.safeParse(text).success).toBe(false);
  });
});
