#!/usr/bin/env node
// Fetches a 10xDevs lesson pack with 10x-cli without losing local tweaks:
//   1. strips the local model/effort block from 10x-* skills (skill-models.mjs),
//      so 10x-cli sees the files it wrote and updates them;
//   2. runs `10x-cli get <lesson>` and prints a short summary instead of the
//      raw JSON (it lists every file, ~6k tokens);
//   3. when the CLAUDE.md block is skipped as locally modified (Prettier
//      reformats it on every commit), replaces the text between the 10x-cli
//      markers with the lesson's rules, keeping the header and @AGENTS.md;
//   4. puts the model/effort block back, even when the fetch failed.
//
//   node .claude/scripts/lesson-get.mjs <lesson>      e.g. m3l4
//   node .claude/scripts/lesson-get.mjs <lesson> --dry-run
//
// Exit: 0 ok, 1 fetch failed, 2 usage error.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { apply, strip, unconfigured } from "./skill-models.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLAUDE_MD = join(ROOT, "CLAUDE.md");
const BEGIN = "<!-- BEGIN @przeprogramowani/10x-cli -->";
const END = "<!-- END @przeprogramowani/10x-cli -->";

const [lesson, ...flags] = process.argv.slice(2);
const dryRun = flags.includes("--dry-run");
if (!lesson || !/^m\d+l\d+$/i.test(lesson)) {
  console.error("usage: node .claude/scripts/lesson-get.mjs <lesson id, e.g. m3l4> [--dry-run]");
  process.exit(2);
}

function cli(args) {
  const r = spawnSync("npx", ["--yes", "@przeprogramowani/10x-cli@latest", ...args, "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* not JSON: reported below */
  }
  return { code: r.status, json, stderr: (r.stderr || "").trim() };
}

function fail(msg, res) {
  console.error(`FETCH FAILED: ${msg}`);
  const detail = res?.json?.error ?? res?.json?.message ?? res?.stderr;
  if (detail) console.error(typeof detail === "string" ? detail.slice(0, 800) : JSON.stringify(detail).slice(0, 800));
  return 1;
}

function summarize(data) {
  const w = data.writes || {};
  const counts = {};
  const changed = [];
  for (const s of w.skills || [])
    for (const f of s.files || []) {
      counts[f.action] = (counts[f.action] || 0) + 1;
      if (f.action !== "unchanged") changed.push(`${s.name}/${f.path}: ${f.action}`);
    }
  for (const p of w.prompts || []) {
    counts[p.action] = (counts[p.action] || 0) + 1;
    if (p.action !== "unchanged") changed.push(`prompt ${p.name}: ${p.action}`);
  }
  console.log(`lesson    ${data.lessonId ?? lesson} — ${data.title ?? ""}`);
  console.log(`files     ${JSON.stringify(counts)}`);
  for (const l of changed) console.log(`  ${l}`);
  console.log(`rules     ${JSON.stringify(w.rules ?? null)}`);
  return JSON.stringify(w.rules ?? "");
}

function spliceRules() {
  const res = cli(["get", lesson, "--print", "--type", "rules"]);
  const content = res.json?.data?.artifacts?.[0]?.content;
  if (!content) return fail("could not read the lesson rules (--print --type rules)", res);
  const md = readFileSync(CLAUDE_MD, "utf8");
  const b = md.indexOf(BEGIN);
  const e = md.indexOf(END);
  if (b === -1 || e === -1 || e < b) return fail("10x-cli markers not found in CLAUDE.md");
  const next = md.slice(0, b + BEGIN.length) + "\n\n" + content.trimEnd() + "\n\n" + md.slice(e);
  if (next === md) {
    console.log("CLAUDE.md block already matches the lesson rules");
    return 0;
  }
  writeFileSync(CLAUDE_MD, next);
  console.log("CLAUDE.md block replaced with the lesson rules (header and @AGENTS.md kept)");
  return 0;
}

let exit = 0;
if (strip({ quiet: true }))
  console.error("warning: some skills could not be stripped; they may be skipped as locally modified");
try {
  const res = cli(["get", lesson, ...(dryRun ? ["--dry-run"] : [])]);
  if (res.code !== 0 || res.json?.status !== "ok") {
    exit = fail(`10x-cli get ${lesson} (exit ${res.code})`, res);
  } else {
    const rules = summarize(res.json.data);
    if (!dryRun && rules.includes("conflict_skipped")) exit = spliceRules();
  }
} finally {
  if (apply({ quiet: true })) {
    console.error(
      "warning: model/effort could not be re-applied to some skills; run: node .claude/scripts/skill-models.mjs apply",
    );
    exit ||= 1;
  } else console.log("models    re-applied from .claude/skill-models.json");
}

if (!readFileSync(CLAUDE_MD, "utf8").includes("@AGENTS.md"))
  console.log("WARNING   CLAUDE.md lost its @AGENTS.md import — re-add it");
const fresh = unconfigured();
if (fresh.length)
  console.log(`no model  ${fresh.join(", ")} (run on the session model; add to .claude/skill-models.json if needed)`);
process.exit(exit);
