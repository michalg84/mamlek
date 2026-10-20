// Proof of the Claude Code hooks in .claude/hooks/ (configured in .claude/settings.json): each case pipes a hook
// payload into the real script, inside a throwaway git repo, and checks the exit code and the channel the agent
// reads (Stop: exit 2 + stderr). Git and the scripts are real; ESLint, astro, Vitest, ui:scan and Prettier are stubs that
// log their calls and fail on a marker (LINT_ERROR, TYPE_ERROR, TEST_FAIL, UI_HIT), so the suite needs no install or
// network.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SOURCE = fileURLToPath(new URL("../../", import.meta.url));

const STUBS: Record<string, string> = {
  "node_modules/eslint/bin/eslint.js": `
const fs = require("fs");
const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
fs.appendFileSync(process.env.STUB_LOG, "eslint " + files.join(" ") + "\\n");
let bad = false;
for (const f of files) if (fs.readFileSync(f, "utf8").includes("LINT_ERROR")) {
  console.log(f + "\\n  1:7  error  'unused' is assigned a value but never used  @typescript-eslint/no-unused-vars");
  bad = true;
}
process.exit(bad ? 1 : 0);
`,
  "node_modules/astro/bin/astro.mjs": `
import fs from "node:fs";
fs.appendFileSync(process.env.STUB_LOG, "astro " + process.argv.slice(2).join(" ") + "\\n");
const sources = fs.readdirSync("src", { recursive: true }).map(String).filter((f) => fs.statSync("src/" + f).isFile());
// SLOW: hangs like a type check that never ends.
if (sources.some((f) => fs.readFileSync("src/" + f, "utf8").includes("SLOW"))) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000);
const bad = sources.filter((f) => fs.readFileSync("src/" + f, "utf8").includes("TYPE_ERROR"));
// Coloured like the real astro check, which ignores NO_COLOR.
for (const f of bad) console.log("\\u001b[96msrc/" + f + "\\u001b[0m:1:7 - \\u001b[91merror\\u001b[0m ts(2322): Type 'string' is not assignable to type 'number'.");
process.exit(bad.length ? 1 : 0);
`,
  "node_modules/vitest/vitest.mjs": `
import fs from "node:fs";
fs.appendFileSync(process.env.STUB_LOG, "vitest " + process.argv.slice(2).join(" ") + "\\n");
const sources = fs.readdirSync("src", { recursive: true }).map(String).filter((f) => fs.statSync("src/" + f).isFile());
const bad = sources.filter((f) => fs.readFileSync("src/" + f, "utf8").includes("TEST_FAIL"));
for (const f of bad) console.log(" FAIL  src/" + f + " > rule > rejects the input\\nAssertionError: expected 1 to be 2");
process.exit(bad.length ? 1 : 0);
`,
  "node_modules/prettier/bin/prettier.cjs": `
require("fs").appendFileSync(process.env.STUB_LOG, "prettier " + process.argv.slice(2).join(" ") + "\\n");
`,
};
const UI_SCAN_STUB = `
import fs from "node:fs";
const files = process.argv.slice(2);
fs.appendFileSync(process.env.STUB_LOG, "ui-scan " + files.join(" ") + "\\n");
const hits = files.filter((f) => fs.readFileSync(f, "utf8").includes("UI_HIT"));
for (const f of hits) console.log(f + ":1: className=\\"text-blue-100\\" UI_HIT");
process.exit(hits.length ? 1 : 0);
`;

const cleanups: string[] = [];
afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanups.push(dir);
  return dir;
}

// The hooks run git themselves: never let a surrounding git hook (lint-staged) leak its GIT_* variables into them.
function baseEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: baseEnv() });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function write(root: string, file: string, content: string): string {
  const full = path.join(root, file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

function installStubs(root: string): void {
  for (const [file, content] of Object.entries(STUBS)) write(root, file, content);
}

interface Sandbox {
  root: string;
  tmp: string;
  log: string;
  calls: () => string;
}

// A committed, clean checkout with the real hooks and settings copied in.
function sandbox(): Sandbox {
  const tmp = tempDir("agent-hooks-");
  const root = path.join(tmp, "repo");
  mkdirSync(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "hooks@test.invalid");
  git(root, "config", "user.name", "hooks test");
  git(root, "config", "core.autocrlf", "false");
  cpSync(path.join(SOURCE, ".claude", "hooks"), path.join(root, ".claude", "hooks"), { recursive: true });
  cpSync(path.join(SOURCE, ".claude", "settings.json"), path.join(root, ".claude", "settings.json"));
  write(root, ".gitignore", "node_modules/\n");
  write(root, "scripts/ui-scan.mjs", UI_SCAN_STUB);
  write(root, "src/ok.ts", "export const ok = 1;\n");
  write(root, "README.md", "# repo\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  installStubs(root);
  const log = path.join(tmp, "calls.log");
  writeFileSync(log, "");
  return { root, tmp, log, calls: () => readFileSync(log, "utf8") };
}

interface HookResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runHook(
  sb: Sandbox,
  script: "end-of-turn.mjs" | "format.mjs",
  input: unknown,
  options: { cwd?: string; projectDir?: string; scriptRoot?: string; env?: NodeJS.ProcessEnv } = {},
): HookResult {
  const result = spawnSync(process.execPath, [path.join(options.scriptRoot ?? sb.root, ".claude", "hooks", script)], {
    cwd: options.cwd ?? sb.root,
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    env: {
      ...baseEnv(),
      STUB_LOG: sb.log,
      TMP: sb.tmp,
      TEMP: sb.tmp,
      TMPDIR: sb.tmp,
      CLAUDE_PROJECT_DIR: options.projectDir ?? sb.root,
      ...options.env,
    },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

const stop = (cwd: string, extra: Record<string, unknown> = {}) => ({
  hook_event_name: "Stop",
  session_id: "s1",
  cwd,
  stop_hook_active: false,
  ...extra,
});
const edit = (cwd: string, filePath: string) => ({
  hook_event_name: "PostToolUse",
  session_id: "s1",
  cwd,
  tool_name: "Edit",
  tool_input: { file_path: filePath },
});

describe("end-of-turn.mjs (Stop)", () => {
  it("passes without running any check when nothing changed", () => {
    const sb = sandbox();
    const r = runHook(sb, "end-of-turn.mjs", stop(sb.root));
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    expect(sb.calls()).toBe("");
  });

  it("passes a clean change after linting it and checking the project", () => {
    const sb = sandbox();
    write(sb.root, "src/ok.ts", "export const ok = 2;\n");
    const r = runHook(sb, "end-of-turn.mjs", stop(sb.root));
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    expect(sb.calls()).toContain("eslint src/ok.ts");
    expect(sb.calls()).toContain("astro check");
    expect(sb.calls()).toContain("vitest run --project unit --project component");
  });

  it("blocks with exit 2 on a lint error written straight to disk, naming the file", () => {
    const sb = sandbox();
    // No PostToolUse payload: the file was written the way a shell command would write it.
    write(sb.root, "src/bad.ts", "const unused = 1; // LINT_ERROR\n");
    const r = runHook(sb, "end-of-turn.mjs", stop(sb.root));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("ESLint errors in changed files");
    expect(r.stderr).toContain("src/bad.ts");
    expect(r.stderr).toContain("no-unused-vars");
  });

  it("blocks on a type error reported by astro check", () => {
    const sb = sandbox();
    write(sb.root, "src/ok.ts", "export const ok: number = 'one'; // TYPE_ERROR\n");
    const r = runHook(sb, "end-of-turn.mjs", stop(sb.root));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("astro check fails");
    expect(r.stderr).toContain("src/ok.ts:1:7 - error ts(2322)");
    expect(r.stderr).not.toContain("\u001b[");
  });

  it("blocks on a failing unit/component test, naming the test", () => {
    const sb = sandbox();
    write(sb.root, "src/x.test.ts", "it('rejects the input', () => {}); // TEST_FAIL\n");
    const r = runHook(sb, "end-of-turn.mjs", stop(sb.root));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("Unit/component tests fail");
    expect(r.stderr).toContain("FAIL  src/x.test.ts");
    expect(sb.calls()).toContain("vitest run --project unit --project component");
  });

  it("runs the tests when only the test setup changed, but not for an uncovered file", () => {
    const sb = sandbox();
    write(sb.root, "tests/fixtures/data.json", "{}\n");
    expect(runHook(sb, "end-of-turn.mjs", stop(sb.root)).code).toBe(0);
    expect(sb.calls()).toContain("vitest run --project unit --project component");

    const other = sandbox();
    write(other.root, "README.md", "# changed\n");
    expect(runHook(other, "end-of-turn.mjs", stop(other.root)).code).toBe(0);
    expect(other.calls()).not.toContain("vitest");
  });

  it("checks a changed file with a non-ASCII name", () => {
    const sb = sandbox();
    write(sb.root, "src/żółw.ts", "const unused = 1; // LINT_ERROR\n");
    const r = runHook(sb, "end-of-turn.mjs", stop(sb.root));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("src/żółw.ts");
  });

  it("blocks and says so when a check does not finish within the hook's budget", () => {
    const sb = sandbox();
    write(sb.root, "src/ok.ts", "export const ok = 2; // SLOW\n");
    const r = runHook(sb, "end-of-turn.mjs", stop(sb.root), { env: { END_OF_TURN_BUDGET_MS: "1500" } });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("did not finish within the 1.5 s budget");
  });

  it("blocks on a ui:scan hit in a changed view", () => {
    const sb = sandbox();
    write(sb.root, "src/View.tsx", 'export const View = () => <p className="text-blue-100">UI_HIT</p>;\n');
    const r = runHook(sb, "end-of-turn.mjs", stop(sb.root));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("ui:scan");
    expect(r.stderr).toContain("src/View.tsx:1");
  });

  it("checks nothing when only uncovered files changed", () => {
    const sb = sandbox();
    write(sb.root, "README.md", "# changed\n");
    const r = runHook(sb, "end-of-turn.mjs", stop(sb.root));
    expect(r.code).toBe(0);
    expect(sb.calls()).toBe("");
  });

  it("does not lint a deleted file, but still checks the project that may import it", () => {
    const sb = sandbox();
    rmSync(path.join(sb.root, "src/ok.ts"));
    const r = runHook(sb, "end-of-turn.mjs", stop(sb.root));
    expect(r.code).toBe(0);
    expect(sb.calls()).not.toContain("eslint");
    expect(sb.calls()).toContain("astro check");
    // A deleted module can break the tests that import it, so the suite runs too.
    expect(sb.calls()).toContain("vitest run");
  });

  it("blocks when a deletion leaves a type error in the project", () => {
    const sb = sandbox();
    // The committed importer stands for a file that stops compiling once its dependency is gone: the astro stub
    // reports its marker. The turn only deletes the dependency, so no changed file is left to lint.
    write(sb.root, "src/uses-ok.ts", "import { ok } from './ok'; export const twice = ok * 2; // TYPE_ERROR\n");
    git(sb.root, "add", "-A");
    git(sb.root, "commit", "-q", "-m", "add importer");
    rmSync(path.join(sb.root, "src/ok.ts"));
    const r = runHook(sb, "end-of-turn.mjs", stop(sb.root));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("astro check fails");
  });

  it.each([
    ["stop_hook_active", { stop_hook_active: true }],
    ["Cursor loop_count", { loop_count: 1 }],
  ])("lets the agent finish on the retry (%s) even with the error still there", (_name, extra) => {
    const sb = sandbox();
    write(sb.root, "src/bad.ts", "const unused = 1; // LINT_ERROR\n");
    const r = runHook(sb, "end-of-turn.mjs", stop(sb.root, extra));
    expect(r.code).toBe(0);
    expect(sb.calls()).toBe("");
  });

  it.each([
    ["{}", "{}"],
    ["not json", "not json"],
    ["empty stdin", ""],
  ])("tolerates a %s payload (checks the process cwd)", (_name, input) => {
    const sb = sandbox();
    const r = runHook(sb, "end-of-turn.mjs", input);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
  });

  it("falls back to the directory it runs in when git cannot read the payload cwd", () => {
    const sb = sandbox();
    write(sb.root, "src/bad.ts", "const unused = 1; // LINT_ERROR\n");
    const r = runHook(sb, "end-of-turn.mjs", stop(path.join(sb.tmp, "no", "such", "dir")));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("src/bad.ts");
  });

  it("says so, without blocking, when the cwd is not a git checkout", () => {
    const sb = sandbox();
    const outside = tempDir("agent-hooks-nogit-");
    const r = runHook(sb, "end-of-turn.mjs", stop(outside), { cwd: outside });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("systemMessage");
  });

  it.each([
    ["ESLint", "node_modules/eslint/bin/eslint.js"],
    ["astro", "node_modules/astro/bin/astro.mjs"],
    ["Vitest", "node_modules/vitest/vitest.mjs"],
  ])("fails visibly (exit 2) when %s is not installed", (_name, bin) => {
    const sb = sandbox();
    rmSync(path.join(sb.root, bin));
    write(sb.root, "src/ok.ts", "export const ok = 2;\n");
    const r = runHook(sb, "end-of-turn.mjs", stop(sb.root));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(`${bin} not found`);
    expect(r.stderr).toContain("run npm install");
  });

  it("checks the session's checkout, not a stale CLAUDE_PROJECT_DIR holding an error", () => {
    const sb = sandbox();
    const other = sandbox();
    write(other.root, "src/bad.ts", "const unused = 1; // LINT_ERROR\n");
    const r = runHook(sb, "end-of-turn.mjs", stop(sb.root), { projectDir: other.root });
    expect(r.code).toBe(0);
  });

  it("sweeps a sibling worktree that format.mjs registered for the session, then clears the registry", () => {
    const sb = sandbox();
    const wt = path.join(sb.tmp, "wt");
    git(sb.root, "worktree", "add", "-q", wt, "-b", "side");
    installStubs(wt);
    const bad = write(wt, "src/bad.ts", "const unused = 1; // LINT_ERROR\n");
    expect(runHook(sb, "format.mjs", edit(sb.root, bad)).code).toBe(0);

    const blocked = runHook(sb, "end-of-turn.mjs", stop(sb.root));
    expect(blocked.code).toBe(2);
    expect(blocked.stderr).toContain("src/bad.ts");
    expect(blocked.stderr).toContain("wt");

    rmSync(bad);
    expect(runHook(sb, "end-of-turn.mjs", stop(sb.root)).code).toBe(0);
    expect(readFileSync(path.join(sb.tmp, "claude-hooks", "s1.roots"), "utf8")).toBe("");
  });
});

describe("format.mjs (PostToolUse Write|Edit)", () => {
  it("formats the edited file only", () => {
    const sb = sandbox();
    const file = write(sb.root, "src/ok.ts", "export const ok = 3;\n");
    const r = runHook(sb, "format.mjs", edit(sb.root, file));
    expect(r.code).toBe(0);
    expect(sb.calls()).toContain(`prettier --write --ignore-unknown --log-level warn ${file}`);
  });

  it("formats an edited JavaScript module too", () => {
    const sb = sandbox();
    const file = write(sb.root, "scripts/tool.mjs", "export const tool = 1;\n");
    const r = runHook(sb, "format.mjs", edit(sb.root, file));
    expect(r.code).toBe(0);
    expect(sb.calls()).toContain(`prettier --write --ignore-unknown --log-level warn ${file}`);
  });

  it("resolves a relative path against the payload cwd", () => {
    const sb = sandbox();
    const r = runHook(sb, "format.mjs", edit(path.join(sb.root, "src"), "ok.ts"), { cwd: os.tmpdir() });
    expect(r.code).toBe(0);
    expect(sb.calls()).toContain(path.join(sb.root, "src", "ok.ts"));
  });

  it.each([
    ["an uncovered type", (root: string) => write(root, "db/x.sql", "select 1;\n")],
    ["a nonexistent file", (root: string) => path.join(root, "src", "missing.ts")],
  ])("skips %s", (_name, target) => {
    const sb = sandbox();
    const r = runHook(sb, "format.mjs", edit(sb.root, target(sb.root)));
    expect(r.code).toBe(0);
    expect(sb.calls()).toBe("");
  });

  it.each([
    ["{}", "{}"],
    ["not json", "not json"],
    ["a tool call without a path", JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } })],
  ])("tolerates %s", (_name, input) => {
    const sb = sandbox();
    const r = runHook(sb, "format.mjs", input);
    expect(r.code).toBe(0);
    expect(sb.calls()).toBe("");
  });

  it("skips a file of another repository", () => {
    const sb = sandbox();
    const other = sandbox();
    const r = runHook(sb, "format.mjs", edit(sb.root, path.join(other.root, "src", "ok.ts")));
    expect(r.code).toBe(0);
    expect(sb.calls()).toBe("");
  });

  it("fails visibly when Prettier is not installed", () => {
    const sb = sandbox();
    rmSync(path.join(sb.root, "node_modules/prettier/bin/prettier.cjs"));
    const r = runHook(sb, "format.mjs", edit(sb.root, path.join(sb.root, "src", "ok.ts")));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("Prettier not found");
  });
});

describe(".claude/settings.json commands", () => {
  // Claude Code runs hook commands with Git Bash on Windows, sh elsewhere.
  function shell(): string {
    if (process.platform !== "win32") return "sh";
    return path.resolve(git(SOURCE, "--exec-path"), "..", "..", "..", "bin", "bash.exe");
  }

  it("reach their scripts from the checkout and from a worktree, even with a nonexistent CLAUDE_PROJECT_DIR", () => {
    const sb = sandbox();
    const wt = path.join(sb.tmp, "wt");
    git(sb.root, "worktree", "add", "-q", wt, "-b", "side");
    const settings = JSON.parse(readFileSync(path.join(SOURCE, ".claude", "settings.json"), "utf8")) as {
      hooks: Record<string, { hooks: { command: string; timeout: number }[] }[]>;
    };
    const commands = Object.values(settings.hooks).flatMap((groups) => groups.flatMap((g) => g.hooks));
    expect(commands.length).toBeGreaterThan(0);
    for (const { command, timeout } of commands) {
      expect(timeout).toBeLessThanOrEqual(120); // seconds, not milliseconds
      for (const cwd of [sb.root, wt]) {
        const r = spawnSync(shell(), ["-c", command], {
          cwd,
          input: "{}",
          encoding: "utf8",
          env: { ...baseEnv(), STUB_LOG: sb.log, CLAUDE_PROJECT_DIR: path.join(sb.tmp, "nonexistent") },
        });
        expect(r.stderr, command).toBe("");
        expect(r.status, command).toBe(0);
      }
    }
  });
});
