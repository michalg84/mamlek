// Helpers of the registry import tests: a scratch database (registry_import_test) that the importer may overwrite
// freely, a baseline state in it, the importer run as a child process (the real path with exit codes) and a
// fingerprint of the whole registry state, so "the database is unchanged" is a comparison, not a hope.
// The database named by DATABASE_URL (the local CI state v1, v1, v2) is only used to create and drop the scratch one.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { URL, fileURLToPath } from "node:url";
import pg from "pg";
import { connectLocal } from "./medicine-check-fixtures";

export const SCRATCH_DATABASE = "registry_import_test";

// Every migration the importer needs: the registry tables and the search list it refreshes. The other migrations
// (kit_items, medicine_check) need the auth schema, which a plain scratch database does not have.
export const REGISTRY_MIGRATIONS = [
  "20261001120000_registry_tables.sql",
  "20261002120000_registry_search_list.sql",
  "20261002130000_registry_search_list_version.sql",
];

export const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
export const IMPORT_SCRIPT = "scripts/registry-import.mjs";
export const BASELINE_FILE = fileURLToPath(new URL("../../scripts/fixtures/rpl-sample-v1.xml", import.meta.url));

export interface ScratchDatabase {
  /** DATABASE_URL pointing at the scratch database. */
  url: string;
  client: pg.Client;
  /** Closes the connection and drops the database. */
  drop: () => Promise<void>;
}

function scratchUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${SCRATCH_DATABASE}`;
  return url.toString();
}

/** Creates registry_import_test (replacing a leftover one) on the local server and applies the registry migrations. */
export async function createScratchDatabase(): Promise<ScratchDatabase> {
  const admin = await connectLocal(); // refuses anything but a local server
  const url = scratchUrl(process.env.DATABASE_URL ?? "");
  try {
    await admin.query(`drop database if exists ${SCRATCH_DATABASE} with (force)`);
    await admin.query(`create database ${SCRATCH_DATABASE}`);
  } finally {
    await admin.end().catch(() => undefined);
  }
  const client = new pg.Client({ connectionString: url });
  const drop = async () => {
    await client.end().catch(() => undefined);
    const dropper = await connectLocal();
    try {
      await dropper.query(`drop database if exists ${SCRATCH_DATABASE} with (force)`);
    } finally {
      await dropper.end().catch(() => undefined);
    }
  };
  try {
    await client.connect();
    for (const file of REGISTRY_MIGRATIONS) await client.query(readFileSync(MIGRATIONS_DIR + file, "utf8"));
  } catch (error) {
    await drop().catch(() => undefined);
    throw error;
  }
  return { url, client, drop };
}

export interface ImportRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs `node scripts/registry-import.mjs --file <file>` against `url`; a failing import is a result, not a throw. */
export function runImport(url: string, file: string): ImportRun {
  const run = spawnSync(process.execPath, [IMPORT_SCRIPT, "--file", file], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
    timeout: 120_000,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

const FINGERPRINTED = [
  "registry_products",
  "registry_product_substances",
  "registry_packages",
  "registry_imports",
  "registry_search_list",
] as const;

export type Fingerprint = Record<(typeof FINGERPRINTED)[number], string>;

/** Row count and md5 of the ordered rows of every registry table (timestamps included): any change shows. */
export async function fingerprint(client: pg.Client): Promise<Fingerprint> {
  const result = {} as Fingerprint;
  for (const table of FINGERPRINTED) {
    const { rows } = await client.query<{ fingerprint: string }>(
      `select count(*) || ':' || coalesce(md5(string_agg(t::text, '|' order by t::text)), '') as fingerprint
       from public.${table} t`,
    );
    result[table] = rows[0].fingerprint;
  }
  return result;
}

/** Empties every registry table and restarts the import log ids. */
export async function truncateRegistry(client: pg.Client): Promise<void> {
  await client.query(
    `truncate public.registry_search_list, public.registry_imports, public.registry_product_substances,
       public.registry_packages, public.registry_products restart identity`,
  );
}

/**
 * Back to the known starting state: the v1 fixture imported once (11 active products, snapshot 2026-09-23), so the
 * checks that compare with the database (older snapshot, the 90% share) have something to work on.
 */
export async function resetToBaseline(url: string, client: pg.Client): Promise<void> {
  await truncateRegistry(client);
  const run = runImport(url, BASELINE_FILE);
  if (run.status !== 0) throw new Error(`The baseline import failed (${run.status}): ${run.stderr}`);
}
