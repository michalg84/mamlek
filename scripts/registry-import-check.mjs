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

// Counts rows of a registry table as the given API role; RLS applies because the role is not the table owner.
async function countAs(role, table = "registry_products") {
  await client.query("begin");
  try {
    await client.query(`set local role ${role}`);
    return await value(`select count(*)::int as value from ${table}`);
  } finally {
    await client.query("rollback");
  }
}

// Calls registry_refresh_search_list() as the given API role; returns "ok" or the Postgres error code.
async function refreshAs(role) {
  await client.query("begin");
  try {
    await client.query(`set local role ${role}`);
    await client.query("select public.registry_refresh_search_list()");
    return "ok";
  } catch (error) {
    return error?.code ?? String(error);
  } finally {
    await client.query("rollback");
  }
}

// Variant collapse on synthetic rows (the fixtures have no duplicate variants). Runs in a transaction that is
// always rolled back, so nothing is left behind. Ids start high to stay clear of the fixtures.
//   900000001  removed, NAR, lowest id    -> must be ignored (removed_at is set)
//   900000002  active, IR                 -> loses to the non-IR product
//   900000003  active, NAR                -> the representative
// All three differ only by letter case, so they form one variant.
async function syntheticCollapse() {
  await client.query("begin");
  try {
    const before = await value(
      "select jsonb_build_object('version', version, 'variants', variant_count) as value from registry_search_list",
    );
    await client.query(`insert into registry_products (id, name, strength, pharmaceutical_form, procedure_type, removed_at)
      values
        (900000001, 'Synthetic Variant', '10 mg', 'tabletki', 'NAR', now()),
        (900000002, 'SYNTHETIC VARIANT', '10 MG', 'Tabletki', 'IR', null),
        (900000003, 'Synthetic variant', '10 Mg', 'TABLETKI', 'NAR', null)`);
    await client.query("select public.registry_refresh_search_list()");
    const after = await value(`select jsonb_build_object(
        'version', l.version,
        'variants', l.variant_count,
        'listed', jsonb_array_length(l.payload::jsonb -> 'variants'),
        'ids', (select coalesce(jsonb_agg(v -> 0), '[]'::jsonb)
                from jsonb_array_elements(l.payload::jsonb -> 'variants') v
                where lower(v ->> 1) = 'synthetic variant')
      ) as value from registry_search_list l`);
    return { before, after };
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
  [
    "search list is current",
    () =>
      value(
        `select (select count(*) from registry_search_list) = 1
           and exists (
             select 1 from registry_search_list l
             where l.import_id = (select max(id) from registry_imports)
               and l.snapshot_date = (select snapshot_date from registry_imports order by id desc limit 1)
           ) as value`,
      ),
    (v) => v === true,
    "one row, import_id = latest import, snapshot_date = date of the latest import",
  ],
  [
    "search list variant count",
    () =>
      value(
        `select jsonb_build_object(
          'count', l.variant_count,
          'distinct', (select count(*) from (
            select distinct lower(name), lower(coalesce(strength, '')), lower(coalesce(pharmaceutical_form, ''))
            from registry_products where removed_at is null
          ) keys),
          'listed', jsonb_array_length(l.payload::jsonb -> 'variants')
        ) as value from registry_search_list l`,
      ),
    (v) => v !== null && v.count > 0 && v.count === v.distinct && v.count === v.listed,
    "variant_count = distinct variant keys of active products = payload.variants length (> 0)",
  ],
  [
    "search list version",
    () =>
      value(
        "select jsonb_build_object('version', version, 'payload', (payload::jsonb ->> 'version')::bigint) as value from registry_search_list",
      ),
    (v) => v !== null && v.version >= 1 && v.version === v.payload,
    "payload.version = version (>= 1)",
  ],
  [
    "search list content",
    () =>
      value(
        `select jsonb_build_object(
          'crestor', exists (select 1 from jsonb_array_elements(l.payload::jsonb -> 'variants') v where v ->> 0 = $1),
          'varenzin', exists (select 1 from jsonb_array_elements(l.payload::jsonb -> 'variants') v where v ->> 0 = $2),
          'sinupret', (select v ->> 1 from jsonb_array_elements(l.payload::jsonb -> 'variants') v where v ->> 0 = $3)
        ) as value from registry_search_list l`,
        [CRESTOR, VARENZIN, SINUPRET],
      ),
    (v) => v !== null && v.crestor === false && v.varenzin === false && v.sinupret === "Sinupret Zmieniony",
    `no Crestor, no Varenzin, Sinupret named "Sinupret Zmieniony"`,
  ],
  ["RLS hides search list from anon", () => countAs("anon", "registry_search_list"), (v) => v === 0, "0"],
  [
    "RLS shows search list to authenticated",
    () => countAs("authenticated", "registry_search_list"),
    (v) => v === 1,
    "1",
  ],
  [
    "authenticated cannot refresh search list",
    () => refreshAs("authenticated"),
    (v) => v === "42501",
    "42501 (insufficient_privilege)",
  ],
  [
    "variant collapse (synthetic rows, rolled back)",
    syntheticCollapse,
    ({ before, after }) =>
      after.ids.length === 1 &&
      after.ids[0] === 900000003 &&
      after.variants === before.variants + 1 &&
      after.listed === after.variants &&
      after.version > before.version,
    "one variant with the active non-IR product (900000003), variants +1, version grows",
  ],
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
