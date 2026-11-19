#!/usr/bin/env node
// Ground truth about each worker session, read from its Claude Code transcript
// (not from the Herdr screen, which can be stale):
//   last reply time (local), models of the last replies, last skill/command, commits ahead of main.
//
//   node worker-status.mjs [<worktree-name> ...] [--last <n>]
//
// Without names it reports every directory in .claude/worktrees/. Exit 2 = usage error.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const wtRoot = join(repo, ".claude", "worktrees");
const args = process.argv.slice(2);
let lastN = 8;
const names = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--last") lastN = Number(args[++i]);
  else if (args[i].startsWith("--")) {
    console.error(`unknown argument: ${args[i]}`);
    process.exit(2);
  } else names.push(args[i]);
}
if (!Number.isInteger(lastN) || lastN < 1) {
  console.error("--last must be a positive integer");
  process.exit(2);
}

const worktrees = names.length
  ? names
  : existsSync(wtRoot)
    ? readdirSync(wtRoot).filter((d) => statSync(join(wtRoot, d)).isDirectory())
    : [];
if (!worktrees.length) {
  console.log("no worktrees in .claude/worktrees/");
  process.exit(0);
}

// Claude Code stores a project's transcripts under ~/.claude/projects/<path with every non-alphanumeric char as "-">.
const projectDir = (p) => join(homedir(), ".claude", "projects", p.replace(/[^A-Za-z0-9]/g, "-"));
const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : "?");

for (const name of worktrees) {
  const wt = join(wtRoot, name);
  console.log(`== ${name}`);
  let ahead;
  try {
    ahead = execFileSync("git", ["-C", wt, "log", "--oneline", "main..HEAD"], { encoding: "utf8" }).trim();
    ahead = ahead ? `${ahead.split("\n").length} commit(s): ${ahead.split("\n")[0]}` : "no commits ahead of main";
  } catch {
    ahead = "git log failed";
  }
  const dir = projectDir(wt);
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
    : [];
  if (!files.length) {
    console.log(`   no transcript (${dir}); ${ahead}`);
    continue;
  }
  const lines = readFileSync(join(dir, files[0].f), "utf8").trim().split("\n");
  const replies = [];
  let lastSkill = null;
  for (const l of lines) {
    let j;
    try {
      j = JSON.parse(l);
    } catch {
      continue;
    }
    if (j.type === "assistant" && j.message?.model) {
      replies.push({ ts: j.timestamp, model: j.message.model });
      for (const b of j.message.content ?? [])
        if (b.type === "tool_use" && b.name === "Skill") lastSkill = { ts: j.timestamp, name: b.input?.skill };
    }
    if (j.type === "user") {
      const c = JSON.stringify(j.message?.content ?? "");
      const m = c.match(/<command-name>\/?([^<]+)<\/command-name>/);
      if (m) lastSkill = { ts: j.timestamp, name: m[1] };
    }
  }
  const recent = replies.slice(-lastN);
  const counts = {};
  for (const r of recent) counts[r.model] = (counts[r.model] ?? 0) + 1;
  const last = replies.at(-1);
  console.log(`   session ${files[0].f.replace(".jsonl", "")}, last reply ${hhmm(last?.ts)}`);
  console.log(
    `   models (last ${recent.length}): ${Object.entries(counts)
      .map(([m, n]) => `${m} x${n}`)
      .join(", ")}`,
  );
  console.log(`   last skill/command: ${lastSkill ? `${lastSkill.name} at ${hhmm(lastSkill.ts)}` : "none"}`);
  console.log(`   ${ahead}`);
}
