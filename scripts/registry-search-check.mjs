// Search rule check: compares the results and their order that `searchVariants` gives for a fixed list of queries with a
// golden file saved before a change (src/lib/registry-search.ts, how the list is built or transported). There is no
// unit test runner, so this is what notices a changed total, a changed order or a different first suggestion.
//
// Reads the list from `registry_search_list` in DATABASE_URL, so run it against a database with the full registry
// imported (the fixtures are too small to exercise the levels). Runs under Node with --experimental-strip-types
// (npm run search:check), because it imports the TypeScript matcher directly.
//
//   DATABASE_URL=postgresql://... npm run search:check -- --save   # write .perf/search-golden.json (before the change)
//   DATABASE_URL=postgresql://... npm run search:check             # compare with it (after the change)
//
// Exit codes: 0 same results, 1 differences, 2 usage problem (no golden file, no or non-local DATABASE_URL, other list version).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";
import pg from "pg";
import { buildSearchIndex, searchVariants } from "../src/lib/registry-search.ts";

const GOLDEN_FILE = fileURLToPath(new URL("../.perf/search-golden.json", import.meta.url));
const LIMIT = 20;
// Local databases only: the connection is not encrypted (unlike registry-import.mjs, which verifies non-local hosts).
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Levels (see the S-01 plan): A = first query word starts the first word of the product name, B = another word of the
// name, C = a word of the common name, D = a word of an active substance. Each following query word must start a word of
// that field or of the strength / form.
const QUERIES = [
  // Examples from S-01
  "max",
  "zel",
  "żel",
  "paracetamol",
  "ibuprom 400",
  "dla dzieci",
  "ibupom",
  "ibu 400",
  "ibu max",
  // Level A: the name starts with the word
  "apap",
  "nurofen",
  "sortis 20",
  // Level B: a later word of the name
  "forte",
  "sprint",
  "tabletki powlekane",
  // Level C: the common name
  "paracetamolum",
  "ibuprofenum",
  // Level D: the active substance
  "acidum",
  "metformin",
  "kwas acetylosalicylowy",
  // Polish characters, with and without diacritics
  "łódź",
  "ból",
  "bol",
  // Digits only, and digits with a unit
  "500",
  "400 mg",
  // Too short (no suggestions), and two short words that are long enough together
  "ib",
  "no spa",
  // Several words
  "ibuprofen sodium 400",
  "witamina d3 2000",
  // Upper case and surrounding spaces
  "IBUPROM MAX",
  "  Paracetamol  ",
];

class UsageError extends Error {}

function parseArgs(argv) {
  const options = { save: false };
  for (const arg of argv) {
    if (arg === "--save") options.save = true;
    else throw new UsageError(`Unknown argument: ${arg}`);
  }
  return options;
}

async function loadList() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new UsageError("DATABASE_URL is not set (e.g. postgresql://postgres:postgres@127.0.0.1:54322/postgres)");
  }
  let host;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new UsageError("DATABASE_URL is not a valid URL");
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new UsageError(`DATABASE_URL must point to a local database (got host ${host}): import the registry locally`);
  }
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query("select version, payload from registry_search_list");
    if (rows.length === 0) {
      throw new UsageError("registry_search_list is empty: import the full registry first (npm run registry:import)");
    }
    return { version: Number(rows[0].version), payload: JSON.parse(rows[0].payload) };
  } finally {
    await client.end().catch(() => undefined);
  }
}

function runQueries(index) {
  const output = {};
  for (const query of QUERIES) {
    const { results, total } = searchVariants(index, query, LIMIT);
    output[query] = {
      total,
      ids: results.map((variant) => variant.id),
      // Only for the diagnostic message; the comparison uses ids.
      names: results.map((variant) => variant.name),
    };
  }
  return output;
}

function describe(ids, names, position) {
  return position < ids.length ? `${ids[position]} "${names[position]}"` : "(none)";
}

// Returns a list of human-readable differences, empty when the results are the same.
function compare(golden, actual) {
  const differences = [];
  for (const query of QUERIES) {
    const before = golden[query];
    const after = actual[query];
    if (!before) {
      differences.push(`"${query}": missing in the golden file (save it again)`);
      continue;
    }
    if (before.total !== after.total) {
      differences.push(`"${query}": total ${before.total} -> ${after.total}`);
    }
    const length = Math.max(before.ids.length, after.ids.length);
    for (let position = 0; position < length; position++) {
      if (before.ids[position] !== after.ids[position]) {
        differences.push(
          `"${query}": first difference at position ${position + 1}: ` +
            `${describe(before.ids, before.names ?? [], position)} -> ${describe(after.ids, after.names, position)}`,
        );
        break;
      }
    }
  }
  return differences;
}

async function readGolden() {
  let text;
  try {
    text = await readFile(GOLDEN_FILE, "utf8");
  } catch {
    throw new UsageError(`No golden file at ${path.relative(process.cwd(), GOLDEN_FILE)}: run with --save first`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new UsageError("The golden file is not valid JSON: save it again with --save");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  // Check for the golden file first, so a missing one is reported before a database round trip.
  const golden = options.save ? null : await readGolden();
  const { version, payload } = await loadList();
  const index = buildSearchIndex(payload);
  const actual = runQueries(index);

  if (options.save) {
    await mkdir(path.dirname(GOLDEN_FILE), { recursive: true });
    await writeFile(
      GOLDEN_FILE,
      `${JSON.stringify({ version, savedAt: new Date().toISOString(), limit: LIMIT, queries: actual }, null, 2)}\n`,
    );
    console.log(
      `Saved ${QUERIES.length} queries of list version ${version} to ${path.relative(process.cwd(), GOLDEN_FILE)}`,
    );
    return 0;
  }

  if (golden.version !== version) {
    throw new UsageError(
      `The list has version ${version}, the golden file was saved for version ${golden.version}: ` +
        "the registry was imported again, save the golden file again with --save (from the code before the change)",
    );
  }
  const differences = compare(golden.queries ?? {}, actual);
  if (differences.length === 0) {
    console.log(`All ${QUERIES.length} queries match the golden file (list version ${version})`);
    return 0;
  }
  for (const difference of differences) {
    console.log(`DIFF  ${difference}`);
  }
  console.log(`\n${differences.length} difference(s) against the golden file`);
  return 1;
}

try {
  process.exit(await main());
} catch (error) {
  console.error(`Registry search check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(error instanceof UsageError ? 2 : 1);
}
