#!/usr/bin/env node
// Stops the local dev server: kills whatever listens on a dev port (default 4321)
// together with the node/workerd processes that started it. Windows only.
// Usage: node .claude/scripts/kill-port.mjs [port...]
// Exit 0 = port(s) free, 1 = still listening, 2 = usage error.
import { execFileSync } from "node:child_process";

const ALLOWED = new Set([4321, 4322, 4323, 8787]);
const WRAPPERS = new Set(["node.exe", "workerd.exe"]);

const ports = process.argv.slice(2).map(Number);
if (ports.length === 0) ports.push(4321);
const bad = ports.filter((p) => !ALLOWED.has(p));
if (bad.length > 0) {
  console.error(`Not a dev port: ${bad.join(", ")} (allowed: ${[...ALLOWED].join(", ")})`);
  process.exit(2);
}

function listeners(port) {
  const out = execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" });
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    const [proto, local, , state, pid] = line.trim().split(/\s+/);
    if (proto === "TCP" && state === "LISTENING" && local.endsWith(`:${port}`)) pids.add(Number(pid));
  }
  return [...pids];
}

function processTable() {
  const json = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress",
    ],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  return new Map(JSON.parse(json).map((p) => [p.ProcessId, p]));
}

const found = ports.flatMap((port) => listeners(port).map((pid) => ({ port, pid })));
if (found.length === 0) {
  console.log(`Nothing listening on ${ports.join(", ")}`);
  process.exit(0);
}

const table = processTable();

// Never kill anything this script itself runs under (the shell, the agent).
const mine = new Set();
for (let p = process.pid; table.has(p) && !mine.has(p); p = table.get(p).ParentProcessId) mine.add(p);

const roots = new Set();
for (const { port, pid } of found) {
  let top = pid;
  for (;;) {
    const parent = table.get(table.get(top)?.ParentProcessId);
    if (!parent || mine.has(parent.ProcessId) || !WRAPPERS.has(parent.Name.toLowerCase())) break;
    top = parent.ProcessId;
  }
  if (mine.has(top)) {
    console.error(`Port ${port}: PID ${top} is an ancestor of this script, not killing it`);
    continue;
  }
  roots.add(top);
  console.log(`Port ${port}: PID ${pid} (${table.get(pid)?.Name ?? "?"}), killing tree from PID ${top}`);
}

for (const pid of roots) {
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // already gone, or part of a tree killed a moment ago
  }
}

Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
const left = ports.filter((port) => listeners(port).length > 0);
if (left.length > 0) {
  console.error(`Still listening: ${left.join(", ")}`);
  process.exit(1);
}
console.log(`Free: ${ports.join(", ")}`);
