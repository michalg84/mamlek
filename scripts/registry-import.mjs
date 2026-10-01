// Registry import: loads the RPL XML export (v6.0.0) into the registry_* tables in one transaction.
// Streams the XML into temporary tables, runs the safety checks, then upserts products and packages
// (rows missing from the export get removed_at, never DELETE) and replaces substances per product.
// Any error rolls the whole import back and exits with a non-zero code.
//
//   DATABASE_URL=postgresql://... node scripts/registry-import.mjs                 # download from RPL
//   DATABASE_URL=postgresql://... node scripts/registry-import.mjs --file dump.xml # local file
//   node scripts/registry-import.mjs --file dump.xml --dry-run                      # parse only, no database

import { createReadStream } from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import pg from "pg";
import { parseRpl } from "./lib/rpl-parser.mjs";

const RPL_URL = "https://rejestry.ezdrowie.gov.pl/api/rpl/medicinal-products/public-pl-report/6.0.0/overall.xml";
const BATCH_SIZE = 1000;
// A dump with fewer human products than this share of the active ones is treated as broken (truncated or empty).
const MIN_PRODUCT_SHARE = 0.9;

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

async function* downloadText(url) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new ImportError(`download failed: HTTP ${response.status} from ${url}`);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for await (const chunk of response.body) yield decoder.decode(chunk, { stream: true });
  const rest = decoder.decode();
  if (rest) yield rest;
}

// Opened lazily on the first read, so a missing file surfaces as a normal error inside the import.
async function* readText(file) {
  yield* createReadStream(file, { encoding: "utf8" });
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

async function importToDatabase(databaseUrl, source, startedAt) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = 0");

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

    // 3. Safety checks (the namespace is checked by the parser).
    const {
      rows: [state],
    } = await client.query(`select
        (select max(snapshot_date)::text from registry_imports) as last_snapshot,
        (select count(*)::int from registry_products where removed_at is null) as active`);
    if (state.last_snapshot && snapshotDate < state.last_snapshot) {
      throw new ImportError(
        `stanNaDzien ${snapshotDate} is older than the last imported snapshot ${state.last_snapshot}`,
      );
    }
    if (state.active > 0 && dump.products < state.active * MIN_PRODUCT_SHARE) {
      throw new ImportError(
        `the dump has ${dump.products} human products, less than ${MIN_PRODUCT_SHARE * 100}% of ${state.active} active ones`,
      );
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
    await client.query("commit");
    return { snapshotDate, dump, stats, logged };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
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
    const { products_active, products_removed, substances, packages_active } = result.logged;
    console.log(`Products active:    ${products_active}`);
    console.log(`Products removed:   ${products_removed} (marked in this import)`);
    console.log(`Substances:         ${substances}`);
    console.log(`Packages active:    ${packages_active}`);
  }
  console.log(`Duration:           ${seconds} s`);
} catch (error) {
  console.error(`Registry import failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(error instanceof UsageError ? 2 : 1);
}
