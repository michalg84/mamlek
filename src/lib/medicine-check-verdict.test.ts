import { describe, expect, it } from "vitest";
import { checkVerdict, parseMedicineCheck } from "@/lib/medicine-check-verdict";
import type { MedicineCheckItem, MedicineCheckResponse } from "@/types";

let nextId = 1;

function item(match: MedicineCheckItem["match"], overrides: Partial<MedicineCheckItem> = {}): MedicineCheckItem {
  const id = nextId++;
  return {
    id,
    packageId: 1000 + id,
    match,
    matchedBy: match === "substance" ? "common_name" : null,
    name: match === "variant" ? "Sortis" : "Atoris",
    strength: "20 mg",
    form: "tabletki powlekane",
    holder: null,
    commonName: "Atorvastatinum",
    substances: ["Atorvastatinum calcicum"],
    units: [],
    quantity: null,
    expiresOn: null,
    expiryPrecision: null,
    withdrawn: false,
    createdAt: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

function response(items: MedicineCheckItem[], comparable = true): MedicineCheckResponse {
  return {
    searched: {
      id: 1,
      name: "Sortis",
      strength: "20 mg",
      form: "tabletki powlekane",
      commonName: "Atorvastatinum",
      substances: ["Atorvastatinum calcicum"],
    },
    comparable,
    items,
  };
}

describe("checkVerdict", () => {
  it("reports the same substance with the caution when the kit holds only a substance match", () => {
    const atoris = item("substance");
    const verdict = checkVerdict(response([atoris]));

    expect(verdict.kind).toBe("substance");
    expect(verdict.title).toBe("Masz lek z tą samą substancją czynną");
    expect(verdict.caution).toBe(true);
    expect(verdict.same).toEqual([atoris]);
    expect(verdict.variants).toEqual([]);
  });

  it("names each same-substance medicine once", () => {
    const verdict = checkVerdict(
      response([item("substance"), item("substance"), item("substance", { name: "Tulip" })]),
    );

    expect(verdict.detail).toBe("Atoris, Tulip");
  });

  it("reports the medicine as owned, without the caution, when the kit holds only that medicine", () => {
    const sortis = item("variant");
    const verdict = checkVerdict(response([sortis]));

    expect(verdict.kind).toBe("variant");
    expect(verdict.title).toBe("Masz ten lek · 1 opakowanie");
    expect(verdict.detail).toBeNull();
    expect(verdict.caution).toBe(false);
    expect(verdict.uncomparable).toBe(false);
    expect(verdict.variants).toEqual([sortis]);
  });

  it.each([
    [1, "1 opakowanie"],
    [2, "2 opakowania"],
    [5, "5 opakowań"],
    [12, "12 opakowań"],
    [22, "22 opakowania"],
  ])("counts %i owned pack(s) as „%s”", (count, label) => {
    const verdict = checkVerdict(response(Array.from({ length: count }, () => item("variant"))));

    expect(verdict.title).toBe(`Masz ten lek · ${label}`);
  });

  it("keeps the caution when the kit holds the medicine and another one with the same substance", () => {
    const sortis = item("variant");
    const atoris = item("substance");
    const verdict = checkVerdict(response([sortis, atoris]));

    expect(verdict.kind).toBe("variant");
    expect(verdict.title).toBe("Masz ten lek · 1 opakowanie");
    expect(verdict.caution).toBe(true);
    expect(verdict.variants).toEqual([sortis]);
    expect(verdict.same).toEqual([atoris]);
  });

  it("says the kit has neither the medicine nor its substance when nothing matched", () => {
    const verdict = checkVerdict(response([]));

    expect(verdict.kind).toBe("none");
    expect(verdict.title).toBe("Nie masz tego leku");
    expect(verdict.detail).toBe("Ani leku z tą samą substancją czynną");
    expect(verdict.caution).toBe(false);
    expect(verdict.uncomparable).toBe(false);
  });

  it("makes no claim about the substance when the registry lists none for the medicine", () => {
    const verdict = checkVerdict(response([], false));

    expect(verdict.kind).toBe("none");
    expect(verdict.title).toBe("Nie masz tego leku");
    expect(verdict.detail).toBeNull();
    expect(verdict.uncomparable).toBe(true);
  });

  const matchCounts = [0, 1, 2].flatMap((variants) => [0, 1, 2].map((same) => ({ variants, same })));
  const withAMatch = matchCounts
    .filter(({ variants, same }) => variants + same > 0)
    .flatMap((counts) => [true, false].map((comparable) => ({ ...counts, comparable })));

  it.each(withAMatch)(
    "never says „nie masz” with $variants variant and $same substance match(es), comparable: $comparable",
    ({ variants, same, comparable }) => {
      const items = [
        ...Array.from({ length: variants }, () => item("variant")),
        ...Array.from({ length: same }, () => item("substance")),
      ];
      const verdict = checkVerdict(response(items, comparable));

      expect(verdict.kind).not.toBe("none");
      expect(verdict.title).not.toContain("Nie masz");
      expect(verdict.caution).toBe(same > 0);
    },
  );
});

describe("parseMedicineCheck", () => {
  const sortis = item("variant");
  const atoris = item("substance");
  const valid = response([sortis, atoris]);

  it.each([
    ["an item with an unknown match type", { ...valid, items: [sortis, { ...atoris, match: "ingredient" }] }],
    ["a body without items", { searched: valid.searched, comparable: true }],
    ["items that are not a list", { ...valid, items: { 0: sortis } }],
    ["an item without substances", { ...valid, items: [{ ...sortis, substances: undefined }] }],
    ["a searched medicine without substances", { ...valid, searched: { ...valid.searched, substances: undefined } }],
    ["an item whose expiry date is a number", { ...valid, items: [{ ...sortis, expiresOn: 20271231 }] }],
    ["an item whose pack units are not objects", { ...valid, items: [{ ...sortis, units: ["30 tabl."] }] }],
    ["a body without the comparable flag", { searched: valid.searched, items: [] }],
    ["null", null],
    ["an empty object", {}],
  ])("rejects %s", (_label, body) => {
    expect(parseMedicineCheck(body)).toBeNull();
  });

  it("accepts an answer with no matching items", () => {
    const body = response([]);

    expect(parseMedicineCheck(body)).toEqual(body);
  });

  it("returns an answer with both match types unchanged", () => {
    expect(parseMedicineCheck(valid)).toEqual(valid);
  });

  it("accepts an item whose optional fields are empty", () => {
    const bare = item("substance", { strength: null, form: null, commonName: null, quantity: null, holder: null });
    const body = response([bare]);

    expect(parseMedicineCheck(body)).toEqual(body);
  });

  it("accepts an item with a pack description and an expiry date", () => {
    const dated = item("variant", {
      units: [{ count: "30", kind: "tabl.", capacity: null, capacity_unit: null, info: null }],
      quantity: 12,
      expiresOn: "2099-12-31",
      expiryPrecision: "month",
    });
    const body = response([dated]);

    expect(parseMedicineCheck(body)).toEqual(body);
  });
});
