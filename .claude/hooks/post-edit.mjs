// PostToolUse (Write|Edit) hook: run the project's Prettier on the edited file, then ESLint (--quiet) on it.
// Reads the hook payload from stdin; skips file types lint-staged doesn't format and files of other repositories.
// Exit 2 + stderr is the channel Claude reads after a tool call: a Prettier syntax error or ESLint errors in the edited
// file go to the agent right away. A missing tool or an overrun of the time budget exits 1, which only the user sees as
// a hook error. No --fix: rewriting the file again would make the agent's next Edit fail ("modified since read").
// It also registers the file's checkout for this session, so end-of-turn.mjs sweeps a sibling worktree too.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// JS files too: ESLint lints them with the Prettier rule, so an unformatted edit would send the agent back at Stop.
const FORMATTED = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".astro", ".json", ".css", ".md"]);
// The same set end-of-turn.mjs lints.
const LINTED = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".astro"]);
const ENV = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
// Claude Code kills the hook at the 60 s timeout in settings.json without a word, and a cold type-aware ESLint can
// take longer than 30 s, so the tools stop earlier and say so. Override only in the proof tests.
const BUDGET_MS = Number(process.env.POST_EDIT_BUDGET_MS) || 50_000;
const deadline = Date.now() + BUDGET_MS;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let payload;
try {
  payload = JSON.parse(raw) ?? {};
} catch {
  payload = {};
}

const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
const given = payload.tool_input?.file_path ?? payload.tool_response?.filePath;
if (typeof given !== "string" || !given) process.exit(0);
const file = path.resolve(cwd, given);
if (!FORMATTED.has(path.extname(file)) || !existsSync(file)) process.exit(0);

function git(dir, args) {
  const result = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

// Checkout of the edited file, not $CLAUDE_PROJECT_DIR (stale after EnterWorktree). Files of other repositories
// (~/.claude, other projects) are skipped; any worktree of this repository is checked.
const root = git(path.dirname(file), ["rev-parse", "--show-toplevel"]);
if (!root) process.exit(0);
const repo = git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
// A cwd git cannot read (e.g. an MSYS /c/... path) falls back to the directory the hook runs in, the session cwd.
const sessionRepo =
  git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]) ??
  git(process.cwd(), ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
if (!repo || repo !== sessionRepo) process.exit(0);

// Registered before the checks, so Stop sweeps the checkout even when this hook sends the agent back.
const sid = String(payload.session_id ?? "").replace(/[^A-Za-z0-9_-]/g, "");
if (sid) {
  const dir = path.join(os.tmpdir(), "claude-hooks");
  mkdirSync(dir, { recursive: true });
  appendFileSync(path.join(dir, `${sid}.roots`), `${path.resolve(root)}\n`);
}

// Runs a tool's JS entry point with this Node, output captured for the agent. A missing tool exits 1 here.
function run(name, bin, args) {
  const entry = path.join(root, bin);
  if (!existsSync(entry)) {
    process.stderr.write(`post-edit.mjs: ${name} not found in ${root}: run npm install.\n`);
    process.exit(1);
  }
  const timeout = Math.max(deadline - Date.now(), 1);
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: root, encoding: "utf8", env: ENV, timeout });
  if (result.error?.code === "ETIMEDOUT") {
    process.stderr.write(
      `post-edit.mjs: ${name} did not finish within the ${BUDGET_MS / 1000} s budget of this hook; the end-of-turn check still runs.\n`,
    );
    process.exit(1);
  }
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? String(result.error) : ""}`
    .replace(ANSI, "")
    .trim();
  return { ok: result.status === 0, out };
}

const prettier = run("Prettier", "node_modules/prettier/bin/prettier.cjs", [
  "--write",
  "--ignore-unknown",
  "--log-level",
  "warn",
  file,
]);
if (!prettier.ok) {
  process.stderr.write(`Prettier could not format ${file}:\n${prettier.out}\n`);
  process.exit(2);
}

if (LINTED.has(path.extname(file))) {
  // `--`: a file name starting with "-" is a file, not an option.
  const eslint = run("ESLint", "node_modules/eslint/bin/eslint.js", ["--quiet", "--", file]);
  if (!eslint.ok) {
    process.stderr.write(`ESLint errors in ${file} — fix them:\n${eslint.out}\n`);
    process.exit(2);
  }
}
process.exit(0);
