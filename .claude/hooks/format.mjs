// PostToolUse (Write|Edit) hook: run the project's Prettier on the edited file.
// Reads the hook payload from stdin; skips file types lint-staged doesn't format and files of other repositories.
// Formatting only, it never sends the agent back: a failure exits 1, which the user sees as a hook error.
// It also registers the file's checkout for this session, so end-of-turn.mjs sweeps a sibling worktree too.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// JS files too: ESLint lints them with the Prettier rule, so an unformatted edit would send the agent back at Stop.
const FORMATTED = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".astro", ".json", ".css", ".md"]);

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
// (~/.claude, other projects) are skipped; any worktree of this repository is formatted.
const root = git(path.dirname(file), ["rev-parse", "--show-toplevel"]);
if (!root) process.exit(0);
const repo = git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
const sessionRepo = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
if (!repo || repo !== sessionRepo) process.exit(0);

const sid = String(payload.session_id ?? "").replace(/[^A-Za-z0-9_-]/g, "");
if (sid) {
  const dir = path.join(os.tmpdir(), "claude-hooks");
  mkdirSync(dir, { recursive: true });
  appendFileSync(path.join(dir, `${sid}.roots`), `${path.resolve(root)}\n`);
}

const prettier = path.join(root, "node_modules", "prettier", "bin", "prettier.cjs");
if (!existsSync(prettier)) {
  process.stderr.write(`format.mjs: Prettier not found in ${root}: run npm install.\n`);
  process.exit(1);
}
const result = spawnSync(process.execPath, [prettier, "--write", "--ignore-unknown", "--log-level", "warn", file], {
  cwd: root,
  stdio: ["ignore", "inherit", "inherit"],
  env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
});
process.exit(result.status === 0 ? 0 : 1);
