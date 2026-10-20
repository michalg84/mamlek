// Open pull requests of the current user that need attention, for two readers:
//   --hook  SessionStart hook: asks GitHub now, caches the answer and prints the PRs with a red check (or green but
//           not set to auto-merge) to stdout, which Claude Code adds to the agent's context. /ship turns on auto-merge
//           and does not wait for CI, so this is how a red PR reaches the next session (also after /clear).
//   --line  status line: prints a short summary ("PR:1❌ 1⏳") from the cache only, so it never waits on the network;
//           a cache older than 60 s is refreshed by a detached --refresh run.
// Never blocks: no gh, no network or no login → nothing printed, exit 0. Node, not bash: this host has no jq.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Claude Code kills the hook at the 15 s timeout in settings.json; gh gets less. Override only in the proof tests.
const BUDGET_MS = Number(process.env.PR_STATUS_BUDGET_MS) || 10_000;
const STALE_MS = 60_000;
const FAILED = new Set(["FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE", "ERROR"]);

const mode = process.argv[2] ?? "--hook";
const root =
  spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", windowsHide: true }).stdout?.trim() ||
  process.cwd();
const cacheFile = path.join(
  os.tmpdir(),
  "claude-pr-status",
  `${createHash("sha1").update(path.resolve(root)).digest("hex").slice(0, 12)}.json`,
);

// gh itself, or a node stub in the proof tests (PR_STATUS_GH).
function gh(args) {
  const stub = process.env.PR_STATUS_GH;
  const [cmd, argv] = stub ? [process.execPath, [stub, ...args]] : ["gh", args];
  return spawnSync(cmd, argv, { cwd: root, encoding: "utf8", timeout: BUDGET_MS, windowsHide: true });
}

function query() {
  const r = gh([
    "pr",
    "list",
    "--author",
    "@me",
    "--state",
    "open",
    "--json",
    "number,title,url,autoMergeRequest,statusCheckRollup",
  ]);
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout).map(classify);
  } catch {
    return null;
  }
}

function classify(pr) {
  const checks = pr.statusCheckRollup ?? [];
  const failed = checks.filter((c) => FAILED.has(c.conclusion ?? c.state)).map((c) => c.name ?? c.context ?? "check");
  const pending = checks.some(
    (c) => (c.status && c.status !== "COMPLETED") || ["PENDING", "EXPECTED"].includes(c.state),
  );
  const state = failed.length ? "failed" : pending ? "pending" : pr.autoMergeRequest ? "pending" : "manual";
  return { number: pr.number, title: pr.title, url: pr.url, state, failed };
}

function save(prs) {
  mkdirSync(path.dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify({ at: Date.now(), prs }));
}

function load() {
  try {
    return JSON.parse(readFileSync(cacheFile, "utf8"));
  } catch {
    return null;
  }
}

if (mode === "--refresh") {
  const prs = query();
  if (prs) save(prs);
} else if (mode === "--line") {
  const cache = load();
  if (!cache || Date.now() - cache.at > STALE_MS) {
    spawn(process.execPath, [fileURLToPath(import.meta.url), "--refresh"], {
      cwd: root,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  }
  const prs = cache?.prs ?? [];
  const count = (state) => prs.filter((p) => p.state === state).length;
  const parts = [
    count("failed") && `${count("failed")}❌`,
    count("manual") && `${count("manual")}⚠`,
    count("pending") && `${count("pending")}⏳`,
  ].filter(Boolean);
  if (parts.length) process.stdout.write(`PR:${parts.join(" ")}`);
} else {
  const prs = query();
  if (prs) {
    save(prs);
    const lines = prs
      .filter((p) => p.state === "failed" || p.state === "manual")
      .map((p) =>
        p.state === "failed"
          ? `- #${p.number} "${p.title}": ${p.failed.join(", ")} failed, auto-merge is stuck — ${p.url}`
          : `- #${p.number} "${p.title}": checks green but auto-merge is off, waiting for a manual merge — ${p.url}`,
      );
    if (lines.length) {
      console.log(
        `Open pull requests need attention:\n${lines.join("\n")}\nTell the user about them before starting new work.`,
      );
    }
  }
}
