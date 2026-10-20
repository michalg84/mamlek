// Stop hook: before the agent finishes, sweep every file this turn changed with the gate that is wired in
// test-plan.md §5 ("lint + type check + ui:scan"): ESLint on the changed files, ui:scan on the changed views,
// then `astro check` over the whole project and the whole unit + component test suite (about 3 s). One retry: when
// Claude is already continuing because of this hook (stop_hook_active, or Cursor's loop_count), it is let through and
// the commit gate catches the rest.
// Exit 2 + stderr is the only combination Claude sees at Stop. Node, not bash: this host has no jq.
// The tests are part of the gate (test-plan.md §3 Phase 4): they run when the turn changed source code or test setup.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const LINTED = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".astro"]);
const SCANNED = new Set([".astro", ".tsx"]);
// A change to one of these can change the typecheck result even without a changed source file.
const TYPE_INPUTS = /^(tsconfig.*\.json|package(-lock)?\.json|astro\.config\.[cm]?[jt]s)$/;
// The test setup the unit + component projects read: a change here can turn a test red without a changed source file.
const TEST_INPUTS = /^(vitest\.config\.ts|tests\/setup-component\.ts|tests\/(fixtures|helpers)\/.+)$/;
const ENV = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
// Claude Code kills the hook at the 120 s timeout in settings.json and lets the agent finish without a word, so the
// checks stop earlier and say so. Override only in the proof tests.
const BUDGET_MS = Number(process.env.END_OF_TURN_BUDGET_MS) || 100_000;
const deadline = Date.now() + BUDGET_MS;
// astro check colours its output whatever NO_COLOR says; the agent reads plain text.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let payload;
try {
  payload = JSON.parse(raw) ?? {};
} catch {
  payload = {};
}

if (payload.stop_hook_active === true || Number(payload.loop_count ?? 0) > 0) process.exit(0);

function git(cwd, args) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: ENV });
  return result.status === 0 ? result.stdout : null;
}

// Checkouts to sweep: the session's (payload cwd follows EnterWorktree, $CLAUDE_PROJECT_DIR does not) plus every
// checkout format.mjs registered for this session (edits in a sibling worktree).
const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
const sid = String(payload.session_id ?? "").replace(/[^A-Za-z0-9_-]/g, "");
const registry = sid ? path.join(os.tmpdir(), "claude-hooks", `${sid}.roots`) : null;
const roots = new Set();
// A cwd git cannot read (e.g. an MSYS /c/... path) falls back to the directory the hook runs in, the session cwd.
const own = git(cwd, ["rev-parse", "--show-toplevel"]) ?? git(process.cwd(), ["rev-parse", "--show-toplevel"]);
if (own) roots.add(path.resolve(own.trim()));
if (registry && existsSync(registry)) {
  for (const line of readFileSync(registry, "utf8").split(/\r?\n/)) {
    if (line.trim() && existsSync(line.trim())) roots.add(path.resolve(line.trim()));
  }
}
if (roots.size === 0) {
  // Not silent: the user sees why nothing was checked.
  console.log(JSON.stringify({ systemMessage: `end-of-turn.mjs: no git checkout at ${cwd}, nothing checked.` }));
  process.exit(0);
}

// Runs a tool's JS entry point with this Node. A missing tool is a failure, never a pass.
function run(root, bin, args) {
  const entry = path.join(root, bin);
  if (!existsSync(entry)) return { ok: false, out: `${bin} not found in ${root}: run npm install.` };
  const timeout = Math.max(deadline - Date.now(), 1);
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: root, encoding: "utf8", env: ENV, timeout });
  if (result.error?.code === "ETIMEDOUT") {
    return { ok: false, out: `${bin} did not finish within the ${BUDGET_MS / 1000} s budget of this hook.` };
  }
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? String(result.error) : ""}`
    .replace(ANSI, "")
    .trim();
  return { ok: result.status === 0, out };
}

const report = [];
for (const root of roots) {
  // Changed and new files, also those rewritten through a shell command (no per-edit hook ever saw them).
  // -z: names exactly as on disk (without it git quotes non-ASCII names, e.g. Polish ones, and they would be skipped).
  const listed = `${git(root, ["diff", "--name-only", "-z", "HEAD"]) ?? ""}\0${git(root, ["ls-files", "-o", "-z", "--exclude-standard"]) ?? ""}`;
  const changed = [...new Set(listed.split("\0").filter(Boolean))];
  if (changed.length === 0) continue;

  const existing = changed.filter((f) => existsSync(path.join(root, f)));
  const linted = existing.filter((f) => LINTED.has(path.extname(f)));
  const scanned = existing.filter((f) => SCANNED.has(path.extname(f)));

  if (linted.length > 0) {
    // `--`: a file name starting with "-" is a file, not an option.
    const eslint = run(root, "node_modules/eslint/bin/eslint.js", ["--quiet", "--", ...linted]);
    if (!eslint.ok) report.push(`ESLint errors in changed files (${root}):\n${eslint.out}`);
  }
  if (scanned.length > 0) {
    // ui-scan.mjs keeps only the guarded views among the files it is given.
    const scan = run(root, "scripts/ui-scan.mjs", scanned);
    if (!scan.ok)
      report.push(`ui:scan found literal values in changed views — use the role classes (${root}):\n${scan.out}`);
  }
  // Whole-project typecheck, as CI runs it (astro check also covers .astro files and syncs generated types).
  // Deleted source files count too: removing a module breaks the files that import it.
  if (changed.some((f) => LINTED.has(path.extname(f)) || TYPE_INPUTS.test(f))) {
    const check = run(root, "node_modules/astro/bin/astro.mjs", ["check"]);
    if (!check.ok) report.push(`astro check fails (${root}):\n${check.out}`);
  }
  // The whole suite, not only the tests of the changed files: it takes seconds and a deleted or renamed module breaks
  // tests that import it. The hooks project is left to `npm test` and the hook proof itself.
  if (changed.some((f) => LINTED.has(path.extname(f)) || TYPE_INPUTS.test(f) || TEST_INPUTS.test(f))) {
    const tests = run(root, "node_modules/vitest/vitest.mjs", ["run", "--project", "unit", "--project", "component"]);
    if (!tests.ok) report.push(`Unit/component tests fail (${root}):\n${tests.out}`);
  }
}

if (report.length > 0) {
  process.stderr.write(`Fix these before you finish:\n\n${report.join("\n\n")}\n`);
  process.exit(2);
}
// Green: the registered checkouts are clean, start the next turn with an empty registry.
if (registry && existsSync(registry)) writeFileSync(registry, "");
process.exit(0);
