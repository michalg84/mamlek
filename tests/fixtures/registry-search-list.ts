import type { RegistrySearchListPayload, RegistryVariantTuple } from "@/types";

/**
 * Hand-written registry search list for the matching-rule tests. Names are realistic, ids are synthetic.
 * Rows are grouped by the rule property they exist for; the tests reference rows by `ID`, not by number.
 */
export const ID = {
  // One word ("paracetamol") at three different levels. The level-A name is the longest of the three.
  paracetamolInName: 1,
  paracetamolInCommonName: 2,
  paracetamolInSubstance: 3,

  // Same name, different strength; and a longer name that shares the first word. Ids are deliberately
  // not in strength order (400 mg has the lower id) so that strength, not id, decides the order.
  ibuprom400: 10,
  ibuprom200: 11,
  ibupromMax400: 12,

  // Same name and strength, two forms; the injection has the lower id.
  noSpaInjection: 7,
  noSpaTablet: 8,

  // Equal-length names that differ only in the Polish order (A, Ą, B), a shorter name and a longer name that
  // sorts alphabetically before "Gripex B". Ids are in reverse of the expected order.
  gripex: 23,
  gripexA: 22,
  gripexAOgonek: 21,
  gripexB: 20,
  gripexAktiv: 24,

  // "max" is the first name word of one row and the second name word of two others.
  ibumMax: 30,
  maxigraGo: 31,

  // A row whose name matches the first query word but whose second word is only in the common name,
  // and a longer level-A row for the same query.
  magneB6: 41,
  magneLactasComplex: 40,

  // Diacritics: ż in the form, ł in the name.
  altacetGel: 50,
  plynLugola: 51,

  // Every optional field missing.
  rutinoscorbin: 60,
} as const;

const variants: RegistryVariantTuple[] = [
  [ID.paracetamolInName, "Paracetamol Hasco", "500 mg", "tabletki", "Paracetamolum", ["Paracetamolum"]],
  [ID.paracetamolInCommonName, "Panadol", "500 mg", "tabletki powlekane", "Paracetamolum", ["Paracetamolum"]],
  [ID.paracetamolInSubstance, "Efferalgan", "500 mg", "tabletki musujące", null, ["Paracetamolum"]],

  [ID.ibuprom400, "Ibuprom", "400 mg", "tabletki powlekane", "Ibuprofenum", ["Ibuprofenum"]],
  [ID.ibuprom200, "Ibuprom", "200 mg", "tabletki powlekane", "Ibuprofenum", ["Ibuprofenum"]],
  [ID.ibupromMax400, "Ibuprom Max", "400 mg", "tabletki powlekane", "Ibuprofenum", ["Ibuprofenum"]],

  [
    ID.noSpaInjection,
    "No-Spa",
    "40 mg",
    "roztwór do wstrzykiwań",
    "Drotaverini hydrochloridum",
    ["Drotaverini hydrochloridum"],
  ],
  [ID.noSpaTablet, "No-Spa", "40 mg", "tabletki", "Drotaverini hydrochloridum", ["Drotaverini hydrochloridum"]],

  [ID.gripexB, "Gripex B", null, null, null, []],
  [ID.gripexAOgonek, "Gripex Ą", null, null, null, []],
  [ID.gripexA, "Gripex A", null, null, null, []],
  [ID.gripex, "Gripex", null, null, null, []],
  [ID.gripexAktiv, "Gripex Aktiv", null, null, null, []],

  [ID.ibumMax, "Ibum Max", "400 mg", "tabletki powlekane", "Ibuprofenum", ["Ibuprofenum"]],
  [ID.maxigraGo, "Maxigra Go", "50 mg", "tabletki powlekane", "Sildenafilum", ["Sildenafilum"]],

  [ID.magneLactasComplex, "Magne Lactas Complex", null, "tabletki", null, []],
  [
    ID.magneB6,
    "Magne B6",
    "48 mg",
    "tabletki powlekane",
    "Magnesii lactas dihydricus",
    ["Magnesii lactas dihydricus", "Pyridoxini hydrochloridum"],
  ],

  [ID.altacetGel, "Altacet", null, "żel", "Aluminii acetotartras", ["Aluminii acetotartras"]],
  [ID.plynLugola, "Płyn Lugola", null, "roztwór", "Iodum", ["Iodum", "Kalii iodidum"]],

  [ID.rutinoscorbin, "Rutinoscorbin", null, null, null, []],
];

export const registrySearchList: RegistrySearchListPayload = {
  version: 1,
  snapshotDate: "2026-10-01",
  variants,
};
