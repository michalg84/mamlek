import { describe, expect, it } from "vitest";
import { checkVerdict, emptyPacks, expiredPacks, parseMedicineCheck } from "@/lib/medicine-check-verdict";
import type { MatchLevel, MedicineCheckItem, MedicineCheckResponse } from "@/types";

// Every item without a date is valid on any day; the expiry tests below set their own dates around this one.
const TODAY = "2026-11-18";
const EXPIRED_DATE = "2026-10-31";

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

function response(items: MedicineCheckItem[], comparable = true, level: MatchLevel = "exact"): MedicineCheckResponse {
  return {
    searched: {
      id: 1,
      name: "Sortis",
      strength: "20 mg",
      form: "tabletki powlekane",
      commonName: "Atorvastatinum",
      substances: ["Atorvastatinum calcicum"],
    },
    level,
    comparable,
    items,
  };
}

describe("checkVerdict", () => {
  it("reports the same substance with the caution when the kit holds only a substance match", () => {
    const atoris = item("substance");
    const verdict = checkVerdict(response([atoris]), TODAY);

    expect(verdict.kind).toBe("substance");
    expect(verdict.title).toBe("Masz lek z tą samą substancją czynną");
    expect(verdict.caution).toBe(true);
    expect(verdict.same).toEqual([atoris]);
    expect(verdict.variants).toEqual([]);
  });

  it("names each same-substance medicine once", () => {
    const verdict = checkVerdict(
      response([item("substance"), item("substance"), item("substance", { name: "Tulip" })]),
      TODAY,
    );

    expect(verdict.detail).toBe("Atoris, Tulip");
  });

  it("reports the medicine as owned, without the caution, when the kit holds only that medicine", () => {
    const sortis = item("variant");
    const verdict = checkVerdict(response([sortis]), TODAY);

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
    const verdict = checkVerdict(response(Array.from({ length: count }, () => item("variant"))), TODAY);

    expect(verdict.title).toBe(`Masz ten lek · ${label}`);
  });

  it("keeps the caution when the kit holds the medicine and another one with the same substance", () => {
    const sortis = item("variant");
    const atoris = item("substance");
    const verdict = checkVerdict(response([sortis, atoris]), TODAY);

    expect(verdict.kind).toBe("variant");
    expect(verdict.title).toBe("Masz ten lek · 1 opakowanie");
    expect(verdict.caution).toBe(true);
    expect(verdict.variants).toEqual([sortis]);
    expect(verdict.same).toEqual([atoris]);
  });

  it("says the kit has neither the medicine nor its substance when nothing matched", () => {
    const verdict = checkVerdict(response([]), TODAY);

    expect(verdict.kind).toBe("none");
    expect(verdict.title).toBe("Nie masz tego leku");
    expect(verdict.detail).toBe("Ani leku z tą samą substancją czynną");
    expect(verdict.caution).toBe(false);
    expect(verdict.uncomparable).toBe(false);
  });

  it("makes no claim about the substance when the registry lists none for the medicine", () => {
    const verdict = checkVerdict(response([], false), TODAY);

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
      const verdict = checkVerdict(response(items, comparable), TODAY);

      expect(verdict.kind).not.toBe("none");
      expect(verdict.title).not.toContain("Nie masz");
      expect(verdict.caution).toBe(same > 0);
    },
  );
});

describe("checkVerdict on each match level", () => {
  it.each([
    ["exact", "Masz lek z tą samą substancją czynną", "Ani leku z tą samą substancją czynną"],
    ["all", "Masz lek zawierający składniki tego leku", "Ani leku zawierającego jego składniki"],
    ["any", "Masz lek ze wspólnym składnikiem", "Ani leku z żadnym z jego składników"],
  ] as const)("names the %s level in the substance title and the none line", (level, substanceTitle, noneDetail) => {
    const substance = checkVerdict(response([item("substance")], true, level), TODAY);
    const none = checkVerdict(response([], true, level), TODAY);

    expect(substance).toMatchObject({ kind: "substance", title: substanceTitle, caution: true });
    expect(none).toMatchObject({ kind: "none", title: "Nie masz tego leku", detail: noneDetail });
  });

  it.each(["all", "any"] as const)("keeps the variant title on the %s level", (level) => {
    expect(checkVerdict(response([item("variant"), item("substance")], true, level), TODAY).title).toBe(
      "Masz ten lek · 1 opakowanie",
    );
  });

  it.each(["all", "any"] as const)("makes no claim on the %s level when the medicine cannot be compared", (level) => {
    expect(checkVerdict(response([], false, level), TODAY).detail).toBeNull();
  });
});

describe("empty packs", () => {
  it("does not count a pack with quantity 0: only empty packs give „nie masz”", () => {
    const empty = [item("variant", { quantity: 0 }), item("substance", { quantity: 0 })];
    const result = response(empty);
    const verdict = checkVerdict(result, TODAY);

    expect(verdict.kind).toBe("none");
    expect(verdict.title).toBe("Nie masz tego leku");
    expect(verdict.variants).toEqual([]);
    expect(verdict.same).toEqual([]);
    expect(emptyPacks(result)).toEqual(empty);
  });

  it("counts only the packs with something left, or an unknown quantity", () => {
    const left = item("variant", { quantity: 3 });
    const unknown = item("variant", { quantity: null });
    const empty = item("variant", { quantity: 0 });
    const emptySame = item("substance", { quantity: 0 });
    const result = response([left, empty, unknown, emptySame]);
    const verdict = checkVerdict(result, TODAY);

    expect(verdict.kind).toBe("variant");
    expect(verdict.title).toBe("Masz ten lek · 2 opakowania");
    expect(verdict.variants).toEqual([left, unknown]);
    expect(verdict.caution).toBe(false);
    expect(emptyPacks(result)).toEqual([empty, emptySame]);
  });

  it("keeps the caution for a same-substance pack with something left next to an empty one of the medicine", () => {
    const verdict = checkVerdict(
      response([item("variant", { quantity: 0 }), item("substance", { quantity: 1 })]),
      TODAY,
    );

    expect(verdict.kind).toBe("substance");
    expect(verdict.caution).toBe(true);
  });

  it("lists no empty packs when every pack has something left or an unknown quantity", () => {
    expect(emptyPacks(response([item("variant", { quantity: 1 }), item("substance")]))).toEqual([]);
  });
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
    ["an unknown level", { ...valid, level: "ALL" }],
    ["an empty level", { ...valid, level: "" }],
    ["a level that is not a string", { ...valid, level: 2 }],
    ["a null level", { ...valid, level: null }],
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

  it.each(["exact", "all", "any"] as const)("keeps the %s level of the answer", (level) => {
    const body = response([atoris], true, level);

    expect(parseMedicineCheck(body)).toEqual(body);
  });

  it("reads an answer without a level (a database before match levels) as exact", () => {
    const { level: _level, ...old } = valid;

    expect(parseMedicineCheck(old)).toEqual({ ...valid, level: "exact" });
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

describe("checkVerdict and expiry dates", () => {
  // Relative to TODAY (18.11.2026): the warning covers 11/2026 and 12/2026.
  const LONG_EXPIRED = "2026-08-31";
  const EXPIRED = "2026-10-31";
  const ENDS_THIS_MONTH = "2026-11-30";
  const ENDS_NEXT_MONTH = "2026-12-31";
  const VALID = "2027-06-30";

  function dated(
    match: MedicineCheckItem["match"],
    expiresOn: string | null,
    overrides: Partial<MedicineCheckItem> = {},
  ) {
    return item(match, { expiresOn, expiryPrecision: expiresOn === null ? null : "month", ...overrides });
  }

  it("says the medicine is owned but expired when every pack of it is past its date, naming the latest date", () => {
    const older = dated("variant", LONG_EXPIRED);
    const newer = dated("variant", EXPIRED);
    const verdict = checkVerdict(response([older, newer]), TODAY);

    expect(verdict.kind).toBe("expired");
    expect(verdict.title).toBe("Masz ten lek, ale przeterminowany");
    expect(verdict.detail).toBe("Termin ważności minął: 10/2026");
    expect(verdict.variants).toEqual([older, newer]);
    expect(verdict.caution).toBe(false);
  });

  it("names a day-precision date in full", () => {
    const verdict = checkVerdict(response([dated("variant", "2026-11-10", { expiryPrecision: "day" })]), TODAY);

    expect(verdict.detail).toBe("Termin ważności minął: 10.11.2026");
  });

  it("counts only the packs still valid when some are expired, and lists the expired ones last", () => {
    const expiredFirst = dated("variant", LONG_EXPIRED);
    const valid = dated("variant", VALID);
    const expiredSecond = dated("variant", EXPIRED);
    const unknown = dated("variant", null);
    const verdict = checkVerdict(response([expiredFirst, valid, expiredSecond, unknown]), TODAY);

    expect(verdict.kind).toBe("variant");
    expect(verdict.title).toBe("Masz ten lek · 2 opakowania");
    expect(verdict.detail).toBeNull();
    expect(verdict.variants).toEqual([valid, unknown, expiredFirst, expiredSecond]);
  });

  it("warns with the latest date when every pack still valid ends this month or the next", () => {
    const verdict = checkVerdict(
      response([dated("variant", ENDS_THIS_MONTH), dated("variant", ENDS_NEXT_MONTH), dated("variant", EXPIRED)]),
      TODAY,
    );

    expect(verdict.kind).toBe("variant");
    expect(verdict.title).toBe("Masz ten lek · 2 opakowania");
    expect(verdict.detail).toBe("Ważność kończy się 12/2026");
  });

  it.each([
    ["a later date", VALID],
    ["an unknown date", null],
  ])("does not warn when another pack still valid has %s", (_label, other) => {
    const verdict = checkVerdict(response([dated("variant", ENDS_THIS_MONTH), dated("variant", other)]), TODAY);

    expect(verdict.detail).toBeNull();
  });

  it("keeps the expired verdict and the caution when only a same-substance pack is valid", () => {
    const sortis = dated("variant", EXPIRED);
    const atoris = dated("substance", VALID);
    const verdict = checkVerdict(response([sortis, atoris]), TODAY);

    expect(verdict.kind).toBe("expired");
    expect(verdict.variants).toEqual([sortis]);
    expect(verdict.same).toEqual([atoris]);
    expect(verdict.caution).toBe(true);
  });

  it("keeps the substance title and says when every same-substance pack is expired", () => {
    const first = dated("substance", EXPIRED);
    const second = dated("substance", LONG_EXPIRED, { name: "Tulip" });
    const verdict = checkVerdict(response([first, second]), TODAY);

    expect(verdict.kind).toBe("substance");
    expect(verdict.title).toBe("Masz lek z tą samą substancją czynną");
    expect(verdict.detail).toBe("Atoris, Tulip · wszystkie przeterminowane");
    expect(verdict.same).toEqual([first, second]);
    expect(verdict.caution).toBe(true);
  });

  it("says when every same-substance pack ends this month or the next", () => {
    const verdict = checkVerdict(
      response([dated("substance", ENDS_NEXT_MONTH), dated("substance", ENDS_THIS_MONTH)]),
      TODAY,
    );

    expect(verdict.detail).toBe("Atoris · ważność kończy się 12/2026");
  });

  it.each([
    ["an expired and a valid pack", [EXPIRED, VALID]],
    ["an ending and an unknown date", [ENDS_THIS_MONTH, null]],
    ["an expired and an ending pack", [EXPIRED, ENDS_THIS_MONTH]],
  ])("adds nothing to the substance names for %s", (_label, dates) => {
    const items = dates.map((date) => dated("substance", date));
    const verdict = checkVerdict(response(items), TODAY);

    expect(verdict.detail).toBe("Atoris");
  });

  it("lists the same-substance packs still valid before the expired ones", () => {
    const expired = dated("substance", EXPIRED);
    const valid = dated("substance", VALID);

    expect(checkVerdict(response([expired, valid]), TODAY).same).toEqual([valid, expired]);
  });

  it("leaves empty packs out whatever their date", () => {
    const emptyExpired = dated("variant", EXPIRED, { quantity: 0 });
    const valid = dated("variant", VALID, { quantity: 2 });
    const result = response([emptyExpired, valid]);
    const verdict = checkVerdict(result, TODAY);

    expect(verdict.kind).toBe("variant");
    expect(verdict.title).toBe("Masz ten lek · 1 opakowanie");
    expect(verdict.variants).toEqual([valid]);
    expect(expiredPacks(result, TODAY)).toEqual([]);
    expect(checkVerdict(response([emptyExpired]), TODAY).kind).toBe("none");
  });

  it("does not call a pack expired on its last day", () => {
    expect(checkVerdict(response([dated("variant", TODAY)]), TODAY)).toMatchObject({
      kind: "variant",
      detail: "Ważność kończy się 11/2026",
    });
  });
});

describe("expiredPacks", () => {
  it("lists the expired packs with something left, of both match types, in the order of the RPC", () => {
    const sortis = item("variant", { expiresOn: EXPIRED_DATE, expiryPrecision: "month" });
    const valid = item("variant", { expiresOn: "2027-06-30", expiryPrecision: "month" });
    const atoris = item("substance", { expiresOn: EXPIRED_DATE, expiryPrecision: "month", quantity: 4 });
    const empty = item("substance", { expiresOn: EXPIRED_DATE, expiryPrecision: "month", quantity: 0 });
    const unknown = item("substance");

    expect(expiredPacks(response([sortis, valid, atoris, empty, unknown]), TODAY)).toEqual([sortis, atoris]);
  });
});
