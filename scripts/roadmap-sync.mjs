// Roadmap sync: parses context/foundation/roadmap.md into the desired backlog state (milestone + items).
// Zero dependencies on purpose. Preview without touching GitHub: node scripts/roadmap-sync.mjs --dry-run
// ROADMAP_PATH env overrides the roadmap file (e.g. a scratch copy): ROADMAP_PATH=/tmp/roadmap.md node scripts/roadmap-sync.mjs --dry-run

import { readFileSync } from "node:fs";
import path from "node:path";

const ROADMAP_PATH = path.resolve(
  process.env.ROADMAP_PATH ?? path.join(import.meta.dirname, "..", "context", "foundation", "roadmap.md"),
);
const STATUSES = ["proposed", "ready", "planning", "in-progress", "done"];
const NONE = new Set(["", "—", "-"]);

class RoadmapError extends Error {}

function section(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) throw new RoadmapError(`missing section "## ${heading}"`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return end === -1 ? rest : rest.slice(0, end);
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

// Returns rows as objects keyed by the requested column names; headers are matched by prefix, not position.
function table(lines, sectionName, columns) {
  const start = lines.findIndex((line) => line.trim().startsWith("|"));
  if (start === -1) throw new RoadmapError(`section "${sectionName}" has no table`);
  const rows = [];
  for (const line of lines.slice(start)) {
    if (!line.trim().startsWith("|")) break;
    rows.push(splitRow(line));
  }
  const [header, _separator, ...body] = rows;
  const index = {};
  for (const [key, prefix] of Object.entries(columns)) {
    const i = header.findIndex((cell) => cell.startsWith(prefix));
    if (i === -1) throw new RoadmapError(`section "${sectionName}" table is missing column "${prefix}"`);
    index[key] = i;
  }
  return body.map((cells) => Object.fromEntries(Object.entries(index).map(([key, i]) => [key, cells[i] ?? ""])));
}

function byId(rows, sectionName, errors) {
  const map = new Map();
  for (const row of rows) {
    if (!row.id) errors.push(`${sectionName}: row with empty ID`);
    else if (map.has(row.id)) errors.push(`${sectionName}: duplicate ID ${row.id}`);
    else map.set(row.id, row);
  }
  return map;
}

function parseRoadmap(markdown) {
  const milestoneLine = section(markdown, "Milestone").find((line) => /^\*\*M-\d+:/.test(line.trim()));
  const milestoneMatch = /^\*\*((M-\d+):[^*]+)\*\*\s*—\s*Status:\s*(\S+)/.exec(milestoneLine?.trim() ?? "");
  if (!milestoneMatch) throw new RoadmapError('section "Milestone" has no "**M-N: <title>** — Status: <status>" line');
  const milestone = { id: milestoneMatch[2], title: milestoneMatch[1].trim(), status: milestoneMatch[3] };

  const glance = table(section(markdown, "At a glance"), "At a glance", {
    id: "ID",
    changeId: "Change ID",
    outcome: "Outcome",
    prerequisites: "Prerequisites",
    prdRefs: "PRD refs",
    status: "Status",
  });
  const handoff = table(section(markdown, "Backlog Handoff"), "Backlog Handoff", {
    id: "Roadmap ID",
    issueTitle: "Suggested issue title",
  });
  const streams = table(section(markdown, "Streams"), "Streams", { stream: "Stream", chain: "Chain" });

  const errors = [];
  const glanceById = byId(glance, "At a glance", errors);
  const handoffById = byId(handoff, "Backlog Handoff", errors);
  for (const id of glanceById.keys()) {
    if (!handoffById.has(id)) errors.push(`${id}: in At a glance but has no Backlog Handoff row`);
  }
  for (const id of handoffById.keys()) {
    if (!glanceById.has(id)) errors.push(`${id}: in Backlog Handoff but has no At a glance row`);
  }

  const items = [...glanceById.values()].map((row) => {
    const prerequisites = NONE.has(row.prerequisites) ? [] : row.prerequisites.split(",").map((p) => p.trim());
    if (!STATUSES.includes(row.status)) {
      errors.push(`${row.id}: status "${row.status}" is not one of ${STATUSES.join("|")}`);
    }
    for (const prerequisite of prerequisites) {
      if (!glanceById.has(prerequisite)) errors.push(`${row.id}: prerequisite "${prerequisite}" is not a known ID`);
    }
    const stream = streams.find((s) => s.chain.includes(`\`${row.id}\``))?.stream ?? "";
    const issueTitle = handoffById.get(row.id)?.issueTitle ?? "";
    return {
      id: row.id,
      changeId: row.changeId,
      title: `${row.id}: ${issueTitle}`,
      outcome: row.outcome,
      prerequisites,
      prdRefs: row.prdRefs,
      status: row.status,
      stream,
    };
  });

  if (errors.length) throw new RoadmapError(errors.join("\n  "));
  return { milestone, items };
}

function printDesiredState({ milestone, items }) {
  console.log(`Milestone  ${milestone.title}  [${milestone.status}]\n`);
  for (const item of items) {
    console.log(`${item.id.padEnd(5)} ${item.status.padEnd(11)} stream ${item.stream || "-"}  ${item.title}`);
    console.log(`      change: ${item.changeId}  prerequisites: ${item.prerequisites.join(", ") || "—"}`);
  }
  console.log(`\n${items.length} item(s) parsed from ${ROADMAP_PATH}`);
}

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== "--dry-run");
if (unknown.length) {
  console.error(`Unknown argument(s): ${unknown.join(" ")}. Only --dry-run is supported.`);
  process.exit(2);
}

let desired;
try {
  desired = parseRoadmap(readFileSync(ROADMAP_PATH, "utf8"));
} catch (error) {
  if (!(error instanceof RoadmapError)) throw error;
  console.error(`Invalid roadmap (${ROADMAP_PATH}):\n  ${error.message}`);
  process.exit(1);
}

if (args.includes("--dry-run")) {
  printDesiredState(desired);
} else {
  console.error("GitHub sync not implemented yet. Run with --dry-run to preview the parsed roadmap.");
  process.exit(1);
}
