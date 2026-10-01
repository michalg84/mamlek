// Registry import check: verifies the database state after importing the fixtures in the order v1, v1, v2
// (scripts/fixtures/rpl-sample-v{1,2}.xml) into a freshly migrated database. Used by the CI smoke job.
//
//   DATABASE_URL=postgresql://... node scripts/registry-import-check.mjs

import pg from "pg";

const CRESTOR = "100434824"; // human product dropped in v2
const SINUPRET = "100333603"; // renamed in v2
const VARENZIN = "100538334"; // veterinary product, must never be imported
const DELETED_PACKAGE = "4"; // flipped to skasowane="TAK" in v2 (its product stays active)

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Registry import check failed: DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

async function value(sql, params = []) {
  const { rows } = await client.query(sql, params);
  return rows[0]?.value ?? null;
}

// Counts registry_products as the given API role; RLS applies because the role is not the table owner.
async function countAs(role) {
  await client.query("begin");
  try {
    await client.query(`set local role ${role}`);
    return await value("select count(*)::int as value from registry_products");
  } finally {
    await client.query("rollback");
  }
}

const checks = [
  [
    "active products",
    () => value("select count(*)::int as value from registry_products where removed_at is null"),
    (v) => v === 11,
    "11",
  ],
  [
    "removed products",
    () => value("select array_agg(id::text order by id) as value from registry_products where removed_at is not null"),
    (v) => v?.length === 1 && v[0] === CRESTOR,
    `[${CRESTOR}] (Crestor)`,
  ],
  [
    "no veterinary products",
    () => value("select count(*)::int as value from registry_products where id = $1", [VARENZIN]),
    (v) => v === 0,
    "0",
  ],
  [
    "renamed product",
    () => value("select name as value from registry_products where id = $1", [SINUPRET]),
    (v) => v === "Sinupret Zmieniony",
    "Sinupret Zmieniony",
  ],
  [
    "deleted package marked removed",
    () =>
      value(
        `select pkg.removed_at is not null and p.removed_at is null as value
         from registry_packages pkg join registry_products p on p.id = pkg.product_id where pkg.id = $1`,
        [DELETED_PACKAGE],
      ),
    (v) => v === true,
    "removed_at set on the package, product still active",
  ],
  [
    "active packages",
    () => value("select count(*)::int as value from registry_packages where removed_at is null"),
    (v) => v === 20,
    "20",
  ],
  [
    "substance rows",
    () => value("select count(*)::int as value from registry_product_substances"),
    (v) => v === 35,
    "35",
  ],
  [
    "import log",
    () =>
      value("select array_agg(snapshot_date::text order by id) as value from registry_imports").then((v) =>
        (v ?? []).join(", "),
      ),
    (v) => v === "2026-09-23, 2026-09-23, 2026-09-24",
    "2026-09-23, 2026-09-23, 2026-09-24",
  ],
  ["RLS hides products from anon", () => countAs("anon"), (v) => v === 0, "0"],
  ["RLS shows products to authenticated", () => countAs("authenticated"), (v) => v > 0, "> 0"],
];

let failed = 0;
try {
  for (const [name, run, ok, expected] of checks) {
    let actual;
    let passed = false;
    try {
      actual = await run();
      passed = ok(actual);
    } catch (error) {
      actual = `error: ${error instanceof Error ? error.message : String(error)}`;
    }
    console.log(`${passed ? "PASS" : "FAIL"}  ${name}  -> ${JSON.stringify(actual)}`);
    if (!passed) {
      failed++;
      console.log(`      expected ${expected}`);
    }
  }
} finally {
  await client.end().catch(() => undefined);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll registry import checks passed");
process.exit(failed ? 1 : 0);
