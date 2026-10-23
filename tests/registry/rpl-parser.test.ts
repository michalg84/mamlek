import { describe, expect, it } from "vitest";
import { RPL_NAMESPACE, RplParseError } from "../../scripts/lib/rpl-parser.mjs";
import { parseText, xmlDoc, type Product } from "./parse-helpers";

// Risk #7 (a registry file with a wrong, empty, duplicated or unexpected record either imports every valid product
// unchanged or fails loudly), parser side. Every expected record below is written by hand from the XML of its own
// test case (or, for the real products, from the source record, see rpl-real-shapes.test.ts). The parser only
// produces the observed value, never the expected one, and there are no snapshots generated from it.
//
// Each case is a tiny document built from the helpers below, so it contains only what makes it different.

type Attrs = Record<string, string | null>;

// Values are inserted as they are, so a case can use entities (&#10;, &amp;). `null` omits the attribute.
function attrs(values: Attrs): string {
  return Object.entries(values)
    .filter(([, value]) => value !== null)
    .map(([name, value]) => `${name}="${value}"`)
    .join(" ");
}

const product = (values: Attrs = {}, inner = "") =>
  `<produktLeczniczy ${attrs({ nazwaProduktu: "Lek", rodzajPreparatu: "ludzki", id: "1", ...values })}>${inner}</produktLeczniczy>`;
const pack = (values: Attrs = {}, inner = "") =>
  `<opakowanie ${attrs({ id: "10", skasowane: "NIE", ...values })}>${inner}</opakowanie>`;
const packages = (...items: string[]) => `<opakowania>${items.join("")}</opakowania>`;
const substanceElement = (values: Attrs = {}) =>
  `<substancjaCzynna ${attrs({ nazwaSubstancji: "Subst", ...values })}/>`;
const substances = (...items: string[]) => `<substancjeCzynne>${items.join("")}</substancjeCzynne>`;
const unit = (values: Attrs = {}) => `<jednostkaOpakowania ${attrs(values)}/>`;
const units = (...items: string[]) => `<jednostkiOpakowania>${items.join("")}</jednostkiOpakowania>`;

// What the parser must return for `product()` with no extra attributes or children.
const expectedProduct = (overrides: Partial<Product> = {}): Product => ({
  id: "1",
  name: "Lek",
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

// Runs `parseText` and returns what it rejected with; fails when the document is accepted.
async function rejection(xml: string, chunkSize?: number): Promise<unknown> {
  try {
    await parseText(xml, chunkSize);
  } catch (error) {
    return error;
  }
  throw new Error("expected the parser to reject the document, but it accepted it");
}

async function parseProducts(xml: string, chunkSize?: number) {
  return (await parseText(xmlDoc(xml), chunkSize)).products;
}

// [description, document, message pattern]. All of them must end in an RplParseError with the pattern in the message.
const parseErrorCases: [string, string, RegExp][] = [
  ["a wrong root namespace", xmlDoc("", { namespace: "http://example.com/other" }), /unexpected root namespace/],
  ["a missing stanNaDzien", xmlDoc("", { date: null }), /missing or invalid stanNaDzien/],
  ["an empty stanNaDzien", xmlDoc("", { date: "" }), /missing or invalid stanNaDzien/],
  ...["2026-9-1", "21-10-2026", "2026/10/21", "2026-10-21T10:00:00", " 2026-10-21"].map(
    (date): [string, string, RegExp] => [
      `a stanNaDzien in the wrong format (“${date}”)`,
      xmlDoc("", { date }),
      /missing or invalid stanNaDzien/,
    ],
  ),
  [
    "a wrong root element",
    `<inne xmlns="${RPL_NAMESPACE}" stanNaDzien="2026-10-21"/>`,
    /unexpected root element <inne>/,
  ],

  // Product and package ids: not numeric, empty, missing, signed, 20 digits (the 19-digit boundary is accepted below).
  ...["abc", "", " 1", "-1", "1.5", "12345678901234567890"].map((id): [string, string, RegExp] => [
    `a product id “${id}”`,
    xmlDoc(product({ id })),
    /<produktLeczniczy> has an invalid id/,
  ]),
  ["a missing product id", xmlDoc(product({ id: null })), /<produktLeczniczy> has an invalid id/],
  ...["abc", "", "-1", "12345678901234567890"].map((id): [string, string, RegExp] => [
    `a package id “${id}”`,
    xmlDoc(product({}, packages(pack({ id })))),
    /<opakowanie> has an invalid id/,
  ]),
  ["a missing package id", xmlDoc(product({}, packages(pack({ id: null })))), /<opakowanie> has an invalid id/],

  // Names: an empty value and a value of white space only both count as empty.
  ...["", "   ", "  ", "&#9; &#10;"].map((name): [string, string, RegExp] => [
    `a nazwaProduktu of “${name}”`,
    xmlDoc(product({ nazwaProduktu: name })),
    /product 1 has an empty nazwaProduktu/,
  ]),
  ["a missing nazwaProduktu", xmlDoc(product({ nazwaProduktu: null })), /product 1 has an empty nazwaProduktu/],
  ...["", "  ", "  ", "&#9; &#10;"].map((name): [string, string, RegExp] => [
    `a nazwaSubstancji of “${name}”`,
    xmlDoc(product({}, substances(substanceElement({ nazwaSubstancji: name })))),
    /product 1 has a substance with an empty nazwaSubstancji/,
  ]),
  [
    "a missing nazwaSubstancji",
    xmlDoc(product({}, substances(substanceElement({ nazwaSubstancji: null })))),
    /product 1 has a substance with an empty nazwaSubstancji/,
  ],

  // rodzajPreparatu must be exactly "ludzki" or "weterynaryjny"; the message names the attribute and the value.
  ...["Ludzki", "LUDZKI", "inny", "", "ludzki ", "weterynaryjny "].map((kind): [string, string, RegExp] => [
    `a rodzajPreparatu of “${kind}”`,
    xmlDoc(product({ rodzajPreparatu: kind })),
    new RegExp(`product 1 has an unrecognised rodzajPreparatu "${kind}"`),
  ]),
  [
    "a missing rodzajPreparatu",
    xmlDoc(product({ rodzajPreparatu: null })),
    /product 1 has an unrecognised rodzajPreparatu ""/,
  ],

  // skasowane of a package must be "TAK", "NIE" or absent; the message names the attribute and the value.
  ...["tak", "Tak", "Nie", "nie", "1", "", "TAK "].map((deleted): [string, string, RegExp] => [
    `a package skasowane of “${deleted}”`,
    xmlDoc(product({}, packages(pack({ skasowane: deleted })))),
    new RegExp(`product 1 has a package with an unrecognised skasowane "${deleted}"`),
  ]),

  // Truncated and malformed XML.
  [
    "a document cut inside an open product",
    `<produktyLecznicze xmlns="${RPL_NAMESPACE}" stanNaDzien="2026-10-21"><produktLeczniczy ${attrs({ nazwaProduktu: "Lek", rodzajPreparatu: "ludzki", id: "1" })}><kodyATC>`,
    /unclosed tag/i,
  ],
  [
    "a document cut inside a tag",
    xmlDoc(product({}, "<kodyATC>")).slice(0, -40),
    // saxes reports the cut as an unclosed tag or an unexpected end of input, the wording is its own.
    /./,
  ],
  [
    "a document cut after the last product but before the root closes",
    xmlDoc(product()).replace("</produktyLecznicze>", ""),
    /unclosed tag/i,
  ],
  [
    "an unclosed tag",
    xmlDoc(`<produktLeczniczy ${attrs({ nazwaProduktu: "Lek", rodzajPreparatu: "ludzki", id: "1" })}>`),
    /./,
  ],
  ["a mismatched closing tag", xmlDoc("<kodyATC></drogiPodania>"), /./],
  ["text that is not XML", "this is not xml", /./],
  ["an empty document", "", /./],
  ["only an XML declaration", '<?xml version="1.0" encoding="UTF-8"?>', /./],
  // The XML character set has no NUL, not even as a character reference.
  ["a NUL character reference in a name", xmlDoc(product({ nazwaProduktu: "Le&#0;k" })), /./],
];

describe("parseRpl: loud errors", () => {
  // The same document is fed whole and one character at a time, so the error does not depend on where the parser
  // happens to throw (in parseRpl for the first chunks, or later while the products are iterated).
  describe.each([
    ["the whole text", undefined],
    ["1-character chunks", 1],
  ])("fed as %s", (_label, chunkSize) => {
    it.each(parseErrorCases)("rejects %s", async (_name, xml, pattern) => {
      const error = await rejection(xml, chunkSize);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(pattern);
    });
  });

  // Errors that the parser itself defines are RplParseError, not a generic Error.
  it.each(parseErrorCases.filter(([, , pattern]) => pattern.source !== "." && pattern.source !== "unclosed tag"))(
    "raises an RplParseError for %s",
    async (_name, xml) => {
      expect(await rejection(xml)).toBeInstanceOf(RplParseError);
    },
  );

  it("does not validate skasowane of a package that belongs to a skipped (veterinary) product", async () => {
    const products = await parseProducts(
      product({ rodzajPreparatu: "weterynaryjny" }, packages(pack({ skasowane: "tak" }))),
    );
    expect(products).toEqual([]);
  });

  it("does not validate the id of a skipped (veterinary) product", async () => {
    const result = await parseText(xmlDoc(product({ rodzajPreparatu: "weterynaryjny", id: "x" })));
    expect(result.products).toEqual([]);
    expect(result.stats.skippedProducts).toBe(1);
  });
});

describe("parseRpl: valid shapes", () => {
  it("returns the snapshot date from stanNaDzien", async () => {
    expect((await parseText(xmlDoc("", { date: "2026-09-23" }))).snapshotDate).toBe("2026-09-23");
  });

  it("stores empty and missing attributes as null and leaves the lists empty", async () => {
    const empty = product({
      nazwaPowszechnieStosowana: "",
      nazwaPoprzedniaProduktu: "",
      moc: "",
      nazwaPostaciFarmaceutycznej: "",
      podmiotOdpowiedzialny: "",
      typProcedury: "",
      numerPozwolenia: "",
      waznoscPozwolenia: "",
      ulotka: "",
      charakterystyka: "",
    });
    // A product with only the three required attributes gives the same record.
    expect(await parseProducts(empty)).toEqual([expectedProduct()]);
    expect(await parseProducts(product())).toEqual([expectedProduct()]);
  });

  it("reads every product attribute into its column", async () => {
    const xml = product({
      id: "100000014",
      nazwaProduktu: "Zoledronic acid",
      nazwaPowszechnieStosowana: "Acidum zoledronicum",
      nazwaPoprzedniaProduktu: "Zoledronat",
      moc: "4 mg/5 ml",
      nazwaPostaciFarmaceutycznej: "Koncentrat do infuzji",
      podmiotOdpowiedzialny: "Fresenius Kabi",
      typProcedury: "DCP",
      numerPozwolenia: "20708",
      waznoscPozwolenia: "Bezterminowe",
      ulotka: "https://example.test/leaflet",
      charakterystyka: "https://example.test/characteristic",
    });
    expect(await parseProducts(xml)).toEqual([
      expectedProduct({
        id: "100000014",
        name: "Zoledronic acid",
        common_name: "Acidum zoledronicum",
        previous_name: "Zoledronat",
        strength: "4 mg/5 ml",
        pharmaceutical_form: "Koncentrat do infuzji",
        marketing_authorization_holder: "Fresenius Kabi",
        procedure_type: "DCP",
        authorization_number: "20708",
        authorization_validity: "Bezterminowe",
        leaflet_url: "https://example.test/leaflet",
        characteristic_url: "https://example.test/characteristic",
      }),
    ]);
  });

  it("accepts a 19-digit id, the longest the id rule allows, and keeps it as text", async () => {
    const products = await parseProducts(
      product({ id: "1234567890123456789" }, packages(pack({ id: "9999999999999999999" }))),
    );
    expect(products.map((p) => p.id)).toEqual(["1234567890123456789"]);
    expect(products[0]?.packages.map((p) => p.id)).toEqual(["9999999999999999999"]);
  });

  it.each(["brak", "BRAK", "Brak", " brak ", " Brak "])("turns the previous name “%s” into null", async (previous) => {
    expect(await parseProducts(product({ nazwaPoprzedniaProduktu: previous }))).toEqual([expectedProduct()]);
  });

  it.each(["Stara nazwa", "brakuje", "brak.", "Stara nazwa "])(
    "keeps the previous name “%s” as it is",
    async (previous) => {
      expect(await parseProducts(product({ nazwaPoprzedniaProduktu: previous }))).toEqual([
        expectedProduct({ previous_name: previous }),
      ]);
    },
  );

  it("keeps two ATC codes in order, trimmed, and keeps BRAK as data", async () => {
    const xml = product(
      {},
      "<kodyATC><kodATC> A01AA01 </kodATC><kodATC>BRAK</kodATC><kodATC>\n  M05BA08\n</kodATC></kodyATC>",
    );
    expect(await parseProducts(xml)).toEqual([expectedProduct({ atc_codes: ["A01AA01", "BRAK", "M05BA08"] })]);
  });

  it("skips empty ATC elements", async () => {
    const xml = product({}, "<kodyATC><kodATC/><kodATC>   </kodATC><kodATC>N02BE01</kodATC></kodyATC>");
    expect(await parseProducts(xml)).toEqual([expectedProduct({ atc_codes: ["N02BE01"] })]);
  });

  it("reads an ATC code written as CDATA", async () => {
    const xml = product({}, "<kodyATC><kodATC><![CDATA[C09AA05]]></kodATC></kodyATC>");
    expect(await parseProducts(xml)).toEqual([expectedProduct({ atc_codes: ["C09AA05"] })]);
  });

  it("keeps routes of administration in order, skipping empty or unnamed ones, without trimming", async () => {
    const xml = product(
      {},
      `<drogiPodania>
        <drogaPodania drogaPodaniaNazwa="doustna"/>
        <drogaPodania drogaPodaniaNazwa=""/>
        <drogaPodania/>
        <drogaPodania drogaPodaniaNazwa="na skórę "/>
      </drogiPodania>`,
    );
    expect(await parseProducts(xml)).toEqual([expectedProduct({ routes: ["doustna", "na skórę "] })]);
  });

  it("numbers substances 1…n in document order, including a repeated name", async () => {
    const xml = product(
      {},
      substances(
        substanceElement({ nazwaSubstancji: "Alfa", iloscSubstancji: "10", jednostkaMiaryIlosciSubstancji: "mg" }),
        substanceElement({
          nazwaSubstancji: "Beta",
          iloscPreparatu: "5",
          jednostkaMiaryIlosciPreparatu: "ml",
          innyOpisIlosci: "w przeliczeniu",
        }),
        substanceElement({ nazwaSubstancji: "Alfa", iloscSubstancji: "", jednostkaMiaryIlosciSubstancji: "" }),
      ),
    );
    expect(await parseProducts(xml)).toEqual([
      expectedProduct({
        substances: [
          {
            position: 1,
            name: "Alfa",
            amount: "10",
            unit: "mg",
            preparation_amount: null,
            preparation_unit: null,
            other_description: null,
          },
          {
            position: 2,
            name: "Beta",
            amount: null,
            unit: null,
            preparation_amount: "5",
            preparation_unit: "ml",
            other_description: "w przeliczeniu",
          },
          {
            position: 3,
            name: "Alfa",
            amount: null,
            unit: null,
            preparation_amount: null,
            preparation_unit: null,
            other_description: null,
          },
        ],
      }),
    ]);
  });

  it("keeps a package with three units in the same order with every field", async () => {
    const xml = product(
      {},
      packages(
        pack(
          { id: "115378", kodGTIN: "05901549325034", kategoriaDostepnosci: "Rp" },
          units(
            unit({
              liczbaOpakowan: "1",
              rodzajOpakowania: "sasz.",
              pojemnosc: "125",
              jednostkaPojemnosci: "mg",
              informacjeDodatkowe: "",
            }),
            unit({
              liczbaOpakowan: "2",
              rodzajOpakowania: "dozowniki",
              pojemnosc: "",
              jednostkaPojemnosci: "",
              informacjeDodatkowe: "",
            }),
            unit({
              liczbaOpakowan: "1",
              rodzajOpakowania: "pojemnik",
              pojemnosc: "",
              jednostkaPojemnosci: "",
              informacjeDodatkowe: "+ 1 nasadka",
            }),
          ),
        ),
      ),
    );
    expect(await parseProducts(xml)).toEqual([
      expectedProduct({
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
    ]);
  });

  it("keeps packages in document order and gives a package without units an empty list", async () => {
    const xml = product({}, packages(pack({ id: "30" }), pack({ id: "20", kodGTIN: "", kategoriaDostepnosci: "" })));
    expect(await parseProducts(xml)).toEqual([
      expectedProduct({
        packages: [
          { id: "30", gtin: null, availability_category: null, units: [] },
          { id: "20", gtin: null, availability_category: null, units: [] },
        ],
      }),
    ]);
  });

  it("skips and counts packages with skasowane=TAK, and keeps skasowane=NIE or no attribute", async () => {
    const xml = product(
      {},
      packages(
        pack({ id: "10", skasowane: "NIE" }),
        pack({ id: "11", skasowane: "TAK" }, units(unit({ pojemnosc: "5" }))),
        pack({ id: "12", skasowane: null }),
        pack({ id: "13", skasowane: "TAK" }),
      ),
    );
    const result = await parseText(xmlDoc(xml));
    expect(result.products.map((p) => p.packages.map((x) => x.id))).toEqual([["10", "12"]]);
    expect(result.stats).toEqual({ skippedProducts: 0, skippedPackages: 2 });
  });

  it("skips and counts a veterinary product, but not the packages inside it, and keeps its neighbours intact", async () => {
    const xml =
      product({ id: "1", nazwaProduktu: "Przed" }, substances(substanceElement({ nazwaSubstancji: "S1" }))) +
      product(
        { id: "2", nazwaProduktu: "Weterynaryjny", rodzajPreparatu: "weterynaryjny" },
        '<kodyATC><kodATC>QM01AH92</kodATC></kodyATC><drogiPodania><drogaPodania drogaPodaniaNazwa="doustna"/></drogiPodania>' +
          substances(substanceElement({ nazwaSubstancji: "Wet" })) +
          packages(pack({ id: "20", skasowane: "TAK" }), pack({ id: "21" })),
      ) +
      product({ id: "3", nazwaProduktu: "Po" });
    const result = await parseText(xmlDoc(xml));
    expect(result.products).toEqual([
      expectedProduct({
        id: "1",
        name: "Przed",
        substances: [
          {
            position: 1,
            name: "S1",
            amount: null,
            unit: null,
            preparation_amount: null,
            preparation_unit: null,
            other_description: null,
          },
        ],
      }),
      expectedProduct({ id: "3", name: "Po" }),
    ]);
    expect(result.stats).toEqual({ skippedProducts: 1, skippedPackages: 0 });
  });

  it("decodes XML entities and character references", async () => {
    const xml = product({
      moc: "10 mg&#10;(&lt;5 %) &amp; &quot;x&quot; &apos;y&apos; &#x41;",
      nazwaPowszechnieStosowana: "Sól &amp; woda",
    });
    expect(await parseProducts(xml)).toEqual([
      expectedProduct({ strength: "10 mg\n(<5 %) & \"x\" 'y' A", common_name: "Sól & woda" }),
    ]);
  });

  it("prefers ulotka over ulotkaImportRownolegly, and falls back to it when ulotka is empty or missing", async () => {
    const both = product({
      ulotka: "https://example.test/own",
      ulotkaImportRownolegly: "https://example.test/parallel",
    });
    const emptyOwn = product({ ulotka: "", ulotkaImportRownolegly: "https://example.test/parallel" });
    const onlyParallel = product({ ulotkaImportRownolegly: "https://example.test/parallel" });
    expect((await parseProducts(both))[0]?.leaflet_url).toBe("https://example.test/own");
    expect((await parseProducts(emptyOwn))[0]?.leaflet_url).toBe("https://example.test/parallel");
    expect((await parseProducts(onlyParallel))[0]?.leaflet_url).toBe("https://example.test/parallel");
  });

  // KNOWN LIMITATION, pinned on purpose: 18 human products in the 2026-10-21 snapshot carry their leaflet only in
  // `etykietoUlotka` (leaflet and labelling combined), which the parser does not read, so leaflet_url stays null for
  // them. This is a missing feature, not a data-integrity bug, so the test pins today's behaviour. If the parser starts
  // reading etykietoUlotka, change this test deliberately. Open question for the roadmap: read etykietoUlotka or say
  // "no leaflet link" in the UI (the question is added to the roadmap in phase 3 of this change).
  it("pinned: a product with only etykietoUlotka gets leaflet_url null", async () => {
    const xml = product({ etykietoUlotka: "https://example.test/package-leaflet-and-labelling" });
    expect(await parseProducts(xml)).toEqual([expectedProduct()]);
  });

  it("does not trim white space in values, except in ATC codes", async () => {
    const xml = product(
      {
        nazwaProduktu: " Lek ",
        nazwaPowszechnieStosowana: "Substancja ",
        moc: " 10 mg",
        podmiotOdpowiedzialny: "  Firma  ",
      },
      "<kodyATC><kodATC> A01AA01 </kodATC></kodyATC>" +
        substances(substanceElement({ nazwaSubstancji: " Sub " })) +
        packages(pack({ kodGTIN: " 59 " }, units(unit({ rodzajOpakowania: " fiol. " })))),
    );
    expect(await parseProducts(xml)).toEqual([
      expectedProduct({
        name: " Lek ",
        common_name: "Substancja ",
        strength: " 10 mg",
        marketing_authorization_holder: "  Firma  ",
        atc_codes: ["A01AA01"],
        substances: [
          {
            position: 1,
            name: " Sub ",
            amount: null,
            unit: null,
            preparation_amount: null,
            preparation_unit: null,
            other_description: null,
          },
        ],
        packages: [
          {
            id: "10",
            gtin: " 59 ",
            availability_category: null,
            units: [{ count: null, kind: " fiol. ", capacity: null, capacity_unit: null, info: null }],
          },
        ],
      }),
    ]);
  });

  it("does not let ignored elements leak into the record", async () => {
    const xml = product(
      { podstawaPrawna: "art. 15", zakazStosowaniaUZwierzat: "TAK", numerEu: "EU/1" },
      `<kodyATC/><drogiPodania/><substancjeCzynne/>` +
        packages(
          pack(
            { id: "10", numerEu: "EU/1/1", dystrybutorRownolegly: "X" },
            units(unit({ liczbaOpakowan: "1" })) +
              // Ignored elements that carry attribute names the parser reads on the elements it does use.
              `<zgodyPrezesa><zgoda id="999" skasowane="TAK" kodGTIN="X" nazwaSubstancji="Z" kategoriaDostepnosci="Rp"/></zgodyPrezesa>`,
          ),
        ) +
        `<daneOWytworcy><wytworca nazwaWytworcyImportera="Firma" krajWytworcyImportera="Polska" nazwaProduktu="Inna" id="777"/></daneOWytworcy>` +
        `<materialyEdukacyjne><dlaPacjenta/><dlaMedyka/></materialyEdukacyjne>`,
    );
    expect(await parseProducts(xml)).toEqual([
      expectedProduct({
        packages: [
          {
            id: "10",
            gtin: null,
            availability_category: null,
            units: [{ count: "1", kind: null, capacity: null, capacity_unit: null, info: null }],
          },
        ],
      }),
    ]);
  });

  it("reads a document that starts with a byte order mark", async () => {
    const xml = "﻿" + xmlDoc(product());
    expect((await parseText(xml)).products).toEqual([expectedProduct()]);
    expect((await parseText(xml, 1)).products).toEqual([expectedProduct()]);
  });

  it("reads a document with an XML declaration, a comment and surrounding white space", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<!-- eksport -->\n${xmlDoc(`\n  ${product()}\n`)}\n`;
    expect((await parseText(xml)).products).toEqual([expectedProduct()]);
  });

  describe("chunk boundaries", () => {
    // A document that has a boundary inside every kind of token: attribute names and values, entities, tags, CDATA,
    // the namespace declaration, the BOM and multi-byte text.
    const xml =
      "﻿" +
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      xmlDoc(
        product(
          { id: "100000014", nazwaProduktu: "Żółć &amp; Co", moc: "1 mg&#10;/ 2 ml", nazwaPoprzedniaProduktu: "BRAK" },
          "<kodyATC><kodATC> A01AA01 </kodATC><kodATC><![CDATA[BRAK]]></kodATC></kodyATC>" +
            `<drogiPodania><drogaPodania drogaPodaniaNazwa="dożylna"/></drogiPodania>` +
            substances(substanceElement({ nazwaSubstancji: "Alfa" }), substanceElement({ nazwaSubstancji: "Alfa" })) +
            packages(
              pack({ id: "10" }, units(unit({ liczbaOpakowan: "1" }), unit({ liczbaOpakowan: "2" }))),
              pack({ id: "11", skasowane: "TAK" }),
            ),
        ) +
          product({ id: "2", rodzajPreparatu: "weterynaryjny" }, packages(pack({ id: "20", skasowane: "TAK" }))) +
          product({ id: "3", nazwaProduktu: "Trzeci" }),
      );

    it("parses to the same snapshot, products and stats whatever the chunk size", async () => {
      const whole = await parseText(xml);
      // Anchor: the whole-text result is the one that is right (written by hand from the document above).
      expect(whole.snapshotDate).toBe("2026-10-21");
      expect(whole.products.map((p) => p.id)).toEqual(["100000014", "3"]);
      expect(whole.products[0]).toMatchObject({
        name: "Żółć & Co",
        strength: "1 mg\n/ 2 ml",
        previous_name: null,
        atc_codes: ["A01AA01", "BRAK"],
        routes: ["dożylna"],
      });
      expect(whole.stats).toEqual({ skippedProducts: 1, skippedPackages: 1 });

      for (const size of [1, 2, 3, 7, 50, 1000]) {
        expect(await parseText(xml, size), `chunk size ${size}`).toEqual(whole);
      }
    });
  });
});

describe("parseRpl: known behaviour, pinned", () => {
  // The parser does not reject an empty export; the importer does (registry-import.mjs, tested in phase 2).
  it("pinned: a file without products gives an empty list and no error", async () => {
    expect(await parseText(xmlDoc(""))).toEqual({
      snapshotDate: "2026-10-21",
      products: [],
      stats: { skippedProducts: 0, skippedPackages: 0 },
    });
  });

  it("pinned: a file with only veterinary products gives an empty list and counts them", async () => {
    const xml =
      product({ id: "1", rodzajPreparatu: "weterynaryjny" }) + product({ id: "2", rodzajPreparatu: "weterynaryjny" });
    expect(await parseText(xmlDoc(xml))).toEqual({
      snapshotDate: "2026-10-21",
      products: [],
      stats: { skippedProducts: 2, skippedPackages: 0 },
    });
  });

  // The parser does not look for duplicates; the import rejects them through the primary keys of its temporary
  // tables (registry-import.mjs), and --dry-run does not check for them on purpose.
  it("pinned: two products with the same id both come out of the parser", async () => {
    const xml = product({ id: "5", nazwaProduktu: "Pierwszy" }) + product({ id: "5", nazwaProduktu: "Drugi" });
    const products = await parseProducts(xml);
    expect(products.map((p) => [p.id, p.name])).toEqual([
      ["5", "Pierwszy"],
      ["5", "Drugi"],
    ]);
  });

  it("pinned: two packages with the same id both come out of the parser", async () => {
    const products = await parseProducts(product({}, packages(pack({ id: "7" }), pack({ id: "7" }))));
    expect(products[0]?.packages.map((p) => p.id)).toEqual(["7", "7"]);
  });
});
