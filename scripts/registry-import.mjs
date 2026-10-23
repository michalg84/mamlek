// Registry import: loads the RPL XML export (v6.0.0) into the registry_* tables in one transaction.
// Streams the XML into temporary tables, runs the safety checks, then upserts products and packages
// (rows missing from the export get removed_at, never DELETE) and replaces substances per product.
// Finally it rebuilds the search suggestions list (registry_refresh_search_list(), one row of variants for the
// browser) in the same transaction, after the import log entry.
// Any error rolls the whole import back and exits with a non-zero code.
//
//   DATABASE_URL=postgresql://... node scripts/registry-import.mjs                 # download from RPL
//   DATABASE_URL=postgresql://... node scripts/registry-import.mjs --file dump.xml # local file
//   node scripts/registry-import.mjs --file dump.xml --dry-run                      # parse only, no database

import { createReadStream, readFileSync } from "node:fs";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";
import pg from "pg";
import { parseRpl } from "./lib/rpl-parser.mjs";

const RPL_URL = "https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/public-pl-report/6.0.0/overall.xml";
const BATCH_SIZE = 1000;
// A dump with fewer products, substances or packages than this share of the active ones is treated as broken
// (truncated, empty, or with renamed elements).
const MIN_SHARE = 0.9;
// Supabase root certificate (Dashboard -> Project Settings -> Database -> SSL Configuration). Every non-local
// connection must use TLS and present a server certificate signed by it, so the password never travels in clear
// text and an impostor server is rejected.
const SUPABASE_CA_FILE = fileURLToPath(new URL("../supabase/prod-ca-2021.crt", import.meta.url));
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
// pg_advisory_xact_lock key shared by all registry imports.
const IMPORT_LOCK_KEY = 2026100101;

class ImportError extends Error {}
class UsageError extends Error {}

function parseArgs(argv) {
  const options = { file: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--file") {
      const file = argv[++i];
      if (!file || file.startsWith("--")) throw new UsageError("--file needs a path");
      options.file = file;
    } else throw new UsageError(`Unknown argument "${arg}". Supported: --file <path>, --dry-run.`);
  }
  return options;
}

// Invalid UTF-8 aborts the import instead of being replaced with U+FFFD.
async function* decodeUtf8(chunks) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for await (const chunk of chunks) yield decoder.decode(chunk, { stream: true });
  const rest = decoder.decode();
  if (rest) yield rest;
}

async function* downloadText(url) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new ImportError(`download failed: HTTP ${response.status} from ${url}`);
  yield* decodeUtf8(response.body);
}

// Opened lazily on the first read, so a missing file surfaces as a normal error inside the import.
async function* readText(file) {
  yield* decodeUtf8(createReadStream(file));
}

function openSource(file) {
  if (file) return { label: path.basename(file), text: readText(file) };
  return { label: RPL_URL, text: downloadText(RPL_URL) };
}

// Column lists shared by the temporary tables, the json batch inserts and the upserts.
const PRODUCT_COLUMNS = {
  id: "bigint",
  name: "text",
  common_name: "text",
  previous_name: "text",
  strength: "text",
  pharmaceutical_form: "text",
  marketing_authorization_holder: "text",
  procedure_type: "text",
  authorization_number: "text",
  authorization_validity: "text",
  atc_codes: "text[]",
  routes: "text[]",
  leaflet_url: "text",
  characteristic_url: "text",
};
const SUBSTANCE_COLUMNS = {
  product_id: "bigint",
  position: "smallint",
  name: "text",
  amount: "text",
  unit: "text",
  preparation_amount: "text",
  preparation_unit: "text",
  other_description: "text",
};
const PACKAGE_COLUMNS = {
  id: "bigint",
  product_id: "bigint",
  gtin: "text",
  availability_category: "text",
  units: "jsonb",
};

const columnDefs = (columns) =>
  Object.entries(columns)
    .map(([name, type]) => `${name} ${type}`)
    .join(", ");
const columnNames = (columns, prefix = "") =>
  Object.keys(columns)
    .map((name) => prefix + name)
    .join(", ");

// One parameter per batch: rows travel as a JSON array, so the 65 535 parameter limit never applies.
async function insertJson(client, table, columns, rows) {
  if (!rows.length) return;
  await client.query(
    `insert into ${table} (${columnNames(columns)})
     select ${columnNames(columns)} from jsonb_to_recordset($1::jsonb) as x(${columnDefs(columns)})`,
    [JSON.stringify(rows)],
  );
}

function upsertSql(table, columns) {
  const data = Object.keys(columns).filter((name) => name !== "id");
  return `insert into ${table} (${columnNames(columns)}, removed_at)
    select ${columnNames(columns)}, null::timestamptz from tmp_${table}
    on conflict (id) do update set ${data.map((name) => `${name} = excluded.${name}`).join(", ")},
      removed_at = null, updated_at = now()
    where (${data.map((name) => `${table}.${name}`).join(", ")}, ${table}.removed_at)
      is distinct from (${data.map((name) => `excluded.${name}`).join(", ")}, excluded.removed_at)`;
}

async function loadBatch(client, products, counts) {
  const productRows = [];
  const substanceRows = [];
  const packageRows = [];
  for (const { substances, packages, ...product } of products) {
    productRows.push(product);
    for (const substance of substances) substanceRows.push({ product_id: product.id, ...substance });
    for (const pkg of packages) packageRows.push({ product_id: product.id, ...pkg });
  }
  await insertJson(client, "tmp_registry_products", PRODUCT_COLUMNS, productRows);
  await insertJson(client, "tmp_registry_product_substances", SUBSTANCE_COLUMNS, substanceRows);
  await insertJson(client, "tmp_registry_packages", PACKAGE_COLUMNS, packageRows);
  counts.products += productRows.length;
  counts.substances += substanceRows.length;
  counts.packages += packageRows.length;
}

// Local Supabase (dev, CI) has no TLS. Anything else gets a verified TLS connection; an sslmode in the URL would
// override this, so it is rejected.
function sslOptions(databaseUrl) {
  const url = new URL(databaseUrl);
  if (LOCAL_HOSTS.has(url.hostname)) return false;
  if (url.searchParams.has("sslmode") || url.searchParams.has("ssl")) {
    throw new UsageError("Remove sslmode/ssl from DATABASE_URL: the import always verifies TLS for remote hosts.");
  }
  return { ca: readFileSync(SUPABASE_CA_FILE, "utf8") };
}

async function importToDatabase(databaseUrl, source, startedAt) {
  const client = new pg.Client({ connectionString: databaseUrl, ssl: sslOptions(databaseUrl) });
  // A dropped connection (e.g. while the client idles during the download) is emitted, not thrown; keep it so the
  // import fails with that cause instead of an uncaught exception.
  let connectionError = null;
  client.on("error", (error) => {
    connectionError ??= error;
  });
  await client.connect();
  try {
    await client.query("begin");
    // One import at a time per database (the workflow's concurrency group does not cover local runs).
    const {
      rows: [lock],
    } = await client.query("select pg_try_advisory_xact_lock($1) as acquired", [IMPORT_LOCK_KEY]);
    if (!lock.acquired) throw new ImportError("another registry import is running on this database");
    await client.query("set local statement_timeout = 0");
    // Readers never conflict with the import; waiting on a lock means another writer, so fail fast instead.
    await client.query("set local lock_timeout = '30s'");

    // 1. Temporary tables (primary keys reject duplicate ids in the dump).
    await client.query(`create temp table tmp_registry_products (${columnDefs(PRODUCT_COLUMNS)}, primary key (id))
      on commit drop`);
    await client.query(`create temp table tmp_registry_product_substances (${columnDefs(SUBSTANCE_COLUMNS)},
      primary key (product_id, position)) on commit drop`);
    await client.query(`create temp table tmp_registry_packages (${columnDefs(PACKAGE_COLUMNS)}, primary key (id))
      on commit drop`);

    // 2. Batch inserts while streaming; a parse error (including a truncated file) aborts here.
    const { snapshotDate, products, stats } = await parseRpl(source.text);
    const dump = { products: 0, substances: 0, packages: 0 };
    let batch = [];
    for await (const product of products) {
      batch.push(product);
      if (batch.length >= BATCH_SIZE) {
        await loadBatch(client, batch, dump);
        batch = [];
      }
    }
    await loadBatch(client, batch, dump);
    // A file without a single human product is never a valid registry, whatever the database holds.
    if (dump.products === 0) throw new ImportError("the dump contains no human products");

    // 3. Safety checks (the namespace is checked by the parser).
    const {
      rows: [state],
    } = await client.query(`select
        (select max(snapshot_date)::text from registry_imports) as last_snapshot,
        (select count(*)::int from registry_products where removed_at is null) as products,
        (select count(*)::int from registry_product_substances s
          join registry_products p on p.id = s.product_id where p.removed_at is null) as substances,
        (select count(*)::int from registry_packages where removed_at is null) as packages`);
    if (state.last_snapshot && snapshotDate < state.last_snapshot) {
      throw new ImportError(
        `stanNaDzien ${snapshotDate} is older than the last imported snapshot ${state.last_snapshot}`,
      );
    }
    // Skipped while the tables are empty (first import).
    for (const kind of ["products", "substances", "packages"]) {
      if (state[kind] > 0 && dump[kind] < state[kind] * MIN_SHARE) {
        throw new ImportError(
          `the dump has ${dump[kind]} ${kind}, less than ${MIN_SHARE * 100}% of ${state[kind]} active ones`,
        );
      }
    }

    // 4. Products: upsert (a returning product becomes active again), unchanged rows are not rewritten.
    await client.query(upsertSql("registry_products", PRODUCT_COLUMNS));
    // 5. Active products missing from the dump.
    const removed = await client.query(`update registry_products p set removed_at = now(), updated_at = now()
      where p.removed_at is null and not exists (select 1 from tmp_registry_products t where t.id = p.id)`);
    // 6. Substances: replaced for every product in the dump.
    await client.query(`delete from registry_product_substances s using tmp_registry_products t
      where s.product_id = t.id`);
    await client.query(`insert into registry_product_substances (${columnNames(SUBSTANCE_COLUMNS)})
      select ${columnNames(SUBSTANCE_COLUMNS)} from tmp_registry_product_substances`);
    // 7. Packages: upsert, then mark active packages missing from the dump (or now skasowane) as removed.
    await client.query(upsertSql("registry_packages", PACKAGE_COLUMNS));
    await client.query(`update registry_packages p set removed_at = now(), updated_at = now()
      where p.removed_at is null and not exists (select 1 from tmp_registry_packages t where t.id = p.id)`);

    // 8. Import log with the database state after the import.
    const {
      rows: [logged],
    } = await client.query(
      `insert into registry_imports
        (snapshot_date, source, started_at, products_active, products_removed, substances, packages_active)
      values ($1, $2, $3,
        (select count(*) from registry_products where removed_at is null), $4,
        (select count(*) from registry_product_substances),
        (select count(*) from registry_packages where removed_at is null))
      returning products_active, products_removed, substances, packages_active`,
      [snapshotDate, source.label, startedAt, removed.rowCount ?? 0],
    );

    // 9. Search suggestions list, built from the data above so it never drifts from it; a failure rolls everything back.
    await client.query("select public.registry_refresh_search_list()");
    const {
      rows: [list],
    } = await client.query("select variant_count from registry_search_list");
    await client.query("commit");
    return { snapshotDate, dump, stats, logged: { ...logged, variant_count: list?.variant_count ?? 0 } };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw connectionError ?? error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function dryRun(source) {
  const { snapshotDate, products, stats } = await parseRpl(source.text);
  const dump = { products: 0, substances: 0, packages: 0 };
  for await (const product of products) {
    dump.products++;
    dump.substances += product.substances.length;
    dump.packages += product.packages.length;
  }
  if (dump.products === 0) throw new ImportError("the dump contains no human products");
  return { snapshotDate, dump, stats };
}

const startedAt = new Date();
try {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!options.dryRun && !databaseUrl) throw new ImportError("DATABASE_URL is not set (use --dry-run to parse only)");

  const source = openSource(options.file);
  console.log(`Source: ${source.label}${options.dryRun ? " (dry run, no database)" : ""}`);
  const result = options.dryRun ? await dryRun(source) : await importToDatabase(databaseUrl, source, startedAt);
  const seconds = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);

  console.log(`Snapshot date:      ${result.snapshotDate}`);
  console.log(
    `In dump:            ${result.dump.products} human products, ${result.dump.substances} substances, ${result.dump.packages} active packages`,
  );
  console.log(
    `Skipped:            ${result.stats.skippedProducts} non-human products, ${result.stats.skippedPackages} deleted packages (skasowane=TAK)`,
  );
  if (result.logged) {
    const { products_active, products_removed, substances, packages_active, variant_count } = result.logged;
    console.log(`Products active:    ${products_active}`);
    console.log(`Products removed:   ${products_removed} (marked in this import)`);
    console.log(`Substances:         ${substances}`);
    console.log(`Packages active:    ${packages_active}`);
    console.log(`Search variants:    ${variant_count}`);
  }
  console.log(`Duration:           ${seconds} s`);
} catch (error) {
  console.error(`Registry import failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(error instanceof UsageError ? 2 : 1);
}
