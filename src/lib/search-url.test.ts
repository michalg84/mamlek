import { describe, expect, it } from "vitest";
import { addToKitHref, parseSearchState, substanceHref, variantHref } from "@/lib/search-url";

function parse(query: string) {
  return parseSearchState(new URLSearchParams(query));
}

describe("parseSearchState", () => {
  it("reads a variant id made of digits only", () => {
    expect(parse("lek=12")).toEqual({ variantId: 12, substance: null });
    expect(parse("lek=9007199254740991")).toEqual({ variantId: 9007199254740991, substance: null });
  });

  it.each(["12a", "-1", "", " 12", "1.5", "1e3", "0x10", "9007199254740992", "9".repeat(400)])(
    "ignores the invalid variant id %j",
    (lek) => {
      expect(parse(`lek=${encodeURIComponent(lek)}`)).toEqual({ variantId: null, substance: null });
    },
  );

  it("reads a substance and trims it", () => {
    expect(parse("substancja=Ibuprofenum")).toEqual({ variantId: null, substance: "Ibuprofenum" });
    expect(parse("substancja=%20%20Ibuprofenum%20")).toEqual({ variantId: null, substance: "Ibuprofenum" });
  });

  it("decodes Polish letters and a plus sign in the substance", () => {
    expect(parse("substancja=%C5%81%C4%85ka")).toEqual({ variantId: null, substance: "Łąka" });
    expect(parse("substancja=Paracetamolum%20%2B%20Coffeinum")).toEqual({
      variantId: null,
      substance: "Paracetamolum + Coffeinum",
    });
  });

  it("ignores an empty or blank substance", () => {
    expect(parse("substancja=")).toEqual({ variantId: null, substance: null });
    expect(parse("substancja=%20%20")).toEqual({ variantId: null, substance: null });
  });

  it("accepts a substance of 200 characters and ignores one of 201", () => {
    expect(parse(`substancja=${"a".repeat(200)}`)).toEqual({ variantId: null, substance: "a".repeat(200) });
    expect(parse(`substancja=${"a".repeat(201)}`)).toEqual({ variantId: null, substance: null });
  });

  it("lets the variant win when both parameters are given", () => {
    expect(parse("lek=5&substancja=Ibuprofenum")).toEqual({ variantId: 5, substance: null });
    expect(parse("substancja=Ibuprofenum&lek=5")).toEqual({ variantId: 5, substance: null });
  });

  it("falls back to the substance when the variant id is invalid", () => {
    expect(parse("lek=abc&substancja=Ibuprofenum")).toEqual({ variantId: null, substance: "Ibuprofenum" });
  });

  it("gives nothing for an address without parameters", () => {
    expect(parse("")).toEqual({ variantId: null, substance: null });
  });
});

describe("addresses", () => {
  it("builds the substance address with the name encoded", () => {
    expect(substanceHref("Ibuprofenum")).toBe("/szukaj?substancja=Ibuprofenum");
    expect(substanceHref("Paracetamolum + Coffeinum")).toBe("/szukaj?substancja=Paracetamolum%20%2B%20Coffeinum");
    expect(substanceHref("Łąka")).toBe("/szukaj?substancja=%C5%81%C4%85ka");
  });

  it("builds the variant address", () => {
    expect(variantHref(42)).toBe("/szukaj?lek=42");
  });

  it("builds the add-to-kit address with the hash of the add heading", () => {
    expect(addToKitHref(42)).toBe("/apteczka?lek=42#add-heading");
  });

  it("reads back the substance it wrote", () => {
    const written = substanceHref("Paracetamolum + Coffeinum (1:1)");
    const query = written.slice(written.indexOf("?") + 1);
    expect(parse(query)).toEqual({ variantId: null, substance: "Paracetamolum + Coffeinum (1:1)" });
  });
});
