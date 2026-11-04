import { describe, expect, it } from "vitest";
import {
  IMPORT_MAX_ROWS,
  IMPORT_PAGE_SIZE,
  IMPORT_SUGGESTIONS,
  acceptDuplicates,
  assignVariant,
  createImportRow,
  earlierVariantKeys,
  kitItemVariantKey,
  matchRow,
  pageCount,
  pageOf,
  rowIssues,
  rowQueries,
  toImportItem,
  variantKey,
} from "@/lib/kit-import";
import type { ImportRow, RowIssueContext, RowMatch } from "@/lib/kit-import";
import type { ParsedRow } from "@/lib/kit-import-csv";
import { buildSearchIndex } from "@/lib/registry-search";
import type { KitItem, RegistryVariant, RegistryVariantTuple } from "@/types";

// Expected values are written by hand from the rules of the S-04 plan (phase 1 and "Critical Implementation
// Details"), none from a run of the code:
//   - queries of a row: "name strength form", "name strength", "name"; empty parts skipped, repeats dropped;
//     none for a row without a name or a malformed one
//   - a row is assigned on its own only when the FIRST query has exactly one hit; every other hit gives
//     suggestions (at most 5), no hit gives "none"; queries under 3 letters/digits are skipped
//   - variant key: lower(name) | lower(strength) | lower(form), null as ""; the strength of a kit item longer than
//     80 characters is cut to its first 79 plus "…" first, as the suggestion list does
//   - blocking reasons (fixed order): no-variant, no-package, invalid-expiry, invalid-quantity, quantity-over-pack,
//     already-have, repeated-in-import; a removed row has none; the first not-removed row of a variant is not a
//     repeat, the second and later ones are; "add" lifts already-have and repeated-in-import
//   - pages of 30 in file order; a removed row keeps its place

function parsedRow(overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    line: 2,
    raw: "",
    name: "Ibuprom",
    strength: null,
    form: null,
    expiry: { kind: "empty" },
    quantity: { kind: "empty" },
    malformed: false,
    ...overrides,
  };
}

function variant(
  id: number,
  name: string,
  strength: string | null = null,
  form: string | null = null,
): RegistryVariant {
  return { id, name, strength, form, commonName: null, substances: [] };
}

function tuple(v: RegistryVariant): RegistryVariantTuple {
  return [v.id, v.name, v.strength, v.form, v.commonName, v.substances];
}

function indexOf(variants: RegistryVariant[]) {
  return buildSearchIndex({ version: 1, snapshotDate: "2026-10-01", variants: variants.map(tuple) });
}

const ibuprom400 = variant(1, "Ibuprom", "400 mg", "tabletki powlekane");
const ibuprom200 = variant(2, "Ibuprom", "200 mg", "tabletki powlekane");
const paracetamol = variant(3, "Paracetamol Hasco", "500 mg", "tabletki");
const rutinoscorbin = variant(4, "Rutinoscorbin");

describe("constants", () => {
  it("has the limits of the plan", () => {
    expect(IMPORT_MAX_ROWS).toBe(200);
    expect(IMPORT_PAGE_SIZE).toBe(30);
    expect(IMPORT_SUGGESTIONS).toBe(5);
  });
});

describe("rowQueries", () => {
  it("builds name+strength+form, name+strength and name", () => {
    expect(rowQueries(parsedRow({ strength: "400 mg", form: "tabletki powlekane" }))).toEqual([
      "Ibuprom 400 mg tabletki powlekane",
      "Ibuprom 400 mg",
      "Ibuprom",
    ]);
  });

  it("skips an empty strength and drops the repeated query", () => {
    expect(rowQueries(parsedRow({ form: "tabletki" }))).toEqual(["Ibuprom tabletki", "Ibuprom"]);
  });

  it("skips an empty form", () => {
    expect(rowQueries(parsedRow({ strength: "400 mg" }))).toEqual(["Ibuprom 400 mg", "Ibuprom"]);
  });

  it("has one query for a name alone", () => {
    expect(rowQueries(parsedRow())).toEqual(["Ibuprom"]);
  });

  it("has none for a row without a name", () => {
    expect(rowQueries(parsedRow({ name: "", strength: "400 mg" }))).toEqual([]);
  });

  it("has none for a malformed row", () => {
    expect(rowQueries(parsedRow({ name: "Ibuprom", malformed: true }))).toEqual([]);
  });
});

describe("matchRow", () => {
  const index = indexOf([ibuprom400, ibuprom200, paracetamol, rutinoscorbin]);

  it("assigns on its own when the first query has exactly one hit", () => {
    // "Ibuprom 400 mg tabletki powlekane": only the 400 mg row has the word 400.
    expect(matchRow(index, ["Ibuprom 400 mg tabletki powlekane", "Ibuprom 400 mg", "Ibuprom"])).toEqual({
      kind: "auto",
      variant: ibuprom400,
    });
  });

  it("assigns on its own for a name alone that is unique", () => {
    expect(matchRow(index, ["Rutinoscorbin"])).toEqual({ kind: "auto", variant: rutinoscorbin });
  });

  it("gives suggestions, not an assignment, for one hit of a fallback query", () => {
    // The form "syrop" matches nothing; "Ibuprom 400 mg" has one hit, but it is the second query.
    expect(matchRow(index, ["Ibuprom 400 mg syrop", "Ibuprom 400 mg", "Ibuprom"])).toEqual({
      kind: "choices",
      variants: [ibuprom400],
      total: 1,
    });
  });

  it("gives suggestions when the first query has several hits, shorter strength first", () => {
    // Same name length and name: the strength order decides, "200 mg" before "400 mg".
    expect(matchRow(index, ["Ibuprom"])).toEqual({ kind: "choices", variants: [ibuprom200, ibuprom400], total: 2 });
  });

  it("stops at the first query that has hits", () => {
    // Both Ibuprom rows match the form; the name-only query (also two hits) is never reached.
    expect(matchRow(index, ["Ibuprom tabletki powlekane", "Ibuprom"])).toEqual({
      kind: "choices",
      variants: [ibuprom200, ibuprom400],
      total: 2,
    });
  });

  it("gives none when no query has a hit", () => {
    expect(matchRow(index, ["Nurofen 400 mg", "Nurofen"])).toEqual({ kind: "none" });
  });

  it("gives none for no queries", () => {
    expect(matchRow(index, [])).toEqual({ kind: "none" });
  });

  it("skips queries shorter than the minimum, so a two-letter name gives none", () => {
    expect(matchRow(index, ["Ib"])).toEqual({ kind: "none" });
  });

  it("limits the suggestions to five and reports the total", () => {
    const apap = [100, 200, 300, 400, 500, 600, 700].map((mg, i) => variant(101 + i, "Apap", `${mg} mg`, "tabletki"));

    const match = matchRow(indexOf(apap), ["Apap"]);

    // Same name, so the strength order decides: 100, 200, 300, 400, 500 mg.
    expect(match).toEqual({ kind: "choices", variants: apap.slice(0, 5), total: 7 });
  });
});

describe("variantKey", () => {
  it("joins lowercase name, strength and form", () => {
    expect(variantKey("Ibuprom", "400 mg", "Tabletki powlekane")).toBe("ibuprom|400 mg|tabletki powlekane");
  });

  it("reads a missing strength and form as empty", () => {
    expect(variantKey("Rutinoscorbin", null, null)).toBe("rutinoscorbin||");
  });

  it("ignores letter case", () => {
    expect(variantKey("IBUPROM", "400 MG", null)).toBe(variantKey("ibuprom", "400 mg", null));
  });

  it("tells strengths and forms apart", () => {
    expect(variantKey("Ibuprom", "400 mg", null)).not.toBe(variantKey("Ibuprom", "200 mg", null));
    expect(variantKey("Ibuprom", null, "tabletki")).not.toBe(variantKey("Ibuprom", null, "syrop"));
  });
});

function kitItem(overrides: Partial<KitItem> = {}): KitItem {
  return {
    id: 1,
    packageId: 10,
    name: "Ibuprom",
    strength: "400 mg",
    form: "tabletki powlekane",
    holder: null,
    units: [],
    quantity: null,
    expiresOn: null,
    expiryPrecision: null,
    withdrawn: false,
    createdAt: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

describe("kitItemVariantKey", () => {
  it("is the key of the variant", () => {
    expect(kitItemVariantKey(kitItem())).toBe("ibuprom|400 mg|tabletki powlekane");
  });

  it("does not depend on the pack, its size or the quantity", () => {
    const small = kitItem({ id: 1, packageId: 10, quantity: 5 });
    const large = kitItem({ id: 2, packageId: 11, quantity: 40 });

    expect(kitItemVariantKey(small)).toBe(kitItemVariantKey(large));
  });

  it("keeps a strength of exactly 80 characters", () => {
    const strength = "a".repeat(80);

    expect(kitItemVariantKey(kitItem({ strength }))).toBe(`ibuprom|${strength}|tabletki powlekane`);
  });

  it("cuts a strength of 81 characters to the first 79 plus an ellipsis, as the suggestion list does", () => {
    const strength = "a".repeat(81);

    expect(kitItemVariantKey(kitItem({ strength }))).toBe(`ibuprom|${"a".repeat(79)}…|tabletki powlekane`);
  });

  it("equals the key of the suggestion-list variant for a long strength", () => {
    // The list holds the strength already cut: 79 characters and "…".
    const listVariant = variant(1, "Ibuprom", `${"b".repeat(79)}…`, "tabletki powlekane");

    const itemKey = kitItemVariantKey(kitItem({ strength: "b".repeat(120) }));

    expect(itemKey).toBe(variantKey(listVariant.name, listVariant.strength, listVariant.form));
  });

  it("reads a missing strength and form as empty", () => {
    expect(kitItemVariantKey(kitItem({ name: "Rutinoscorbin", strength: null, form: null }))).toBe("rutinoscorbin||");
  });
});

/** A ready row: a chosen variant, a pack, no expiry and no quantity. */
function readyRow(overrides: Partial<ImportRow> = {}): ImportRow {
  return { ...createImportRow(parsedRow(), { kind: "none" }), variant: ibuprom400, packageId: 10, ...overrides };
}

function context(overrides: Partial<RowIssueContext> = {}): RowIssueContext {
  return { kitKeys: new Set(), earlierKeys: new Set(), packMax: null, ...overrides };
}

const ibupromKey = "ibuprom|400 mg|tabletki powlekane";

describe("createImportRow", () => {
  it("assigns the variant of an automatic match and copies the parsed expiry and quantity", () => {
    const parsed = parsedRow({ expiry: { kind: "ok", month: 3, year: 2027 }, quantity: { kind: "ok", value: 20 } });

    const row = createImportRow(parsed, { kind: "auto", variant: ibuprom400 });

    expect(row).toEqual({
      parsed,
      match: { kind: "auto", variant: ibuprom400 },
      variant: ibuprom400,
      packageId: null,
      expiry: { kind: "ok", month: 3, year: 2027 },
      quantity: { kind: "ok", value: 20 },
      duplicateDecision: null,
      removed: false,
    });
  });

  it("leaves the variant unset for suggestions and for no match", () => {
    const choices: RowMatch = { kind: "choices", variants: [ibuprom400, ibuprom200], total: 2 };

    expect(createImportRow(parsedRow(), choices).variant).toBeNull();
    expect(createImportRow(parsedRow(), { kind: "none" }).variant).toBeNull();
  });
});

describe("rowIssues", () => {
  it("has none for a ready row", () => {
    expect(rowIssues(readyRow(), context())).toEqual([]);
  });

  it("blocks a row without a variant, and only with that reason", () => {
    expect(rowIssues(readyRow({ variant: null, packageId: null }), context())).toEqual(["no-variant"]);
  });

  it("blocks an assigned variant until a pack is chosen; the automatic assignment itself is no reason", () => {
    const row = createImportRow(parsedRow(), { kind: "auto", variant: ibuprom400 });

    expect(rowIssues(row, context())).toEqual(["no-package"]);
    expect(rowIssues({ ...row, packageId: 10 }, context())).toEqual([]);
  });

  it("blocks an invalid expiry until it is corrected or cleared", () => {
    const invalid = readyRow({ expiry: { kind: "invalid", text: "marzec" } });

    expect(rowIssues(invalid, context())).toEqual(["invalid-expiry"]);
    expect(rowIssues({ ...invalid, expiry: { kind: "empty" } }, context())).toEqual([]);
    expect(rowIssues({ ...invalid, expiry: { kind: "ok", month: 3, year: 2027 } }, context())).toEqual([]);
  });

  it("blocks an invalid quantity until it is corrected or cleared", () => {
    const invalid = readyRow({ quantity: { kind: "invalid", text: "dużo" } });

    expect(rowIssues(invalid, context())).toEqual(["invalid-quantity"]);
    expect(rowIssues({ ...invalid, quantity: { kind: "empty" } }, context())).toEqual([]);
    expect(rowIssues({ ...invalid, quantity: { kind: "ok", value: 3 } }, context())).toEqual([]);
  });

  it("blocks a quantity above the pack size, on both sides of the bound", () => {
    const at = readyRow({ quantity: { kind: "ok", value: 20 } });
    const above = readyRow({ quantity: { kind: "ok", value: 21 } });

    expect(rowIssues(at, context({ packMax: 20 }))).toEqual([]);
    expect(rowIssues(above, context({ packMax: 20 }))).toEqual(["quantity-over-pack"]);
  });

  it("does not bound the quantity of a pack without a cap, nor an empty quantity", () => {
    expect(rowIssues(readyRow({ quantity: { kind: "ok", value: 99999 } }), context({ packMax: null }))).toEqual([]);
    expect(rowIssues(readyRow({ quantity: { kind: "empty" } }), context({ packMax: 20 }))).toEqual([]);
  });

  it("blocks a variant that is already in the kit, whatever the pack size", () => {
    // The kit holds the same variant in another pack; the key does not know the pack.
    const kitKeys = new Set([kitItemVariantKey(kitItem({ packageId: 99, units: [] }))]);

    expect(rowIssues(readyRow({ packageId: 10 }), context({ kitKeys }))).toEqual(["already-have"]);
  });

  it("blocks a variant in the kit whose strength is longer than 80 characters", () => {
    const longStrength = "c".repeat(100);
    const listVariant = variant(1, "Ibuprom", `${"c".repeat(79)}…`, "tabletki powlekane");
    const kitKeys = new Set([kitItemVariantKey(kitItem({ strength: longStrength }))]);

    expect(rowIssues(readyRow({ variant: listVariant }), context({ kitKeys }))).toEqual(["already-have"]);
  });

  it("does not block a variant that differs from the kit's", () => {
    const kitKeys = new Set([kitItemVariantKey(kitItem({ strength: "200 mg" }))]);

    expect(rowIssues(readyRow(), context({ kitKeys }))).toEqual([]);
  });

  it("lifts already-have and repeated-in-import with the decision to add", () => {
    const row = readyRow({ duplicateDecision: ["already-have", "repeated-in-import"] });

    expect(rowIssues(row, context({ kitKeys: new Set([ibupromKey]), earlierKeys: new Set([ibupromKey]) }))).toEqual([]);
  });

  it("blocks a reason that came after the decision to add", () => {
    // The user accepted "already have"; later an earlier row got the same variant.
    const row = readyRow({ duplicateDecision: ["already-have"] });

    expect(rowIssues(row, context({ kitKeys: new Set([ibupromKey]) }))).toEqual([]);
    expect(rowIssues(row, context({ kitKeys: new Set([ibupromKey]), earlierKeys: new Set([ibupromKey]) }))).toEqual([
      "repeated-in-import",
    ]);
  });

  it("records only the duplicate reasons the row has when the user adds anyway", () => {
    const row = readyRow();

    expect(acceptDuplicates(row, ["no-package", "already-have"]).duplicateDecision).toEqual(["already-have"]);
    expect(acceptDuplicates(row, ["already-have", "repeated-in-import"]).duplicateDecision).toEqual([
      "already-have",
      "repeated-in-import",
    ]);
  });

  it("blocks both when the variant is in the kit and earlier in the import", () => {
    expect(
      rowIssues(readyRow(), context({ kitKeys: new Set([ibupromKey]), earlierKeys: new Set([ibupromKey]) })),
    ).toEqual(["already-have", "repeated-in-import"]);
  });

  it("has no reasons for a removed row, whatever is wrong with it", () => {
    const row = readyRow({
      removed: true,
      variant: null,
      packageId: null,
      expiry: { kind: "invalid", text: "x" },
      quantity: { kind: "invalid", text: "y" },
    });

    expect(rowIssues(row, context())).toEqual([]);
  });

  it("lists all reasons in the fixed order", () => {
    const row = readyRow({
      packageId: null,
      expiry: { kind: "invalid", text: "x" },
      quantity: { kind: "invalid", text: "y" },
    });

    expect(rowIssues(row, context({ kitKeys: new Set([ibupromKey]), earlierKeys: new Set([ibupromKey]) }))).toEqual([
      "no-package",
      "invalid-expiry",
      "invalid-quantity",
      "already-have",
      "repeated-in-import",
    ]);
  });
});

describe("repeated in the import", () => {
  function rowOf(v: RegistryVariant | null, overrides: Partial<ImportRow> = {}): ImportRow {
    return readyRow({ variant: v, packageId: v ? 10 : null, ...overrides });
  }

  function issuesOf(rows: ImportRow[]): string[][] {
    const earlier = earlierVariantKeys(rows);
    return rows.map((row, i) => rowIssues(row, context({ earlierKeys: earlier[i] })));
  }

  it("marks the second and later rows of a variant, not the first", () => {
    const rows = [rowOf(ibuprom400), rowOf(paracetamol), rowOf(ibuprom400), rowOf(ibuprom400)];

    expect(issuesOf(rows)).toEqual([[], [], ["repeated-in-import"], ["repeated-in-import"]]);
  });

  it("compares variants by key, not by registry id", () => {
    const sameKeyOtherId = variant(77, "IBUPROM", "400 mg", "Tabletki powlekane");

    expect(issuesOf([rowOf(ibuprom400), rowOf(sameKeyOtherId)])).toEqual([[], ["repeated-in-import"]]);
  });

  it("does not mark a different strength of the same name", () => {
    expect(issuesOf([rowOf(ibuprom400), rowOf(ibuprom200)])).toEqual([[], []]);
  });

  it("lifts the mark of the second row when the first is removed", () => {
    const rows = [rowOf(ibuprom400, { removed: true }), rowOf(ibuprom400), rowOf(ibuprom400)];

    // The second row is now the first not-removed one; the third is still a repeat.
    expect(issuesOf(rows)).toEqual([[], [], ["repeated-in-import"]]);
  });

  it("brings the mark back when the first row is restored", () => {
    const rows = [rowOf(ibuprom400, { removed: false }), rowOf(ibuprom400)];

    expect(issuesOf(rows)).toEqual([[], ["repeated-in-import"]]);
  });

  it("counts rows across pages, in file order", () => {
    const filler = Array.from({ length: IMPORT_PAGE_SIZE }, (_, i) => rowOf(variant(1000 + i, `Lek ${i}`)));
    const rows = [rowOf(ibuprom400), ...filler, rowOf(ibuprom400)];

    // The repeat sits on the second page; the first row is on the first page.
    expect(issuesOf(rows)[rows.length - 1]).toEqual(["repeated-in-import"]);
  });

  it("ignores rows without a variant", () => {
    expect(issuesOf([rowOf(null), rowOf(ibuprom400)])).toEqual([["no-variant"], []]);
  });

  it("clears a decision to add when another variant is assigned", () => {
    const decided = rowOf(ibuprom400, { duplicateDecision: ["already-have"] });

    expect(assignVariant(decided, ibuprom200)).toEqual({
      ...decided,
      variant: ibuprom200,
      packageId: null,
      duplicateDecision: null,
    });
  });
});

describe("pages", () => {
  function rows(count: number): number[] {
    return Array.from({ length: count }, (_, i) => i);
  }

  it("counts pages of 30", () => {
    expect(pageCount(rows(0))).toBe(0);
    expect(pageCount(rows(1))).toBe(1);
    expect(pageCount(rows(30))).toBe(1);
    expect(pageCount(rows(31))).toBe(2);
    expect(pageCount(rows(60))).toBe(2);
    expect(pageCount(rows(61))).toBe(3);
    expect(pageCount(rows(200))).toBe(7);
  });

  it("splits 61 rows into 30, 30 and 1 in file order", () => {
    const all = rows(61);

    expect(pageOf(all, 0)).toEqual(all.slice(0, 30));
    expect(pageOf(all, 1)).toEqual(all.slice(30, 60));
    expect(pageOf(all, 2)).toEqual([60]);
  });

  it("gives an empty page past the end", () => {
    expect(pageOf(rows(61), 3)).toEqual([]);
  });

  it("does not shift the pages when a row is removed", () => {
    const all = Array.from({ length: 61 }, (_, i) => readyRow({ removed: i === 5 }));

    expect(pageCount(all)).toBe(3);
    expect(pageOf(all, 0)).toHaveLength(30);
    expect(pageOf(all, 0)[5].removed).toBe(true);
    expect(pageOf(all, 1)[0]).toBe(all[30]);
  });
});

describe("toImportItem", () => {
  it("takes the pack, quantity and expiry of the row", () => {
    const row = readyRow({
      packageId: 42,
      expiry: { kind: "ok", month: 3, year: 2027 },
      quantity: { kind: "ok", value: 20 },
    });

    expect(toImportItem(row)).toEqual({ packageId: 42, quantity: 20, expiry: { month: 3, year: 2027 } });
  });

  it("sends null for an unknown quantity and expiry", () => {
    expect(toImportItem(readyRow({ packageId: 42 }))).toEqual({ packageId: 42, quantity: null, expiry: null });
  });

  it("keeps a quantity of zero", () => {
    expect(toImportItem(readyRow({ quantity: { kind: "ok", value: 0 } })).quantity).toBe(0);
  });

  it("refuses a row without a pack", () => {
    expect(() => toImportItem(readyRow({ packageId: null }))).toThrow();
  });

  it("refuses a row with an invalid expiry or quantity", () => {
    expect(() => toImportItem(readyRow({ expiry: { kind: "invalid", text: "x" } }))).toThrow();
    expect(() => toImportItem(readyRow({ quantity: { kind: "invalid", text: "x" } }))).toThrow();
  });
});
