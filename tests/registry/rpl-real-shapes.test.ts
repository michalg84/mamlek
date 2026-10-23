import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseText, type Product, type Substance } from "./parse-helpers";

// Risk #7, parser side, on records copied verbatim from the real registry (snapshot of 2026-10-21, 74 MB,
// downloaded from the RPL address in scripts/registry-import.mjs). tests/fixtures/rpl-real-shapes.xml keeps every
// attribute and element of the chosen products, including those the parser ignores. The expected values below were
// typed by hand while reading each source record; the parser is only used to produce the observed value.
//
// Why each product is here (the source ids are the `id` attributes of the records):
//   100512983 Siiltibcy   &#10; (new line) in both `moc` and `innyOpisIlosci`, empty <kodyATC/>, packages without
//                         kodGTIN, empty numerPozwolenia / waznoscPozwolenia, two active packages
//   100436059 Amaplantis  kodATC "BRAK", &quot; in the holder name
//   100546235 Nezglyal    empty podmiotOdpowiedzialny and nazwaPowszechnieStosowana, empty <substancjeCzynne/>
//   100451606 Elocom      13-digit GTIN, leaflet only in ulotkaImportRownolegly (a parallel import)
//   100105523 Urtix       leaflet only in etykietoUlotka (known limitation, pinned: leaflet_url null), a package
//                         whose unit has empty liczbaOpakowan / rodzajOpakowania
//   100369529 Emend       one package with three units in a fixed order, &amp; in the holder name
//   100342559 Sivextro    a trailing space in nazwaPowszechnieStosowana, a deleted package (127235, skasowane="TAK")
//                         next to an active one
//   100490175 Uzpruvo     an active package with empty kategoriaDostepnosci and no kodGTIN
//   100219110 Trocoxil    a veterinary product with a deleted (54460) and an active (137424) package: skipped as a
//                         product, its packages are not counted
const REAL_SHAPES = readFileSync(fileURLToPath(new URL("../fixtures/rpl-real-shapes.xml", import.meta.url)), "utf8");

const BASE = "https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products";

const substance = (position: number, name: string, overrides: Partial<Substance> = {}): Substance => ({
  position,
  name,
  amount: null,
  unit: null,
  preparation_amount: null,
  preparation_unit: null,
  other_description: null,
  ...overrides,
});

const expectedProduct = (overrides: Partial<Product>): Product => ({
  id: "",
  name: "",
  common_name: null,
  previous_name: null,
  strength: null,
  pharmaceutical_form: null,
  marketing_authorization_holder: null,
  procedure_type: null,
  authorization_number: null,
  authorization_validity: null,
  atc_codes: [],
  routes: [],
  leaflet_url: null,
  characteristic_url: null,
  substances: [],
  packages: [],
  ...overrides,
});

const NEW_LINE_STRENGTH = "(0,5 mikrograma + 0,5 mikrograma)/ml \n(rdESAT-6 i rCFP-10)";

// Written by hand from the source records, in the order of the file.
const EXPECTED: Product[] = [
  expectedProduct({
    id: "100512983",
    name: "Siiltibcy",
    common_name: "Antygeny pochodzące z Mycobacterium tuberculosis",
    strength: NEW_LINE_STRENGTH,
    pharmaceutical_form: "Roztwór do wstrzykiwań",
    marketing_authorization_holder: "Serum Life Science Europe GmbH",
    procedure_type: "CEN",
    routes: ["śródskórna"],
    substances: [
      substance(1, "Antygeny pochodzące z Mycobacterium tuberculosis", { other_description: NEW_LINE_STRENGTH }),
    ],
    packages: [
      {
        id: "160405",
        gtin: null,
        availability_category: "Rp",
        units: [{ count: "10", kind: "fiol.", capacity: "1", capacity_unit: "ml", info: null }],
      },
      {
        id: "160406",
        gtin: null,
        availability_category: "Rp",
        units: [{ count: "1", kind: "fiol.", capacity: "1", capacity_unit: "ml", info: null }],
      },
    ],
  }),
  expectedProduct({
    id: "100436059",
    name: "Amaplantis",
    common_name: "Plantaginis lanceolatae folii extractum fluidum",
    strength: "150 mg/ml",
    pharmaceutical_form: "Syrop",
    marketing_authorization_holder: 'Zakład Farmaceutyczny "Amara" Sp. z o.o.',
    procedure_type: "NAR",
    authorization_number: "29839",
    authorization_validity: "2031-07-13",
    atc_codes: ["BRAK"],
    routes: ["doustna"],
    leaflet_url: `${BASE}/43605/leaflet`,
    characteristic_url: `${BASE}/43605/characteristic`,
    substances: [substance(1, "Plantaginis lanceolatae folii extractum fluidum", { amount: "0,15", unit: "g/ml" })],
    packages: [
      {
        id: "164139",
        gtin: "05901315022099",
        availability_category: "OTC",
        units: [{ count: "1", kind: "butelka", capacity: "125", capacity_unit: "g", info: null }],
      },
    ],
  }),
  expectedProduct({
    id: "100546235",
    name: "Nezglyal",
    pharmaceutical_form: "Zawiesina doustna",
    procedure_type: "CEN",
    atc_codes: ["A16AX23"],
    routes: ["doustna"],
    packages: [
      {
        id: "168755",
        gtin: null,
        availability_category: "Rpz",
        units: [{ count: "1", kind: "butel.", capacity: "100", capacity_unit: "ml", info: null }],
      },
    ],
  }),
  expectedProduct({
    id: "100451606",
    name: "Elocom",
    common_name: "Mometasoni furoas",
    strength: "1 mg/g",
    pharmaceutical_form: "Krem",
    marketing_authorization_holder: "Medezin Sp. z o.o.",
    procedure_type: "IR",
    authorization_number: "145/21",
    authorization_validity: "2031-04-23",
    atc_codes: ["D07AC13"],
    routes: ["na skórę"],
    leaflet_url: `${BASE}/45160/parallel-import-files/LEAFLET/public`,
    packages: [
      {
        id: "140235",
        gtin: "5909991452759",
        availability_category: "Rp",
        units: [{ count: "1", kind: "tuba", capacity: "30", capacity_unit: "g", info: null }],
      },
    ],
  }),
  expectedProduct({
    id: "100105523",
    name: "Urtix",
    common_name: "Urticae radix",
    strength: "330 mg",
    pharmaceutical_form: "Tabletki",
    marketing_authorization_holder: "Labofarm sp. z o.o.",
    procedure_type: "NAR",
    authorization_number: "09126",
    authorization_validity: "Bezterminowe",
    routes: ["doustna"],
    // Pinned known limitation: the source has etykietoUlotka only, the parser does not read it.
    leaflet_url: null,
    characteristic_url: `${BASE}/10552/characteristic`,
    substances: [substance(1, "Urticae radix", { amount: "330", unit: "mg" })],
    packages: [
      {
        id: "18260",
        gtin: "05909990912612",
        availability_category: "OTC",
        units: [{ count: null, kind: null, capacity: "60", capacity_unit: "tabl.", info: null }],
      },
      {
        id: "20192",
        gtin: "05909990912629",
        availability_category: "OTC",
        units: [{ count: null, kind: null, capacity: "90", capacity_unit: "tabl.", info: null }],
      },
    ],
  }),
  expectedProduct({
    id: "100369529",
    name: "Emend",
    common_name: "Aprepitantum",
    strength: "125 mg",
    pharmaceutical_form: "Proszek do sporządzania zawiesiny doustnej",
    marketing_authorization_holder: "Merck Sharp & Dohme B.V.",
    procedure_type: "CEN",
    atc_codes: ["A04AD12"],
    routes: ["doustna"],
    packages: [
      {
        id: "115378",
        gtin: "05901549325034",
        availability_category: "Rp",
        units: [
          { count: "1", kind: "sasz.", capacity: "125", capacity_unit: "mg", info: null },
          { count: "2", kind: "dozowniki", capacity: null, capacity_unit: null, info: null },
          { count: "1", kind: "pojemnik", capacity: null, capacity_unit: null, info: "+ 1 nasadka" },
        ],
      },
    ],
  }),
  expectedProduct({
    id: "100342559",
    name: "Sivextro",
    // The trailing space is in the source and is kept.
    common_name: "Tedizolidi phosphas ",
    strength: "200 mg",
    pharmaceutical_form: "Tabletki powlekane",
    marketing_authorization_holder: "Merck Sharp & Dohme B.V.",
    procedure_type: "CEN",
    atc_codes: ["J01XX11"],
    routes: ["doustna"],
    substances: [substance(1, "Tedizolidii phosphas", { amount: "200", unit: "mg" })],
    // Package 127235 is skasowane="TAK" and is not here.
    packages: [
      {
        id: "108013",
        gtin: "05901549324952",
        availability_category: "Rp",
        units: [{ count: null, kind: null, capacity: "6", capacity_unit: "tabl.", info: null }],
      },
    ],
  }),
  expectedProduct({
    id: "100490175",
    name: "Uzpruvo",
    common_name: "Ustekinumabum",
    strength: "90 mg",
    pharmaceutical_form: "Roztwór do wstrzykiwań w ampułko-strzykawce",
    marketing_authorization_holder: "STADA Arzneimittel AG",
    procedure_type: "CEN",
    atc_codes: ["L04AC05"],
    routes: ["podskórna"],
    substances: [substance(1, "Ustekinumabum", { amount: "90", unit: "mg" })],
    packages: [
      {
        id: "152113",
        gtin: "04011548045817",
        availability_category: "Rpz",
        units: [{ count: "1", kind: "amp.-strzyk.", capacity: "1", capacity_unit: "ml", info: null }],
      },
      {
        id: "160638",
        gtin: null,
        availability_category: null,
        units: [{ count: "2", kind: "amp.-strzyk.", capacity: "1", capacity_unit: "ml", info: null }],
      },
    ],
  }),
];

describe("real registry products (snapshot of 2026-10-21)", () => {
  it("reads the snapshot date of the source file", async () => {
    expect((await parseText(REAL_SHAPES)).snapshotDate).toBe("2026-10-21");
  });

  it("returns the eight human products in file order and skips the veterinary one", async () => {
    const result = await parseText(REAL_SHAPES);
    expect(result.products.map((p) => p.id)).toEqual(EXPECTED.map((p) => p.id));
    // Trocoxil (100219110) is the only veterinary product. The deleted package of Sivextro (127235) is the only
    // package counted: Trocoxil's packages 54460 (deleted) and 137424 belong to a skipped product.
    expect(result.stats).toEqual({ skippedProducts: 1, skippedPackages: 1 });
  });

  it.each(EXPECTED.map((expected) => [`${expected.name} (${expected.id})`, expected] as const))(
    "reads %s as in the source record",
    async (_label, expected) => {
      const { products } = await parseText(REAL_SHAPES);
      expect(products.find((p) => p.id === expected.id)).toEqual(expected);
    },
  );

  it("reads the same records from 1-character chunks", async () => {
    expect((await parseText(REAL_SHAPES, 1)).products).toEqual(EXPECTED);
  });
});
