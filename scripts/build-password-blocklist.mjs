// Builds src/lib/services/password-blocklist.json: the 10 000 most common passwords of at least 12 characters, plus a
// few words of the app itself (ASVS 6.2.11). The source is the SecLists xato-net list, which is sorted by frequency;
// the commit is pinned, so a rebuild gives the same file. The result is committed, so neither the build nor the tests
// fetch anything.
//
//   node scripts/build-password-blocklist.mjs                    # download the pinned SecLists file
//   node scripts/build-password-blocklist.mjs --file list.txt    # a local copy of that file
//
// Exit 2 = usage error, 1 = the download or the write failed.

import { readFileSync, writeFileSync } from "node:fs";
import { URL, fileURLToPath } from "node:url";
import { TextEncoder } from "node:util";

const SECLISTS_COMMIT = "fcde9140df969b1e4d7bb056122646dace4ed4cc";
const SOURCE_PATH = "Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt";
const SOURCE_URL = `https://raw.githubusercontent.com/danielmiessler/SecLists/${SECLISTS_COMMIT}/${SOURCE_PATH}`;
const OUTPUT_FILE = fileURLToPath(new URL("../src/lib/services/password-blocklist.json", import.meta.url));

// The rule of src/lib/password-policy.ts (code points and UTF-8 bytes); a test checks every entry against it.
const MIN_LENGTH = 12;
const MAX_BYTES = 72;
const LIST_SIZE = 10_000;

// The same value as EXAMPLE_PASSPHRASE in src/lib/password-policy.ts: people type the example they see on the screen.
const EXAMPLE_PASSPHRASE = "zielony rower pod oknem";
const APP_WORDS = [
  "mamlekmamlek",
  "mamlek123456",
  "mamlek202020",
  "apteczka1234",
  "apteczka12345",
  "mojaapteczka",
  "mojaapteczka1",
  "domowaapteczka",
  EXAMPLE_PASSPHRASE,
];

const encoder = new TextEncoder();

class UsageError extends Error {}

function parseArgs(argv) {
  const options = { file: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--file") {
      const file = argv[++i];
      if (!file || file.startsWith("--")) throw new UsageError("--file needs a path");
      options.file = file;
    } else throw new UsageError(`Unknown argument "${arg}". Supported: --file <path>.`);
  }
  return options;
}

/** The entries of the source text in order of frequency: lower case, no duplicates, only lengths the rule allows. */
export function selectEntries(text, size = LIST_SIZE) {
  const seen = new Set();
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    const word = line.toLowerCase();
    if (Array.from(word).length < MIN_LENGTH || encoder.encode(word).length > MAX_BYTES || seen.has(word)) continue;
    seen.add(word);
    entries.push(word);
    if (entries.length === size) break;
  }
  return entries;
}

async function main() {
  const { file } = parseArgs(process.argv.slice(2));
  let text;
  if (file) {
    text = readFileSync(file, "utf8");
  } else {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`download failed: HTTP ${response.status} from ${SOURCE_URL}`);
    text = await response.text();
  }

  const entries = selectEntries(text);
  if (entries.length < LIST_SIZE) {
    throw new Error(`the source has only ${entries.length} usable entries, expected ${LIST_SIZE}`);
  }
  const known = new Set(entries);
  for (const word of APP_WORDS) {
    if (!known.has(word)) entries.push(word);
  }

  const output = {
    source: `https://github.com/danielmiessler/SecLists/blob/${SECLISTS_COMMIT}/${SOURCE_PATH}`,
    license: "MIT, SecLists (Daniel Miessler)",
    entries,
  };
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + "\n");
  console.log(`wrote ${entries.length} entries to ${OUTPUT_FILE}`);
}

// Run only when started directly, so a test could import selectEntries.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof UsageError ? error.message : `build-password-blocklist failed: ${error.message}`);
    process.exit(error instanceof UsageError ? 2 : 1);
  });
}
