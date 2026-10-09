// Medicine check rule check: verifies public.medicine_check() (same medicine / same active substance / no match,
// research decisions D1–D3) on synthetic registry rows, users and kit items. Everything is inserted in one
// transaction that is always rolled back, so nothing is left behind and the result does not depend on the registry
// contents (any migrated database works). Used by the CI smoke job.
//
//   DATABASE_URL=postgresql://... node scripts/medicine-check-check.mjs

import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Medicine check check failed: DATABASE_URL is not set");
  process.exit(1);
}

// Synthetic ids start far above the fixtures (and the real registry). Package id = product id + 1000.
const P = {
  sortis: 9_000_000_001,
  sortisParallel: 9_000_000_002, // same variant key in a different letter case (parallel import)
  sortisRemoved: 9_000_000_003, // same variant key, product withdrawn
  atoris: 9_000_000_004, // same common name as Sortis, different salt in the substances
  metafen: 9_000_000_005,
  lizymax: 9_000_000_006, // different common name, same substance as Metafen
  smecta: 9_000_000_007, // no substances
  diosmectite: 9_000_000_008, // same common name as Smecta, with a substance
  afronis: 9_000_000_009, // common name "Preparat złożony"
  aromaActiv: 9_000_000_010, // common name "Preparat złożony", different substances
  herbalA: 9_000_000_011, // only substance "Preparat złożony", generic common name
  herbalB: 9_000_000_012, // only substance "Preparat złożony", generic common name
  homeoA: 9_000_000_013, // no substances, generic common name
  homeoB: 9_000_000_014, // no substances, same generic common name
};
const pkg = (productId) => productId + 1000;
const SORTIS_REMOVED_PACKAGE = 9_000_002_001; // withdrawn package of the active Sortis product
const UNKNOWN_PRODUCT = 9_000_000_999;

// [id, name, strength, form, common name, removed, substances in position order]
const PRODUCTS = [
  [P.sortis, "Sortis", "20 mg", "tabletki powlekane", "Atorvastatinum", false, ["Atorvastatinum calcicum trihydricum"]],
  [
    P.sortisParallel,
    "SORTIS",
    "20 MG",
    "Tabletki powlekane",
    "Atorvastatinum",
    false,
    ["Atorvastatinum calcicum trihydricum"],
  ],
  [
    P.sortisRemoved,
    "Sortis",
    "20 mg",
    "tabletki powlekane",
    "Atorvastatinum",
    true,
    ["Atorvastatinum calcicum trihydricum"],
  ],
  [P.atoris, "Atoris", "20 mg", "tabletki powlekane", "Atorvastatinum", false, ["Atorvastatinum calcicum"]],
  [P.metafen, "Metafen", "200 mg", "tabletki", "Ibuprofenum", false, ["Ibuprofenum"]],
  [P.lizymax, "Lizymax", "342 mg", "tabletki powlekane", "Ibuprofenum lysinum", false, [" ibuprofenum "]],
  [P.smecta, "Smecta", "3 g", "proszek do sporządzania zawiesiny doustnej", "Diosmectitum", false, []],
  [P.diosmectite, "Diosmectite Synthetic", "3 g", "proszek", "Diosmectitum", false, ["Diosmectitum"]],
  [P.afronis, "Afronis", null, "tabletki do ssania", "Preparat złożony", false, ["Mentholum", "Eucalypti aetheroleum"]],
  [
    P.aromaActiv,
    "Aroma-Activ",
    null,
    "tabletki do ssania",
    "Preparat złożony",
    false,
    ["Mentholum", "Pini aetheroleum"],
  ],
  [P.herbalA, "Herbal A", null, "tabletki", "Produkt złożony", false, ["Preparat złożony"]],
  [P.herbalB, "Herbal B", null, "krople", "Produkt ziołowy", false, ["Preparat złożony"]],
  [P.homeoA, "Homeo A", null, "granulki", "Homeopatyczny produkt leczniczy", false, []],
  [P.homeoB, "Homeo B", null, "krople", "Homeopatyczny produkt leczniczy", false, []],
];

// One synthetic account per case, so every case sees exactly its own kit.
const user = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// [label, user, package id, expires_on, expiry_precision]
const KIT = [
  ["same", user(1), pkg(P.sortis), null, null],
  ["parallel", user(2), pkg(P.sortisParallel), null, null],
  ["removedPackage", user(3), SORTIS_REMOVED_PACKAGE, null, null],
  ["removedProduct", user(3), pkg(P.sortisRemoved), null, null],
  ["atoris", user(4), pkg(P.atoris), null, null],
  ["lizymax", user(5), pkg(P.lizymax), null, null],
  ["diosmectite", user(6), pkg(P.diosmectite), null, null],
  ["aromaActiv", user(7), pkg(P.aromaActiv), null, null],
  ["herbalB", user(8), pkg(P.herbalB), null, null],
  ["otherMedicine", user(9), pkg(P.atoris), null, null],
  ["homeoB", user(10), pkg(P.homeoB), null, null],
  // user(11) has an empty kit; user(1) owns a variant match of Sortis.
  ["orderNoDate", user(13), pkg(P.sortis), null, null],
  ["orderLater", user(13), pkg(P.sortis), "2030-12-31", "day"],
  ["orderExpired", user(13), pkg(P.sortis), "2020-01-31", "month"],
  ["orderSubstance", user(13), pkg(P.atoris), "2019-06-30", "month"],
];

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const ids = {}; // kit item label -> kit_items.id

async function setup() {
  for (const [id, name, strength, form, commonName, removed, substances] of PRODUCTS) {
    await client.query(
      `insert into registry_products (id, name, strength, pharmaceutical_form, common_name, removed_at)
       values ($1, $2, $3, $4, $5, case when $6 then now() end)`,
      [id, name, strength, form, commonName, removed],
    );
    for (const [index, substance] of substances.entries()) {
      await client.query("insert into registry_product_substances (product_id, position, name) values ($1, $2, $3)", [
        id,
        index + 1,
        substance,
      ]);
    }
    await client.query("insert into registry_packages (id, product_id) values ($1, $2)", [pkg(id), id]);
  }
  await client.query("insert into registry_packages (id, product_id, removed_at) values ($1, $2, now())", [
    SORTIS_REMOVED_PACKAGE,
    P.sortis,
  ]);
  const users = [...new Set([...KIT.map(([, u]) => u), user(11)])];
  await client.query("insert into auth.users (id) select unnest($1::uuid[])", [users]);
  // As the owner (RLS does not apply); user_id is explicit because its default is auth.uid().
  for (const [label, owner, packageId, expiresOn, precision] of KIT) {
    const { rows } = await client.query(
      `insert into kit_items (user_id, package_id, expires_on, expiry_precision)
       values ($1, $2, $3, $4) returning id::int as id`,
      [owner, packageId, expiresOn, precision],
    );
    ids[label] = rows[0].id;
  }
  await client.query("set local role authenticated");
}

// Calls the RPC as the API role authenticated, signed in as the given synthetic user.
async function checkAs(userId, productId) {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  const { rows } = await client.query("select public.medicine_check($1::bigint) as value", [productId]);
  return rows[0].value;
}

// Compact view of the matched items: [id, match, matchedBy, withdrawn].
const summary = (result) => result?.items?.map((i) => [i.id, i.match, i.matchedBy, i.withdrawn]);
// jsonb reorders object keys, so objects are compared with sorted keys.
const sorted = (value) =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, sorted(value[key])]),
        )
      : value;
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

const checks = [
  [
    "same product",
    () => checkAs(user(1), P.sortis),
    (v) =>
      same(summary(v), [[ids.same, "variant", null, false]]) &&
      v.comparable === true &&
      same(v.searched, {
        id: P.sortis,
        name: "Sortis",
        strength: "20 mg",
        form: "tabletki powlekane",
        commonName: "Atorvastatinum",
        substances: ["Atorvastatinum calcicum trihydricum"],
      }),
    "one variant item (matchedBy null), comparable, full searched product",
  ],
  [
    "parallel import (other id, same key in other letter case)",
    () => checkAs(user(2), P.sortis),
    (v) => same(summary(v), [[ids.parallel, "variant", null, false]]),
    "one variant item",
  ],
  [
    "withdrawn package and withdrawn product in the kit",
    () => checkAs(user(3), P.sortis),
    (v) =>
      v?.items?.length === 2 &&
      v.items.every((i) => i.match === "variant" && i.withdrawn === true) &&
      same(v.items.map((i) => i.id).sort(), [ids.removedPackage, ids.removedProduct].sort()),
    "both items, variant, withdrawn: true",
  ],
  [
    "Sortis vs Atoris (same common name, different salt)",
    () => checkAs(user(4), P.sortis),
    (v) => same(summary(v), [[ids.atoris, "substance", "common_name", false]]),
    "substance, matchedBy common_name",
  ],
  [
    "Metafen vs Lizymax (different common name, same substance)",
    () => checkAs(user(5), P.metafen),
    (v) => same(summary(v), [[ids.lizymax, "substance", "substances", false]]),
    "substance, matchedBy substances",
  ],
  [
    "Smecta without substances vs Diosmectitum",
    () => checkAs(user(6), P.smecta),
    (v) => v?.comparable === true && same(summary(v), [[ids.diosmectite, "substance", "common_name", false]]),
    "comparable, substance, matchedBy common_name",
  ],
  [
    'common name "Preparat złożony", different substances',
    () => checkAs(user(7), P.afronis),
    (v) => v?.comparable === true && same(v.items, []),
    "comparable, no items",
  ],
  [
    'only substance "Preparat złożony" and a generic common name',
    () => checkAs(user(8), P.herbalA),
    (v) => v !== null && same(v.items, []),
    "no items",
  ],
  ["other medicine", () => checkAs(user(9), P.metafen), (v) => v !== null && same(v.items, []), "no items"],
  [
    "searched without substances and with a generic common name",
    () => checkAs(user(10), P.homeoA),
    (v) => v?.comparable === false && same(v.items, []),
    "comparable: false, no items",
  ],
  ["unknown id", () => checkAs(user(1), UNKNOWN_PRODUCT), (v) => v === null, "null"],
  [
    "other user's variant item stays hidden (RLS)",
    () => checkAs(user(11), P.sortis),
    (v) => v !== null && same(v.items, []),
    "no items",
  ],
  [
    "order: variant first, expired, later date, no date",
    () => checkAs(user(13), P.sortis),
    (v) =>
      same(
        v?.items?.map((i) => i.id),
        [ids.orderExpired, ids.orderLater, ids.orderNoDate, ids.orderSubstance],
      ) &&
      v.items[0].expiresOn === "2020-01-31" &&
      v.items[0].expiryPrecision === "month",
    "expired, later, no date (variant), then the substance item",
  ],
];

let failed = 0;
try {
  await client.query("begin");
  await setup();
  for (const [name, run, ok, expected] of checks) {
    let actual;
    let passed = false;
    try {
      actual = await run();
      passed = ok(actual);
    } catch (error) {
      // A failed statement aborts the transaction, so the remaining checks fail with the same cause.
      actual = `error: ${error instanceof Error ? error.message : String(error)}`;
    }
    const shown = actual && typeof actual === "object" && "items" in actual ? summary(actual) : actual;
    console.log(`${passed ? "PASS" : "FAIL"}  ${name}  -> ${JSON.stringify(shown)}`);
    if (!passed) {
      failed++;
      console.log(`      expected ${expected}`);
    }
  }
} catch (error) {
  console.log(`FAIL  setup  -> error: ${error instanceof Error ? error.message : String(error)}`);
  failed++;
} finally {
  await client.query("rollback").catch(() => undefined);
  await client.end().catch(() => undefined);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll medicine check checks passed");
process.exit(failed ? 1 : 0);
