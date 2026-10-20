#!/usr/bin/env node
// Adds or removes `model` / `effort` in the frontmatter of 10x-cli skills,
// from .claude/skill-models.json.
//
// 10x-cli tracks content hashes of the skills it writes, so a locally edited
// SKILL.md is skipped on the next `get`. The added lines sit in a marked block
// that `strip` removes exactly, giving back the file 10x-cli wrote.
//
//   node .claude/scripts/skill-models.mjs apply    add the block (idempotent)
//   node .claude/scripts/skill-models.mjs strip    remove the block
//   node .claude/scripts/skill-models.mjs status   show what each skill has
//
// Exit: 0 ok, 1 a skill could not be updated, 2 usage error.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILLS_DIR = join(ROOT, ".claude", "skills");
const CONFIG = join(ROOT, ".claude", "skill-models.json");
const BEGIN = "# >>> skill-models (local, see .claude/skill-models.json)";
const END = "# <<< skill-models";
const KEYS = ["model", "effort"];

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG, "utf8")).skills ?? {};
}

function skillFile(name) {
  return join(SKILLS_DIR, name, "SKILL.md");
}

// Returns { head, body, rest } where head is the frontmatter text between the
// two `---` lines, or null when the file has no frontmatter.
function splitFrontmatter(text) {
  if (!text.startsWith("---\n")) return null;
  const close = text.indexOf("\n---\n", 4);
  if (close === -1) return null;
  return { head: text.slice(4, close + 1), rest: text.slice(close + 1) };
}

function stripBlock(head) {
  const start = head.indexOf(BEGIN + "\n");
  if (start === -1) return head;
  const end = head.indexOf(END + "\n", start);
  if (end === -1) throw new Error("start marker without end marker");
  return head.slice(0, start) + head.slice(end + END.length + 1);
}

function upstreamKeys(head) {
  return KEYS.filter((k) => new RegExp(`^${k}:`, "m").test(head));
}

export function strip({ quiet = false } = {}) {
  let failed = 0;
  for (const name of listSkills()) {
    const file = skillFile(name);
    const text = readFileSync(file, "utf8");
    const fm = splitFrontmatter(text);
    if (!fm || !fm.head.includes(BEGIN)) continue;
    try {
      writeFileSync(file, "---\n" + stripBlock(fm.head) + fm.rest);
      if (!quiet) console.log(`stripped  ${name}`);
    } catch (e) {
      failed++;
      console.error(`FAILED    ${name}: ${e.message}`);
    }
  }
  return failed;
}

export function apply({ quiet = false } = {}) {
  const config = loadConfig();
  let failed = 0;
  for (const [name, wanted] of Object.entries(config)) {
    const file = skillFile(name);
    if (!existsSync(file)) {
      console.error(`missing   ${name} (in skill-models.json, not installed)`);
      continue;
    }
    const text = readFileSync(file, "utf8");
    const fm = splitFrontmatter(text);
    if (!fm) {
      failed++;
      console.error(`FAILED    ${name}: no frontmatter`);
      continue;
    }
    let head;
    try {
      head = stripBlock(fm.head);
    } catch (e) {
      failed++;
      console.error(`FAILED    ${name}: ${e.message}`);
      continue;
    }
    // A key the skill already sets upstream wins; a duplicate key would break the YAML.
    const taken = upstreamKeys(head);
    const lines = KEYS.filter((k) => wanted[k] && !taken.includes(k)).map((k) => `${k}: ${wanted[k]}`);
    for (const k of taken) if (wanted[k]) console.error(`upstream  ${name}: already sets ${k}, local value skipped`);
    const next = "---\n" + head + (lines.length ? [BEGIN, ...lines, END].join("\n") + "\n" : "") + fm.rest;
    if (next !== text) {
      writeFileSync(file, next);
      if (!quiet) console.log(`applied   ${name}: ${lines.join(", ")}`);
    }
  }
  return failed;
}

function listSkills() {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR).filter((n) => n.startsWith("10x-") && existsSync(skillFile(n)));
}

export function unconfigured() {
  const config = loadConfig();
  return listSkills().filter((n) => !(n in config));
}

function status() {
  const config = loadConfig();
  for (const name of listSkills()) {
    const fm = splitFrontmatter(readFileSync(skillFile(name), "utf8"));
    const head = fm?.head ?? "";
    const has = KEYS.map((k) => head.match(new RegExp(`^${k}: *(.+)$`, "m"))?.[1]).map((v) => v ?? "-");
    const want = config[name] ? `${config[name].model ?? "-"}/${config[name].effort ?? "-"}` : "(session)";
    const flag = config[name] && `${has[0]}/${has[1]}` !== want ? "  <- not applied" : "";
    console.log(`${name.padEnd(26)} ${`${has[0]}/${has[1]}`.padEnd(14)} config ${want}${flag}`);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const cmd = process.argv[2];
  if (cmd === "apply") process.exit(apply() ? 1 : 0);
  else if (cmd === "strip") process.exit(strip() ? 1 : 0);
  else if (cmd === "status") status();
  else {
    console.error("usage: node .claude/scripts/skill-models.mjs apply|strip|status");
    process.exit(2);
  }
}
