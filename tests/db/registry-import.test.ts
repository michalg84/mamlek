// Tests of the registry import (risk #7, the import side): a bad file ends the importer with exit code 1, a message on
// stderr and a database identical to the one before; a good file lands in the tables untouched. The importer runs as a
// child process (node scripts/registry-import.mjs --file ...) against its own database, registry_import_test, so the
// local CI state of `postgres` (fixtures v1, v1, v2) is never touched. Expected values are hand-written from the XML
// that goes in (tests/fixtures/rpl-real-shapes.xml is verbatim from the real registry), not produced by the importer.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { xmlDoc } from "../registry/parse-helpers";
import {
  BASELINE_FILE,
  MIGRATIONS_DIR,
  REGISTRY_MIGRATIONS,
  type ScratchDatabase,
  createScratchDatabase,
  fingerprint,
  resetToBaseline,
  runImport,
  truncateRegistry,
} from "./registry-import-fixtures";

// Every case starts a child process; the first hook creates a database and applies the migrations.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const REAL_SHAPES = fileURLToPath(new URL("../fixtures/rpl-real-shapes.xml", import.meta.url));

let scratch: ScratchDatabase;
let workDir: string;

beforeAll(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), "registry-import-test-"));
  scratch = await createScratchDatabase();
});

afterAll(async () => {
  try {
    // Undefined when beforeAll failed before the database existed.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    await scratch?.drop();
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

beforeEach(async () => {
  await resetToBaseline(scratch.url, scratch.client);
});

let fileSeq = 0;
function writeFile(content: string | Buffer): string {
  fileSeq += 1;
  const file = path.join(workDir, `dump-${fileSeq}.xml`);
  writeFileSync(file, content);
  return file;
}

// A human product with one substance and one package; `packages` are package ids, `name` the product name.
function product(
  id: number,
  { name = `Product ${id}`, kind = "ludzki", packages = [id + 1_000_000] } = {},
  substances: string[] = [`Substance ${id}`],
): string {
  const substanceXml = substances.map((s) => `<substancjaCzynna nazwaSubstancji="${s}"/>`).join("");
  const packageXml = packages.map((p) => `<opakowanie id="${p}" skasowane="NIE"/>`).join("");
  return (
    `<produktLeczniczy nazwaProduktu="${name}" rodzajPreparatu="${kind}" id="${id}">` +
    `<substancjeCzynne>${substanceXml}</substancjeCzynne><opakowania>${packageXml}</opakowania></produktLeczniczy>`
  );
}

// The v1 fixture without the given products (matched by the start of nazwaProduktu); the 11 products, 21 active
// packages and 36 substance rows of v1 make 10 of 11 products a file that passes the 90% share and 9 of 11 one that
// does not.
const v1 = readFileSync(BASELINE_FILE, "utf8");
function v1Without(...names: string[]): string {
  let xml = v1;
  for (const name of names) {
    const element = new RegExp(`\\s*<produktLeczniczy nazwaProduktu="${name}[^>]*>[\\s\\S]*?</produktLeczniczy>`);
    expect(xml, `${name} is in the v1 fixture`).toMatch(element);
    xml = xml.replace(element, "");
  }
  return xml;
}

async function counts() {
  const { rows } = await scratch.client.query<{ products: number; substances: number; packages: number }>(
    `select (select count(*)::int from registry_products where removed_at is null) as products,
            (select count(*)::int from registry_product_substances) as substances,
            (select count(*)::int from registry_packages where removed_at is null) as packages`,
  );
  return rows[0];
}

describe("a bad file is rejected: exit code 1, a message, the database unchanged", () => {
  const cases: [name: string, build: () => string | Buffer, message: RegExp][] = [
    [
      "truncated XML",
      () =>
        `<produktyLecznicze stanNaDzien="2026-10-21" xmlns="http://rejestry.ezdrowie.gov.pl/rpl/eksport-danych-v6.0.0">${product(1)}<produktLeczniczy nazwaProduktu="Cut" rodzajPreparatu="lud`,
      /unclosed tag: produktyLecznicze/,
    ],
    [
      "wrong namespace",
      () => xmlDoc(product(1), { namespace: "http://example.com/other" }),
      /unexpected root namespace/,
    ],
    [
      "invalid UTF-8",
      () => Buffer.concat([Buffer.from(xmlDoc(product(1)).slice(0, 40)), Buffer.from([0xff])]),
      /not valid for encoding utf-8/,
    ],
    ["product name of spaces only", () => xmlDoc(product(1, { name: "   " })), /empty nazwaProduktu/],
    ['rodzajPreparatu "Ludzki"', () => xmlDoc(product(1, { kind: "Ludzki" })), /unrecognised rodzajPreparatu "Ludzki"/],
    [
      "two products with the same id",
      () => xmlDoc(product(1) + product(1, { packages: [77] })),
      /unique constraint "tmp_registry_products_pkey"/,
    ],
    [
      "two packages with the same id in one product",
      () => xmlDoc(product(1, { packages: [5, 5] })),
      /unique constraint "tmp_registry_packages_pkey"/,
    ],
    [
      "two packages with the same id in two products",
      () => xmlDoc(product(1, { packages: [5] }) + product(2, { packages: [5] })),
      /unique constraint "tmp_registry_packages_pkey"/,
    ],
    ["product id of 20 digits", () => xmlDoc(product(1).replace('id="1"', 'id="12345678901234567890"')), /invalid id/],
    [
      "product id above bigint",
      () => xmlDoc(product(1).replace('id="1"', 'id="9999999999999999999"')),
      /"9999999999999999999" is out of range for type bigint/,
    ],
    [
      "impossible snapshot date",
      () => v1.replace('stanNaDzien="2026-09-23"', 'stanNaDzien="2026-13-45"'),
      /date\/time field value out of range/,
    ],
    [
      "snapshot older than the last imported one",
      () => v1.replace('stanNaDzien="2026-09-23"', 'stanNaDzien="2026-09-22"'),
      /older than the last imported snapshot 2026-09-23/,
    ],
    [
      "9 of 11 products (below the 90% share)",
      () => v1Without("Oxbryta", "Oralair"),
      /the dump has 9 products, less than 90% of 11/,
    ],
    ["only the root element, on a non-empty database", () => xmlDoc(""), /the dump contains no human products/],
    ["text that is not XML", () => "this is not a registry file", /text data outside of root node/],
  ];

  it.each(cases)("%s", async (_name, build, message) => {
    const before = await fingerprint(scratch.client);
    const run = runImport(scratch.url, writeFile(build()));
    expect(run.stderr).toMatch(/^Registry import failed: /);
    expect(run.stderr).toMatch(message);
    expect(run.status).toBe(1);
    expect(await fingerprint(scratch.client)).toEqual(before);
  });

  it("a file that does not exist", async () => {
    const before = await fingerprint(scratch.client);
    const run = runImport(scratch.url, path.join(workDir, "missing.xml"));
    expect(run.stderr).toMatch(/^Registry import failed: .*ENOENT/);
    expect(run.status).toBe(1);
    expect(await fingerprint(scratch.client)).toEqual(before);
  });

  it("only the root element, on an empty database", async () => {
    await truncateRegistry(scratch.client);
    const before = await fingerprint(scratch.client);
    const run = runImport(scratch.url, writeFile(xmlDoc("")));
    expect(run.stderr).toMatch(/^Registry import failed: the dump contains no human products/);
    expect(run.status).toBe(1);
    expect(await fingerprint(scratch.client)).toEqual(before);
    expect(await counts()).toEqual({ products: 0, substances: 0, packages: 0 });
  });
});

describe("--dry-run", () => {
  it("rejects a file without human products, like the import does", () => {
    const run = runImport(scratch.url, writeFile(xmlDoc("")), { dryRun: true });
    expect(run.stderr).toMatch(/^Registry import failed: the dump contains no human products/);
    expect(run.status).toBe(1);
  });
});

describe("the 90% share is checked on both sides of the boundary", () => {
  it("10 of 11 products is imported and the missing one is marked removed", async () => {
    const run = runImport(scratch.url, writeFile(v1Without("Oxbryta")));
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect((await counts()).products).toBe(10);
    const { rows } = await scratch.client.query("select id::text from registry_products where removed_at is not null");
    expect(rows).toEqual([{ id: "100465932" }]); // Oxbryta
  });
});

describe("a dump larger than one batch (1 000 products)", () => {
  const TOTAL = 2001;
  const bigDump = (lastName = "Product 2001") => {
    const products: string[] = [];
    for (let id = 1; id <= TOTAL; id++) products.push(product(id, { name: id === TOTAL ? lastName : `Product ${id}` }));
    return xmlDoc(products.join(""));
  };

  it("imports every product, substance and package of the three batches", async () => {
    await truncateRegistry(scratch.client);
    const run = runImport(scratch.url, writeFile(bigDump()));
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(await counts()).toEqual({ products: TOTAL, substances: TOTAL, packages: TOTAL });
    const { rows } = await scratch.client.query(
      `select min(id)::text as first, max(id)::text as last,
              (select name from registry_products where id = 2001) as last_name,
              (select string_agg(s.name, ',') from registry_product_substances s where s.product_id = 2001) as last_substance,
              (select product_id::text from registry_packages where id = 1002001) as last_package_owner
       from registry_products`,
    );
    expect(rows[0]).toEqual({
      first: "1",
      last: "2001",
      last_name: "Product 2001",
      last_substance: "Substance 2001",
      last_package_owner: "2001",
    });
    const log = await scratch.client.query("select products_active, substances, packages_active from registry_imports");
    expect(log.rows).toEqual([{ products_active: TOTAL, substances: TOTAL, packages_active: TOTAL }]);
  });

  // The batches only go into `on commit drop` temp tables and the real tables are written after parsing ends, so this
  // proves the exit code and the untouched database after a parse error behind full batches. The rollback of work
  // already written to the real tables is proved by the impossible snapshot date case in the bad-files table.
  it("a parse error behind full batches exits 1 and leaves the database unchanged", async () => {
    const before = await fingerprint(scratch.client);
    const run = runImport(scratch.url, writeFile(bigDump("  ")));
    expect(run.stderr).toMatch(/^Registry import failed: product 2001 has an empty nazwaProduktu/);
    expect(run.status).toBe(1);
    expect(await fingerprint(scratch.client)).toEqual(before);
  });
});

describe("a good file lands untouched (tests/fixtures/rpl-real-shapes.xml)", () => {
  async function rows<T extends object>(sql: string): Promise<T[]> {
    return (await scratch.client.query<T>(sql)).rows;
  }

  beforeEach(async () => {
    await truncateRegistry(scratch.client);
    const run = runImport(scratch.url, REAL_SHAPES);
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });

  it("imports only the human products and the active packages", async () => {
    expect(await counts()).toEqual({ products: 8, substances: 5, packages: 11 });
    const veterinary = await rows("select id from registry_products where id = 100219110 or name = 'Trocoxil'");
    expect(veterinary).toEqual([]);
    const deleted = await rows("select id from registry_packages where id in (127235, 54460, 137424)");
    expect(deleted).toEqual([]); // skasowane="TAK" of Sivextro, and the packages of the veterinary Trocoxil
    expect(
      await rows("select snapshot_date::text, products_active, substances, packages_active from registry_imports"),
    ).toEqual([{ snapshot_date: "2026-10-21", products_active: 8, substances: 5, packages_active: 11 }]);
  });

  it("keeps a package of three units in order, with every field (Emend 115378)", async () => {
    const [pkg] = await rows<{ gtin: string; availability_category: string; units: unknown }>(
      "select gtin, availability_category, units from registry_packages where id = 115378",
    );
    expect(pkg.gtin).toBe("05901549325034");
    expect(pkg.availability_category).toBe("Rp");
    expect(pkg.units).toEqual([
      { count: "1", kind: "sasz.", capacity: "125", capacity_unit: "mg", info: null },
      { count: "2", kind: "dozowniki", capacity: null, capacity_unit: null, info: null },
      { count: "1", kind: "pojemnik", capacity: null, capacity_unit: null, info: "+ 1 nasadka" },
    ]);
  });

  it("keeps a line break from &#10; (Siiltibcy 100512983)", async () => {
    const [p] = await rows<{ strength: string; atc_codes: string[]; routes: string[]; previous_name: string | null }>(
      "select strength, atc_codes, routes, previous_name from registry_products where id = 100512983",
    );
    expect(p.strength).toBe("(0,5 mikrograma + 0,5 mikrograma)/ml \n(rdESAT-6 i rCFP-10)");
    expect(p.atc_codes).toEqual([]);
    expect(p.routes).toEqual(["śródskórna"]);
    expect(p.previous_name).toBeNull();
    const [s] = await rows<{ other_description: string }>(
      "select other_description from registry_product_substances where product_id = 100512983",
    );
    expect(s.other_description).toBe("(0,5 mikrograma + 0,5 mikrograma)/ml \n(rdESAT-6 i rCFP-10)");
  });

  it("stores no leaflet link for a product with only etykietoUlotka (pinned, Urtix 100105523)", async () => {
    const [p] = await rows<{
      leaflet_url: string | null;
      characteristic_url: string | null;
      authorization_validity: string;
    }>("select leaflet_url, characteristic_url, authorization_validity from registry_products where id = 100105523");
    expect(p.leaflet_url).toBeNull();
    expect(p.characteristic_url).toBe(
      "https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/10552/characteristic",
    );
    expect(p.authorization_validity).toBe("Bezterminowe");
  });

  it("keeps quotes, a trailing space and the BRAK code as they are", async () => {
    const [amaplantis] = await rows<{ holder: string; atc_codes: string[]; leaflet_url: string }>(
      "select marketing_authorization_holder as holder, atc_codes, leaflet_url from registry_products where id = 100436059",
    );
    expect(amaplantis.holder).toBe('Zakład Farmaceutyczny "Amara" Sp. z o.o.');
    expect(amaplantis.atc_codes).toEqual(["BRAK"]);
    expect(amaplantis.leaflet_url).toBe("https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/43605/leaflet");
    const [sivextro] = await rows<{ common_name: string }>(
      "select common_name from registry_products where id = 100342559",
    );
    expect(sivextro.common_name).toBe("Tedizolidi phosphas ");
  });

  it("takes the leaflet of a parallel import from ulotkaImportRownolegly (Elocom 100451606)", async () => {
    const [p] = await rows<{ leaflet_url: string; procedure_type: string }>(
      "select leaflet_url, procedure_type from registry_products where id = 100451606",
    );
    expect(p.leaflet_url).toBe(
      "https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/45160/parallel-import-files/LEAFLET/public",
    );
    expect(p.procedure_type).toBe("IR");
  });

  it("importing the same file again changes no data row", async () => {
    const dataTables = ["registry_products", "registry_product_substances", "registry_packages"] as const;
    const before = await fingerprint(scratch.client);
    const run = runImport(scratch.url, REAL_SHAPES);
    expect(run.status).toBe(0);
    const after = await fingerprint(scratch.client);
    for (const table of dataTables) expect(after[table], table).toBe(before[table]);
    expect((await rows("select id from registry_imports")).length).toBe(2); // only the log grows
  });
});

describe("the scratch database covers every registry migration", () => {
  // Limit: a registry migration that mentions `auth.` (e.g. an RLS policy using auth.uid()) matches too and would stay
  // out of REGISTRY_MIGRATIONS unnoticed; when adding such a migration, read this list by hand.
  it("each migration outside the list depends on auth or kit_items", () => {
    const others = readdirSync(MIGRATIONS_DIR).filter((file) => !REGISTRY_MIGRATIONS.includes(file));
    expect(others.length).toBeGreaterThan(0);
    for (const file of others) {
      expect(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"), file).toMatch(/\bauth\.|kit_items/);
    }
    for (const file of REGISTRY_MIGRATIONS) expect(readdirSync(MIGRATIONS_DIR)).toContain(file);
  });
});
