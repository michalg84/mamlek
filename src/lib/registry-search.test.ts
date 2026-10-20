import { describe, expect, it } from "vitest";
import { buildSearchIndex, isQueryLongEnough, searchVariants } from "@/lib/registry-search";
import type { RegistrySearchListPayload } from "@/types";
import { ID, registrySearchList } from "../../tests/fixtures/registry-search-list";

// Every expected value below is derived by hand from the agreed matching rule of S-01
// (context/archive/2026-10-02-registry-search-suggestions/plan.md:46-57, R1-R7 in this change's research),
// applied to the rows of tests/fixtures/registry-search-list.ts. None is copied from a run of the code.
//
//   R1  lowercase, strip diacritics, ł -> l; words are runs of [a-z0-9]
//   R2  fewer than 3 letters/digits in the query (separators not counted) -> no list
//   R3  the first query word picks the level, first matching level wins:
//       A first word of the name, B another word of the name, C word of the common name, D word of a substance
//   R4  every further query word must start a word of that level's field, or of strength/form; otherwise the
//       variant falls to the next level
//   R5  order: level, then shorter name (characters), then Polish name order, then strength order, then id
//   R6  at most `limit` (default 20) results; `total` counts all matches
//   R7  prefix only, no typo tolerance

const index = buildSearchIndex(registrySearchList);

function search(query: string, limit?: number) {
  const { results, total } = searchVariants(index, query, limit);
  return { ids: results.map((variant) => variant.id), total };
}

describe("searchVariants", () => {
  // R3 + FR-002: a product name beats the common name, which beats an active substance. The level-A row has the
  // longest name of the three, so only the level (not the name length) can put it first.
  it.each([["paracetamol", [ID.paracetamolInName, ID.paracetamolInCommonName, ID.paracetamolInSubstance]]])(
    "ranks name, then common name, then substance for „%s”",
    (query, expected) => {
      expect(search(query)).toEqual({ ids: expected, total: expected.length });
    },
  );

  // R3: the first word of a name (level A) beats a later word (level B) even when the level-A name is longer.
  // "Maxigra Go" (10 chars) is A, "Ibum Max" (8) and "Ibuprom Max" (11) are B; inside B the shorter name leads (R5).
  it.each([["max", [ID.maxigraGo, ID.ibumMax, ID.ibupromMax400]]])(
    "puts a first-word match before a later-word match for „%s”",
    (query, expected) => {
      expect(search(query)).toEqual({ ids: expected, total: expected.length });
    },
  );

  // R4: a further query word narrows by strength.
  it.each([
    // "400" starts a word of the strength "400 mg" of rows ibuprom400 and ibupromMax400, not of "200 mg".
    // Order inside level A: the 7-character name first (R5), then "Ibuprom Max".
    ["ibuprom 400", [ID.ibuprom400, ID.ibupromMax400]],
    ["ibuprom 200", [ID.ibuprom200]],
    // "max" starts the second name word of "Ibuprom Max" only.
    ["ibuprom max", [ID.ibupromMax400]],
  ])("narrows „%s” by strength or a further name word", (query, expected) => {
    expect(search(query)).toEqual({ ids: expected, total: expected.length });
  });

  // R4: a further query word narrows by form (same name and strength, two forms).
  it.each([
    ["no spa tabletki", [ID.noSpaTablet]],
    // "roztwor" is the diacritic-free form of "roztwór" in the injection's form (R1).
    ["no spa roztwor", [ID.noSpaInjection]],
    ["no spa roztwór", [ID.noSpaInjection]],
    // "40" starts the strength of both rows.
    ["no spa 40", [ID.noSpaInjection, ID.noSpaTablet]],
  ])("narrows „%s” by form", (query, expected) => {
    expect(search(query)).toEqual({ ids: expected, total: expected.length });
  });

  // Variants do not vanish: the same name with different strength or form returns every variant, each separately.
  it.each([
    // Three variants; two share the name "Ibuprom".
    ["ibuprom", 3],
    // Two variants with the same name and strength.
    ["no spa", 2],
  ])("keeps every variant of „%s”", (query, count) => {
    const { results, total } = searchVariants(index, query);

    expect(total).not.toBe(count);
    expect(results).toHaveLength(count);
    expect(new Set(results.map((variant) => variant.id)).size).toBe(count);
  });

  // R4: when a further query word does not fit the name, the variant falls to the next level.
  // "magne lactas": "Magne Lactas Complex" is level A (first name word "magne", "lactas" is a name word).
  // "Magne B6" fails A ("lactas" is neither a name word nor in strength or form), has no later name word
  // starting "magne" (B), and matches level C ("magne" starts the common-name word "magnesii", "lactas" is a word of it).
  // Level C goes after A although its name is shorter (8 vs 20 characters).
  it.each([["magne lactas", [ID.magneLactasComplex, ID.magneB6]]])(
    "moves a variant to the next level for „%s”",
    (query, expected) => {
      expect(search(query)).toEqual({ ids: expected, total: expected.length });
    },
  );

  // R1: diacritics and ł are ignored, in the query and in the data.
  it.each([
    // form "żel" normalizes to "zel"
    ["altacet zel", [ID.altacetGel]],
    ["altacet żel", [ID.altacetGel]],
    ["ALTACET ŻEL", [ID.altacetGel]],
    // name "Płyn" normalizes to "plyn" (ł -> l)
    ["plyn", [ID.plynLugola]],
    ["płyn", [ID.plynLugola]],
    ["PŁYN lugola", [ID.plynLugola]],
  ])("ignores diacritics for „%s”", (query, expected) => {
    expect(search(query)).toEqual({ ids: expected, total: expected.length });
  });

  // R1: case and surrounding or repeated spaces do not change the result.
  it.each([
    ["ibuprom max", [ID.ibupromMax400]],
    ["IBUPROM MAX", [ID.ibupromMax400]],
    ["  Ibuprom   Max  ", [ID.ibupromMax400]],
    // same as plain "ibuprom" (R5 order: 200 mg, 400 mg, then the longer name)
    ["  ibuprom  ", [ID.ibuprom200, ID.ibuprom400, ID.ibupromMax400]],
  ])("ignores case and spaces for „%s”", (query, expected) => {
    expect(search(query)).toEqual({ ids: expected, total: expected.length });
  });

  // R2: fewer than 3 letters/digits give nothing, separators are not counted; exactly 3 or more search.
  it.each([
    ["ib", []],
    ["no", []],
    ["i b", []],
    ["  ib  ", []],
    ["", []],
    // "no spa" has 5 letters across two words
    ["no spa", [ID.noSpaInjection, ID.noSpaTablet]],
  ])("applies the minimum length to „%s”", (query, expected) => {
    expect(search(query)).toEqual({ ids: expected, total: expected.length });
  });

  // R3 + R7: only a prefix of a word matches, and a typo does not.
  it.each([
    // "prom" is the end of "Ibuprom", not the start of any word
    ["prom"],
    // "ibupom" is a typo of "ibuprom" and starts no word
    ["ibupom"],
    ["buprom"],
    // not a prefix of "paracetamol"
    ["racetamol"],
  ])("finds nothing for „%s”", (query) => {
    expect(search(query)).toEqual({ ids: [], total: 0 });
  });

  // R5: order inside one level. All Gripex rows are level A for "gripex" (first name word).
  //   1. shorter name first: "Gripex" (6 chars) before everything
  //   2. equal length (8 chars: "Gripex A", "Gripex Ą", "Gripex B"): Polish order a < ą < b
  //   3. the longer "Gripex Aktiv" (12 chars) comes last although "Gripex Aktiv" sorts before "Gripex B" alphabetically
  // Ids are in reverse order, so they do not decide anything here.
  it("orders one level by name length, then by Polish name order", () => {
    expect(search("gripex")).toEqual({
      ids: [ID.gripex, ID.gripexA, ID.gripexAOgonek, ID.gripexB, ID.gripexAktiv],
      total: 5,
    });
  });

  // R5: same name, strengths with the same number of digits (200 mg, 400 mg): the strength decides, not the id
  // (the 400 mg row has the lower id). Strengths with different digit counts are deliberately not compared.
  it("orders the same name by strength", () => {
    expect(search("ibuprom").ids.slice(0, 2)).toEqual([ID.ibuprom200, ID.ibuprom400]);
  });

  // R5: same name and strength: the id decides (the injection has the lower id, the form is not a sort key).
  it("orders the same name and strength by id", () => {
    expect(search("no spa").ids).toEqual([ID.noSpaInjection, ID.noSpaTablet]);
  });

  // R6: at most `limit` results, `total` still counts every match, and the best-ranked rows are kept.
  it.each([
    // 3 matches in total (A, C, D); limit 1 keeps the level-A row
    ["paracetamol", 1, [ID.paracetamolInName], 3],
    // 3 matches in total (A, B, B); limit 2 keeps the A row and the shorter B row
    ["max", 2, [ID.maxigraGo, ID.ibumMax], 3],
    // 5 matches in total; limit 3 keeps the first three in R5 order
    ["gripex", 3, [ID.gripex, ID.gripexA, ID.gripexAOgonek], 5],
    // limit equal to the matches changes nothing
    ["ibuprom", 3, [ID.ibuprom200, ID.ibuprom400, ID.ibupromMax400], 3],
  ])("caps „%s” at limit %i and still reports the total", (query, limit, expected, total) => {
    expect(search(query, limit)).toEqual({ ids: expected, total });
  });

  // Missing fields: null strength, form and common name and an empty substance list match by name without throwing.
  it("matches a variant whose optional fields are all missing", () => {
    expect(() => search("rutinoscorbin")).not.toThrow();
    expect(search("rutinoscorbin")).toEqual({ ids: [ID.rutinoscorbin], total: 1 });
  });

  it("returns the variant unchanged, with nulls and empty substances", () => {
    const [variant] = searchVariants(index, "rutino").results;

    expect(variant).toEqual({
      id: ID.rutinoscorbin,
      name: "Rutinoscorbin",
      strength: null,
      form: null,
      commonName: null,
      substances: [],
    });
  });

  it("handles an empty list", () => {
    const empty: RegistrySearchListPayload = { version: 1, snapshotDate: "2026-10-01", variants: [] };

    expect(searchVariants(buildSearchIndex(empty), "ibuprom")).toEqual({ results: [], total: 0 });
  });
});

describe("isQueryLongEnough", () => {
  // R2: letters and digits of the normalized query are counted, separators are not.
  it.each([
    ["ibu", true],
    ["no spa", true],
    ["i-b-u", true],
    ["żel", true],
    ["400", true],
    ["ib", false],
    ["i b", false],
    ["  ib  ", false],
    ["ł", false],
    ["--- ---", false],
    ["", false],
  ])("says %j is long enough: %s", (query, expected) => {
    expect(isQueryLongEnough(query)).toBe(expected);
  });
});
