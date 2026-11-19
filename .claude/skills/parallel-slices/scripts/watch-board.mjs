#!/usr/bin/env node
// Polls the coordination board and prints each NEW line (one stdout line per event),
// so it can feed the Monitor tool (coordinator) or a worker's fallback watch.
//
//   node watch-board.mjs [--needs | --notes | --all] [--file <path>] [--interval <ms>]
//
//   --needs  (default) status lines that need the coordinator, use or free the DB, ack a note, end a step,
//            or report an error/blocker
//   --notes  coordinator notes only (for workers)
//   --all    every new non-empty line
//
// Exits 2 on a usage error. Never exits on its own otherwise; a missing or
// briefly locked file is retried, not fatal.
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setInterval } from "node:timers";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
let file = resolve(repo, ".claude/worktrees/COORDINATION.md");
let mode = "needs";
let interval = 1000;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--needs" || a === "--notes" || a === "--all") mode = a.slice(2);
  else if (a === "--file") file = resolve(args[++i] ?? "");
  else if (a === "--interval") interval = Number(args[++i]);
  else {
    console.error(`unknown argument: ${a}`);
    process.exit(2);
  }
}
if (!Number.isFinite(interval) || interval < 200) {
  console.error("--interval must be a number >= 200");
  process.exit(2);
}

const STATUS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} \| S-\d+/;
// ack:/done: lines confirm that a coordinator note arrived and that its step ended (see the board rules).
const NEEDS = /needs:\s*coordinator|DB:\s*using|DB:\s*free|\back:|\bdone:|blocked|error|fail/i;
const NOTE = /^- .*coordinator/i;

function match(line) {
  if (!line.trim()) return false;
  if (mode === "all") return true;
  if (mode === "notes") return NOTE.test(line);
  return STATUS.test(line) && NEEDS.test(line);
}

function read() {
  try {
    return readFileSync(file, "utf8").split(/\r?\n/);
  } catch {
    return null;
  }
}

// Start from the current content: only lines added from now on are events.
let seen = new Set(read() ?? []);
let lastMtime = 0;
console.error(`watching ${file} (${mode})`);

setInterval(() => {
  let mtime;
  try {
    mtime = statSync(file).mtimeMs;
  } catch {
    return;
  }
  if (mtime === lastMtime) return;
  lastMtime = mtime;
  const lines = read();
  if (!lines) return;
  for (const line of lines) {
    if (seen.has(line)) continue;
    if (match(line)) console.log(line);
  }
  // Rebuild from the file so edited lines are compared against the latest version.
  seen = new Set(lines);
}, interval);
