import { describe, expect, it } from "vitest";
import { plural } from "@/lib/plural";

// Expected forms taken from Polish grammar ("1 lek", "2 leki", "5 leków", "12 leków", "22 leki"), not from the code.
const form = (count: number) => plural(count, "lek", "leki", "leków");

describe("plural", () => {
  it("uses the singular for exactly one", () => {
    expect(form(1)).toBe("lek");
  });

  it("uses the 'few' form for 2–4 and for 22–24, 102–104", () => {
    expect([2, 3, 4, 22, 23, 24, 102, 104].map(form)).toEqual(Array(8).fill("leki"));
  });

  it("uses the 'many' form for 0, 5–21 (12–14 included), 25 and 111", () => {
    expect([0, 5, 11, 12, 13, 14, 21, 25, 111, 200].map(form)).toEqual(Array(10).fill("leków"));
  });
});
