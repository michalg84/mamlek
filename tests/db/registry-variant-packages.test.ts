// Tests of public.registry_variant_packages() on a real local database, on synthetic products and packages that are
// rolled back: it returns every package of the variant (the products sharing the variant key of the given product),
// withdrawn ones included, flagged with `withdrawn`, active before withdrawn. The expected values come from the plan of
// withdrawn-medicine-in-kit (a package is withdrawn when it or its product is withdrawn; order: active first, then the
// given product's packages, then product id and package id), not from running the function.
import type pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { World, actAs, actAsAnon, connectLocal, expectSqlError } from "./medicine-check-fixtures";

const w = new World();
const UNKNOWN_PRODUCT = 9_000_000_999;

// --- A variant with active and withdrawn products and packages ----------------------------------------------------
// The three products share the variant key in different letter cases, like a parallel import.
const mixedA = w.product({ name: "Mixedvar", strength: "10 mg", form: "tabletki", commonName: null, substances: [] });
const mixedB = w.product({
  name: "MIXEDVAR",
  strength: "10 MG",
  form: "Tabletki",
  commonName: null,
  substances: [],
  removed: true,
});
const mixedC = w.product({
  name: "mixedvar",
  strength: "10 mg",
  form: "TABLETKI",
  commonName: null,
  substances: [],
  holder: "Holder C",
});
const mixedAExtra = w.extraPackage(mixedA); // a further active package of the active product A
const mixedAWithdrawn = w.extraPackage(mixedA, { removed: true }); // a withdrawn package of the active product A
const mixedCWithdrawn = w.extraPackage(mixedC, { removed: true }); // a withdrawn package of the active product C

// --- A variant withdrawn as a whole --------------------------------------------------------------------------------
const goneD = w.product({
  name: "Gonevar",
  strength: "5 mg",
  form: "kapsułki",
  commonName: null,
  substances: [],
  removed: true,
});
const goneE = w.product({
  name: "GONEVAR",
  strength: "5 MG",
  form: "Kapsułki",
  commonName: null,
  substances: [],
  removed: true,
});
const goneDExtra = w.extraPackage(goneD); // an active package of a withdrawn product

const user = w.user();

let client: pg.Client;

beforeAll(async () => {
  client = await connectLocal();
  await client.query("begin");
  await w.seed(client);
});

afterAll(async () => {
  await client.query("rollback").catch(() => undefined);
  await client.end().catch(() => undefined);
});

// A failed statement aborts the transaction; a savepoint per test keeps one failure from failing the rest.
beforeEach(async () => {
  await client.query("savepoint t");
});

afterEach(async () => {
  await client.query("rollback to savepoint t");
  await client.query("release savepoint t");
});

interface Row {
  package_id: string;
  product_id: string;
  withdrawn: boolean;
}

/** [package id, product id, withdrawn] of every package the function returns, in the order it returns them. */
async function packagesOf(productId: number): Promise<[string, string, boolean][]> {
  await actAs(client, user);
  const { rows } = await client.query<Row>("select * from public.registry_variant_packages($1::bigint)", [productId]);
  return rows.map((row) => [row.package_id, row.product_id, row.withdrawn]);
}

const row = (packageId: number, productId: number, withdrawn: boolean): [string, string, boolean] => [
  String(packageId),
  String(productId),
  withdrawn,
];

describe("registry_variant_packages: a variant with active and withdrawn products and packages", () => {
  it("returns every package, active before withdrawn, the given product's first in each group", async () => {
    // Asked for C (neither the lowest id nor the withdrawn one), so "the given product first" shows apart from the id order.
    expect(await packagesOf(mixedC.id)).toEqual([
      // Active: C's own package, then the packages of A (by package id).
      row(mixedC.packageId, mixedC.id, false),
      row(mixedA.packageId, mixedA.id, false),
      row(mixedAExtra, mixedA.id, false),
      // Withdrawn: C's withdrawn package, then A's withdrawn package, then the package of the withdrawn product B.
      row(mixedCWithdrawn, mixedC.id, true),
      row(mixedAWithdrawn, mixedA.id, true),
      row(mixedB.packageId, mixedB.id, true),
    ]);
  });

  it("flags a withdrawn package and a package of a withdrawn product, and nothing else", async () => {
    const withdrawn = (await packagesOf(mixedA.id)).filter(([, , flag]) => flag).map(([packageId]) => packageId);

    // Withdrawn group in order: A's own withdrawn package first (A is the given product), then by product id: B, C.
    expect(withdrawn).toEqual([mixedAWithdrawn, mixedB.packageId, mixedCWithdrawn].map(String));
  });

  it("asked for a withdrawn product, still returns the whole variant with the given product's packages first in its group", async () => {
    expect(await packagesOf(mixedB.id)).toEqual([
      // Active: nobody in this group is the given product, so product id, then package id.
      row(mixedA.packageId, mixedA.id, false),
      row(mixedAExtra, mixedA.id, false),
      row(mixedC.packageId, mixedC.id, false),
      // Withdrawn: B's own package first, then A's, then C's.
      row(mixedB.packageId, mixedB.id, true),
      row(mixedAWithdrawn, mixedA.id, true),
      row(mixedCWithdrawn, mixedC.id, true),
    ]);
  });

  it("keeps the columns and the product's holder next to the flag", async () => {
    await actAs(client, user);

    const result = await client.query<Row & { marketing_authorization_holder: string | null }>(
      "select * from public.registry_variant_packages($1::bigint)",
      [mixedC.id],
    );

    expect(result.fields.map((field) => field.name)).toEqual([
      "package_id",
      "product_id",
      "gtin",
      "availability_category",
      "units",
      "marketing_authorization_holder",
      "withdrawn",
    ]);
    const own = result.rows.find((r) => r.package_id === String(mixedC.packageId));
    expect(own?.marketing_authorization_holder).toBe("Holder C");
  });
});

describe("registry_variant_packages: a variant withdrawn as a whole", () => {
  it("returns its packages, all flagged withdrawn (also an active package of a withdrawn product)", async () => {
    expect(await packagesOf(goneD.id)).toEqual([
      row(goneD.packageId, goneD.id, true),
      row(goneDExtra, goneD.id, true),
      row(goneE.packageId, goneE.id, true),
    ]);
  });
});

describe("registry_variant_packages: other callers and ids", () => {
  it("an unknown product id gives an empty result", async () => {
    expect(await packagesOf(UNKNOWN_PRODUCT)).toEqual([]);
  });

  it("anon cannot call it", async () => {
    await actAsAnon(client);

    await expectSqlError(client, "select * from public.registry_variant_packages($1::bigint)", [mixedA.id], "42501");
  });
});
