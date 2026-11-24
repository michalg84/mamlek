import { describe, expect, it } from "vitest";
import {
  buildSearchIndex,
  findVariant,
  isQueryLongEnough,
  searchVariants,
  variantsWithSubstance,
} from "@/lib/registry-search";
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
//   R5  order: level, then shorter name (characters), then Polish name order, then strength order, then id;
//       strength order (S-11) is numeric: parseable strengths first, grouped by unit signature, then by their
//       numbers (mass converted to mg), unparseable or empty strengths last in Polish text order
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

    expect(total).toBe(count);
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

  // R5: same name, strengths 200 mg and 400 mg: the strength decides, not the id (the 400 mg row has the lower id).
  // Numeric strength order across digit counts, units and shapes is covered by the strength-order block below.
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
      // A six-element tuple (no 7th element) is an active variant.
      withdrawn: false,
    });
  });

  it("handles an empty list", () => {
    const empty: RegistrySearchListPayload = { version: 1, snapshotDate: "2026-10-01", variants: [] };

    expect(searchVariants(buildSearchIndex(empty), "ibuprom")).toEqual({ results: [], total: 0 });
  });
});

// A variant withdrawn from the registry as a whole carries a 7th tuple element `true` (phase 1 migration). Agreed
// rule (context/changes/withdrawn-medicine-in-kit/plan.md): inside one level every active variant comes before every
// withdrawn one; the level still comes first, and R5 orders each group. Expected values are derived by hand from the
// rows below.
describe("searchVariants with withdrawn variants", () => {
  const WITHDRAWN_ID = {
    // Level A for "crestor", the shortest name and the exact query, but withdrawn.
    crestor: 100,
    // Level A for "crestor", active, longer names (12 and 13 characters).
    crestorMite: 101,
    crestorForte: 102,
    // Level B for "crestor" (second name word), active.
    rosuCrestor: 103,
  } as const;

  const withdrawnList: RegistrySearchListPayload = {
    version: 1,
    snapshotDate: "2026-11-16",
    variants: [
      [WITHDRAWN_ID.crestor, "Crestor", "10 mg", "tabletki powlekane", "Rosuvastatinum", ["Rosuvastatinum"], true],
      [WITHDRAWN_ID.crestorMite, "Crestor Mite", "5 mg", "tabletki powlekane", "Rosuvastatinum", ["Rosuvastatinum"]],
      [WITHDRAWN_ID.crestorForte, "Crestor Forte", "40 mg", "tabletki powlekane", "Rosuvastatinum", ["Rosuvastatinum"]],
      [WITHDRAWN_ID.rosuCrestor, "Rosu Crestor", "20 mg", "tabletki powlekane", "Rosuvastatinum", ["Rosuvastatinum"]],
    ],
  };
  const withdrawnIndex = buildSearchIndex(withdrawnList);

  function searchWithdrawn(query: string, limit?: number) {
    const { results, total } = searchVariants(withdrawnIndex, query, limit);
    return { ids: results.map((variant) => variant.id), total };
  }

  // "Crestor" (7 characters) would lead level A by R5, but it is withdrawn, so both active level-A rows go first.
  it("puts a withdrawn variant with a shorter, exactly matching name after the active variants of its level", () => {
    expect(searchWithdrawn("crestor").ids.slice(0, 3)).toEqual([
      WITHDRAWN_ID.crestorMite,
      WITHDRAWN_ID.crestorForte,
      WITHDRAWN_ID.crestor,
    ]);
  });

  // Withdrawal only reorders inside a level: the withdrawn level-A row still beats the active level-B row.
  it("keeps a withdrawn variant of level A before an active variant of level B", () => {
    expect(searchWithdrawn("crestor")).toEqual({
      ids: [WITHDRAWN_ID.crestorMite, WITHDRAWN_ID.crestorForte, WITHDRAWN_ID.crestor, WITHDRAWN_ID.rosuCrestor],
      total: 4,
    });
  });

  // R6 with the rule: the limit drops the withdrawn row of a level before any active row of that level.
  it.each([
    [1, [WITHDRAWN_ID.crestorMite]],
    [2, [WITHDRAWN_ID.crestorMite, WITHDRAWN_ID.crestorForte]],
    [3, [WITHDRAWN_ID.crestorMite, WITHDRAWN_ID.crestorForte, WITHDRAWN_ID.crestor]],
  ])("cuts withdrawn variants first at limit %i and still reports the total", (limit, expected) => {
    expect(searchWithdrawn("crestor", limit)).toEqual({ ids: expected, total: 4 });
  });

  it("decodes a 7th tuple element `true` as a withdrawn variant", () => {
    const [variant] = searchVariants(withdrawnIndex, "crestor 10").results;

    expect(variant).toEqual({
      id: WITHDRAWN_ID.crestor,
      name: "Crestor",
      strength: "10 mg",
      form: "tabletki powlekane",
      commonName: "Rosuvastatinum",
      substances: ["Rosuvastatinum"],
      withdrawn: true,
    });
  });
});

// S-11 numeric strength order (context/changes/search-numeric-strength-order/plan.md, phase 1). Inside one name the
// strength key decides: parseable strengths before unparseable ones; among parseable ones first the unit signature
// (plain string order, so "mg" < "mg+mg" < "mg/ml"), then the numbers in order (each component's value, then its own
// denominator; g, mg and mcg converted to mg); ties and unparseable strengths fall back to Polish text order, then id.
// Every case below is one name at level A; the expected orders are derived by hand from that rule. Ids run in reverse
// of the expected order, so the id never decides.
describe("searchVariants strength order", () => {
  const strengthList: RegistrySearchListPayload = {
    version: 1,
    snapshotDate: "2026-11-17",
    variants: [
      // Different digit counts: 250 < 500 < 1000.
      [101, "Digitum", "1000 mg", "tabletki", null, []],
      [102, "Digitum", "500 mg", "tabletki", null, []],
      [103, "Digitum", "250 mg", "tabletki", null, []],
      // Decimal comma: 2.5 < 5 < 10.
      [111, "Decimum", "10 mg", "tabletki", null, []],
      [112, "Decimum", "5 mg", "tabletki", null, []],
      [113, "Decimum", "2,5 mg", "tabletki", null, []],
      // Mass in g: 1 g = 1000 mg, so after 750 mg.
      [121, "Grammex", "1 g", "tabletki", null, []],
      [122, "Grammex", "750 mg", "tabletki", null, []],
      [123, "Grammex", "500 mg", "tabletki", null, []],
      // Mass in mcg: 250 mcg = 0.25 mg < 0.5 mg.
      [131, "Microdose", "0,5 mg", "tabletki", null, []],
      [132, "Microdose", "250 mcg", "tabletki", null, []],
      // Unit groups: signature "mg" < "mg/ml", so every tablet before every solution, each group by number.
      [141, "Groupix", "7,5 mg/ml", "roztwór", null, []],
      [142, "Groupix", "1 mg/ml", "roztwór", null, []],
      [143, "Groupix", "10 mg", "tabletki", null, []],
      [144, "Groupix", "5 mg", "tabletki", null, []],
      // Concentrations, signature "jm/ml": numerators 1000 < 2000 < 3000 < 10000 (spaces separate thousands).
      [151, "Unitex", "10 000 j.m./ml", "roztwór", null, []],
      [152, "Unitex", "3 000 j.m./0,3 ml", "roztwór", null, []],
      [153, "Unitex", "2000 j.m./ml", "roztwór", null, []],
      [154, "Unitex", "1000 j.m./0,5 ml", "roztwór", null, []],
      // Equal numerator: the denominator decides, 5 ml < 10 ml.
      [161, "Ratiomed", "5 mg/10 ml", "roztwór", null, []],
      [162, "Ratiomed", "5 mg/5 ml", "roztwór", null, []],
      // Combinations, component by component: (2.5, 1.25) < (5, 2.5) < (10, 5) < (10, 10).
      [171, "Combix", "10 mg + 10 mg", "tabletki", null, []],
      [172, "Combix", "10 mg + 5 mg", "tabletki", null, []],
      [173, "Combix", "5 mg + 2,5 mg", "tabletki", null, []],
      [174, "Combix", "2,5 mg + 1,25 mg", "tabletki", null, []],
      // Unparseable after the parseable "20 mg", among themselves in Polish text order: empty (null) first, then
      // punctuation, digits, letters.
      [181, "Restmed", "Produkt złożony", "tabletki", null, []],
      [182, "Restmed", "5 mg; 10 mg", "tabletki", null, []],
      [183, "Restmed", "-", "tabletki", null, []],
      [184, "Restmed", null, "tabletki", null, []],
      [185, "Restmed", "20 mg", "tabletki", null, []],
      // A trailing parenthetical does not change the key: "1 mg/ml (0,1%)" reads as 1 mg/ml, between 0.5 and 5 mg/ml
      // (were it unparseable, it would go last).
      [191, "Parenthin", "5 mg/ml", "krople", null, []],
      [192, "Parenthin", "1 mg/ml (0,1%)", "krople", null, []],
      [193, "Parenthin", "0,5 mg/ml", "krople", null, []],
    ],
  };
  const strengthIndex = buildSearchIndex(strengthList);

  function strengthsOf(query: string) {
    const { results, total } = searchVariants(strengthIndex, query);
    return { strengths: results.map((variant) => variant.strength), total };
  }

  it.each([
    ["digitum", ["250 mg", "500 mg", "1000 mg"]],
    ["decimum", ["2,5 mg", "5 mg", "10 mg"]],
    ["grammex", ["500 mg", "750 mg", "1 g"]],
    ["microdose", ["250 mcg", "0,5 mg"]],
    ["groupix", ["5 mg", "10 mg", "1 mg/ml", "7,5 mg/ml"]],
    ["unitex", ["1000 j.m./0,5 ml", "2000 j.m./ml", "3 000 j.m./0,3 ml", "10 000 j.m./ml"]],
    ["ratiomed", ["5 mg/5 ml", "5 mg/10 ml"]],
    ["combix", ["2,5 mg + 1,25 mg", "5 mg + 2,5 mg", "10 mg + 5 mg", "10 mg + 10 mg"]],
    ["restmed", ["20 mg", null, "-", "5 mg; 10 mg", "Produkt złożony"]],
    ["parenthin", ["0,5 mg/ml", "1 mg/ml (0,1%)", "5 mg/ml"]],
  ])("orders the strengths of „%s” numerically", (query, expected) => {
    expect(strengthsOf(query)).toEqual({ strengths: expected, total: expected.length });
  });

  // The higher keys stay: a shorter name beats a longer one whatever the strength, and an active variant beats a
  // withdrawn one of the same name although its strength is greater.
  it("keeps the withdrawn flag and the name length before the strength", () => {
    const ordoList: RegistrySearchListPayload = {
      version: 1,
      snapshotDate: "2026-11-17",
      variants: [
        // Withdrawn, the lowest strength and the shortest name: last.
        [201, "Ordo", "250 mg", "tabletki", null, [], true],
        // Active, longer name (10 characters), lower strength: after the active 4-character name.
        [202, "Ordo Forte", "250 mg", "tabletki", null, []],
        // Active, shortest name, highest strength: first.
        [203, "Ordo", "1000 mg", "tabletki", null, []],
      ],
    };

    const { results, total } = searchVariants(buildSearchIndex(ordoList), "ordo");

    expect({ ids: results.map((variant) => variant.id), total }).toEqual({ ids: [203, 202, 201], total: 3 });
  });
});

// S-17 substance filter and id lookup (context/changes/substance-medicine-links/plan.md, phase 1). Agreed rule: a
// variant has the substance when one of its substances is the same name (the same word list after normalization, as
// `sameName`), not just a name that starts with it; variants with exactly one substance come before combinations, and
// inside each group the index order stays (active before withdrawn, then shorter name, Polish name order). `total`
// counts every match. Expected values are derived by hand from the rows below, never from a run of the code.
describe("substance filter and lookup", () => {
  const SUB_ID = {
    // One substance, active, shortest name (4).
    apap: 401,
    // One substance, active, 10 characters.
    efferalgan: 402,
    // One substance, withdrawn, 7 characters.
    panadol: 403,
    // Two substances, active, 7 characters.
    coldrex: 404,
    // Two substances (the sought one second), active, 4 characters.
    pabi: 405,
    // One substance whose whole name is "Paracetamolum + Coffeinum".
    zolpar: 406,
    // Another substance.
    ibuprom: 407,
    // Two substances, withdrawn, 7 characters.
    lekadol: 408,
    // Polish letters in the substance names.
    mydlex: 411,
    weglan: 412,
    // A substance made of punctuation only.
    placebo: 413,
  } as const;

  const substanceList: RegistrySearchListPayload = {
    version: 1,
    snapshotDate: "2026-11-19",
    variants: [
      [SUB_ID.apap, "Apap", "500 mg", "tabletki", "Paracetamolum", ["Paracetamolum"]],
      [SUB_ID.efferalgan, "Efferalgan", "500 mg", "tabletki musujące", "Paracetamolum", ["Paracetamolum"]],
      [SUB_ID.panadol, "Panadol", "500 mg", "tabletki", "Paracetamolum", ["Paracetamolum"], true],
      [SUB_ID.coldrex, "Coldrex", "500 mg", "tabletki", null, ["Paracetamolum", "Coffeinum"]],
      [SUB_ID.pabi, "Pabi", "500 mg", "tabletki", null, ["Coffeinum", "Paracetamolum"]],
      [SUB_ID.zolpar, "Zolpar", "500 mg", "tabletki", null, ["Paracetamolum + Coffeinum"]],
      [SUB_ID.ibuprom, "Ibuprom", "400 mg", "tabletki", "Ibuprofenum", ["Ibuprofenum"]],
      [SUB_ID.lekadol, "Lekadol", "500 mg", "tabletki", null, ["Paracetamolum", "Coffeinum"], true],
      [SUB_ID.mydlex, "Mydlex", null, "mydło", null, ["Mydło szare"]],
      [SUB_ID.weglan, "Weglan", null, "tabletki", null, ["Węgiel aktywowany"]],
      [SUB_ID.placebo, "Placebo", null, null, null, ["-"]],
    ],
  };
  const substanceIndex = buildSearchIndex(substanceList);

  function withSubstance(substance: string, limit = 20) {
    const { results, total } = variantsWithSubstance(substanceIndex, substance, limit);
    return { ids: results.map((variant) => variant.id), total };
  }

  // Index order of the paracetamol variants: active by name length then name (Apap and Pabi 4, Coldrex 7,
  // Efferalgan 10), then withdrawn (Lekadol and Panadol 7, Polish order L < P).
  // Singles: Apap, Efferalgan, Panadol (withdrawn). Combinations: Pabi, Coldrex, Lekadol (withdrawn).
  it("puts variants with one substance first, then combinations, each in index order", () => {
    expect(withSubstance("Paracetamolum")).toEqual({
      ids: [SUB_ID.apap, SUB_ID.efferalgan, SUB_ID.panadol, SUB_ID.pabi, SUB_ID.coldrex, SUB_ID.lekadol],
      total: 6,
    });
  });

  // The withdrawn single (Panadol) stands before the active combinations (Pabi, Coldrex).
  it("puts a withdrawn variant with one substance before an active combination", () => {
    const { ids } = withSubstance("Paracetamolum");

    expect(ids.indexOf(SUB_ID.panadol)).toBeLessThan(ids.indexOf(SUB_ID.pabi));
  });

  // The substance as one whole name is not a prefix match and not a part of a longer name.
  it("matches whole names, not prefixes", () => {
    expect(withSubstance("Paracet")).toEqual({ ids: [], total: 0 });
    expect(withSubstance("Paracetamol")).toEqual({ ids: [], total: 0 });
  });

  it("does not take a combined name for its parts, nor the parts for the combined name", () => {
    // Zolpar lists "Paracetamolum + Coffeinum" as one substance: it has the combined name only.
    expect(withSubstance("Paracetamolum + Coffeinum")).toEqual({ ids: [SUB_ID.zolpar], total: 1 });
    // "Coffeinum" is a substance of the three combinations, not of Zolpar. Combinations keep index order.
    expect(withSubstance("Coffeinum")).toEqual({ ids: [SUB_ID.pabi, SUB_ID.coldrex, SUB_ID.lekadol], total: 3 });
  });

  it.each([
    // ł -> l
    ["mydlo szare", [SUB_ID.mydlex]],
    ["MYDŁO SZARE", [SUB_ID.mydlex]],
    ["  mydło   szare  ", [SUB_ID.mydlex]],
    // diacritics: ę -> e
    ["wegiel aktywowany", [SUB_ID.weglan]],
    ["WĘGIEL aktywowany", [SUB_ID.weglan]],
    // case only
    ["IBUPROFENUM", [SUB_ID.ibuprom]],
  ])("ignores case, diacritics and ł for „%s”", (substance, expected) => {
    expect(withSubstance(substance)).toEqual({ ids: expected, total: expected.length });
  });

  // R6-like: `total` counts every match, `results` is the first `limit` of the ordered list.
  it.each([
    [2, [SUB_ID.apap, SUB_ID.efferalgan]],
    [4, [SUB_ID.apap, SUB_ID.efferalgan, SUB_ID.panadol, SUB_ID.pabi]],
    [6, [SUB_ID.apap, SUB_ID.efferalgan, SUB_ID.panadol, SUB_ID.pabi, SUB_ID.coldrex, SUB_ID.lekadol]],
    [20, [SUB_ID.apap, SUB_ID.efferalgan, SUB_ID.panadol, SUB_ID.pabi, SUB_ID.coldrex, SUB_ID.lekadol]],
  ])("cuts „Paracetamolum” at limit %i and still reports the total", (limit, expected) => {
    expect(withSubstance("Paracetamolum", limit)).toEqual({ ids: expected, total: 6 });
  });

  it("keeps counting when the limit is reached inside the first group", () => {
    // Limit 1 fills with the first single; the rest of the singles and every combination still count.
    expect(withSubstance("Paracetamolum", 1)).toEqual({ ids: [SUB_ID.apap], total: 6 });
  });

  it.each([["-"], [""], ["   "], ["+"], ["Nieznanum"]])("gives nothing for „%s”", (substance) => {
    expect(withSubstance(substance)).toEqual({ ids: [], total: 0 });
  });

  it("returns the variants unchanged", () => {
    const [first] = variantsWithSubstance(substanceIndex, "Paracetamolum", 1).results;

    expect(first).toEqual({
      id: SUB_ID.apap,
      name: "Apap",
      strength: "500 mg",
      form: "tabletki",
      commonName: "Paracetamolum",
      substances: ["Paracetamolum"],
      withdrawn: false,
    });
  });

  it("gives the same answer when asked again", () => {
    expect(withSubstance("Paracetamolum")).toEqual(withSubstance("Paracetamolum"));
  });

  it("finds the variant of a list id", () => {
    expect(findVariant(substanceIndex, SUB_ID.apap)).toEqual({
      id: SUB_ID.apap,
      name: "Apap",
      strength: "500 mg",
      form: "tabletki",
      commonName: "Paracetamolum",
      substances: ["Paracetamolum"],
      withdrawn: false,
    });
    expect(findVariant(substanceIndex, SUB_ID.mydlex)).toEqual({
      id: SUB_ID.mydlex,
      name: "Mydlex",
      strength: null,
      form: "mydło",
      commonName: null,
      substances: ["Mydło szare"],
      withdrawn: false,
    });
  });

  it("returns null for an id that is not in the list", () => {
    expect(findVariant(substanceIndex, 999)).toBeNull();
    expect(findVariant(substanceIndex, 0)).toBeNull();
    expect(findVariant(substanceIndex, -401)).toBeNull();
  });

  it("returns a withdrawn variant with its flag", () => {
    expect(findVariant(substanceIndex, SUB_ID.panadol)).toEqual({
      id: SUB_ID.panadol,
      name: "Panadol",
      strength: "500 mg",
      form: "tabletki",
      commonName: "Paracetamolum",
      substances: ["Paracetamolum"],
      withdrawn: true,
    });
  });

  it("finds nothing in an empty list", () => {
    const empty = buildSearchIndex({ version: 1, snapshotDate: "2026-11-19", variants: [] });

    expect(variantsWithSubstance(empty, "Paracetamolum", 20)).toEqual({ results: [], total: 0 });
    expect(findVariant(empty, 1)).toBeNull();
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
