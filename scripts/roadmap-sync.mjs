// Roadmap sync: parses context/foundation/roadmap.md into the desired backlog state (milestone + items)
// and mirrors it one way to GitHub (label, milestone, issues) through the `gh` CLI.
// Zero dependencies on purpose. Preview (reads only, no writes): node scripts/roadmap-sync.mjs --dry-run
// ROADMAP_PATH env overrides the roadmap file (e.g. a scratch copy): ROADMAP_PATH=/tmp/roadmap.md node scripts/roadmap-sync.mjs --dry-run

import { execFileSync } from "node:child_process";
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

// --- GitHub access: everything goes through the `gh` CLI, so auth is whatever `gh auth` holds. ---

class GhError extends Error {}

function gh(args, { input } = {}) {
  try {
    return execFileSync("gh", args, {
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const detail = (error.stderr || error.message || "").toString().trim();
    throw new GhError(`gh ${args.slice(0, 3).join(" ")} failed: ${detail}`);
  }
}

function ghJson(args, options) {
  const out = gh(args, options).trim();
  return out ? JSON.parse(out) : null;
}

// GET every page of a REST list endpoint (bodies/titles never go through argv, so no quoting issues).
function ghList(endpoint) {
  return (ghJson(["api", endpoint, "--paginate", "--slurp"]) ?? []).flat();
}

// Write request with a JSON body on stdin (UTF-8, backticks and newlines survive on Windows).
function ghWrite(method, endpoint, payload) {
  return ghJson(["api", "-X", method, endpoint, "--input", "-"], { input: JSON.stringify(payload) });
}

// --- Sync steps: each reads current GitHub state, diffs against the desired state, writes only differences. ---

const LABEL = "roadmap";
const MARKER = /<!--\s*roadmap-id:\s*(\S+)\s*-->/;

function action(ctx, verb, text) {
  ctx.changes++;
  console.log(`${ctx.dryRun ? `would ${verb}` : verb.replace(/e?$/, "ed")}  ${text}`);
}

function normalizeBody(body) {
  return (body ?? "").replace(/\r\n/g, "\n").trim();
}

function issueBody(item, repo) {
  const roadmapUrl = `https://github.com/${repo.owner}/${repo.name}/blob/main/context/foundation/roadmap.md`;
  return [
    `<!-- roadmap-id: ${item.id} -->`,
    `**Outcome:** ${item.outcome}`,
    `**Change ID:** \`${item.changeId}\``,
    `**PRD refs:** ${item.prdRefs}`,
    `**Prerequisites:** ${item.prerequisites.join(", ") || "—"}`,
    "",
    `_Generated from [\`context/foundation/roadmap.md\`](${roadmapUrl}) by \`npm run roadmap:sync\` — edits made here are overwritten on the next sync._`,
  ].join("\n");
}

function ensureLabel(ctx) {
  const labels = ghList(`repos/${ctx.repo.owner}/${ctx.repo.name}/labels?per_page=100`);
  if (labels.some((label) => label.name.toLowerCase() === LABEL)) return;
  action(ctx, "create", `label ${LABEL}`);
  if (!ctx.dryRun) {
    gh([
      "label",
      "create",
      LABEL,
      "--repo",
      `${ctx.repo.owner}/${ctx.repo.name}`,
      "--color",
      "0E8A16",
      "--description",
      "Mirrored from context/foundation/roadmap.md",
    ]);
  }
}

// Returns the milestone number, or null when it would be created in a dry run.
function ensureMilestone(ctx, milestone) {
  const repoPath = `repos/${ctx.repo.owner}/${ctx.repo.name}`;
  const existing = ghList(`${repoPath}/milestones?state=all&per_page=100`).find((m) => m.title === milestone.title);
  if (existing) {
    if (existing.state === "closed" && milestone.status === "open") {
      ctx.warnings.push(
        `milestone "${milestone.title}" is closed on GitHub but open in roadmap.md — left closed; reopen it by hand if intended`,
      );
    }
    return existing.number;
  }
  action(ctx, "create", `milestone ${milestone.title}`);
  if (ctx.dryRun) return null;
  return ghWrite("POST", `${repoPath}/milestones`, { title: milestone.title, state: "open" }).number;
}

// Fills ctx.issues: roadmap ID -> { number, id (database id), node_id, state }; number/id/node_id are null for
// issues that would be created in a dry run. Later steps (board, dependencies) consume this map.
function ensureIssues(ctx, { milestone, items }, milestoneNumber) {
  const repoPath = `repos/${ctx.repo.owner}/${ctx.repo.name}`;
  const byMarker = new Map();
  // Unfiltered listing: the label-filtered one lags right after writes, which made a quick re-run miss fresh issues
  // and create duplicates. The marker is the matching key; the label only drives the "no marker" warning.
  const listed = ghList(`${repoPath}/issues?state=all&per_page=100`)
    .filter((issue) => !issue.pull_request)
    .sort((a, b) => a.number - b.number);
  for (const issue of listed) {
    const id = MARKER.exec(issue.body ?? "")?.[1];
    if (!id) {
      if (issue.labels.some((label) => label.name.toLowerCase() === LABEL)) {
        ctx.warnings.push(`#${issue.number} has the "${LABEL}" label but no roadmap-id marker — left alone`);
      }
    } else if (byMarker.has(id)) {
      ctx.warnings.push(`#${issue.number} duplicates roadmap-id ${id} (kept #${byMarker.get(id).number}) — left alone`);
    } else byMarker.set(id, issue);
  }
  const knownIds = new Set(items.map((item) => item.id));
  for (const [id, issue] of byMarker) {
    if (!knownIds.has(id)) ctx.warnings.push(`#${issue.number} (${id}) is not in roadmap.md — left alone`);
  }

  const milestoneNote = milestoneNumber === null ? ` (in new milestone ${milestone.id})` : "";
  for (const item of items) {
    const body = issueBody(item, ctx.repo);
    const issue = byMarker.get(item.id);

    if (!issue) {
      action(ctx, "create", `issue ${item.title}${milestoneNote}`);
      if (ctx.dryRun) {
        ctx.issues.set(item.id, { number: null, id: null, node_id: null, state: "open" });
        continue;
      }
      const created = ghWrite("POST", `${repoPath}/issues`, {
        title: item.title,
        body,
        labels: [LABEL],
        ...(milestoneNumber === null ? {} : { milestone: milestoneNumber }),
      });
      ctx.issues.set(item.id, {
        number: created.number,
        id: created.id,
        node_id: created.node_id,
        state: created.state,
      });
      continue;
    }

    ctx.issues.set(item.id, { number: issue.number, id: issue.id, node_id: issue.node_id, state: issue.state });
    const patch = {};
    if (issue.title !== item.title) patch.title = item.title;
    if (normalizeBody(issue.body) !== normalizeBody(body)) patch.body = body;
    if ((issue.milestone?.number ?? null) !== milestoneNumber) patch.milestone = milestoneNumber;
    const labelNames = issue.labels.map((label) => label.name);
    if (!labelNames.some((name) => name.toLowerCase() === LABEL)) patch.labels = [...labelNames, LABEL];
    if (Object.keys(patch).length) {
      const fields = Object.keys(patch).join(", ");
      action(
        ctx,
        "update",
        `issue #${issue.number} ${item.title} (${fields}${"milestone" in patch ? milestoneNote : ""})`,
      );
      if (!ctx.dryRun) ghWrite("PATCH", `${repoPath}/issues/${issue.number}`, patch);
    }
    if (issue.state === "closed" && item.status !== "done") {
      ctx.warnings.push(
        `#${issue.number} (${item.id}) is closed on GitHub but "${item.status}" in roadmap.md — not reopened; run /10x-archive if the change is finished`,
      );
    }
  }
}

function sync(desired, dryRun) {
  const repoInfo = ghJson(["repo", "view", "--json", "owner,name"]);
  const ctx = {
    dryRun,
    repo: { owner: repoInfo.owner.login, name: repoInfo.name },
    changes: 0,
    warnings: [],
    issues: new Map(),
  };
  console.log(`${dryRun ? "Dry run — no writes. " : ""}Syncing roadmap to ${ctx.repo.owner}/${ctx.repo.name}\n`);

  ensureLabel(ctx);
  const milestoneNumber = ensureMilestone(ctx, desired.milestone);
  ensureIssues(ctx, desired, milestoneNumber);

  console.log(
    ctx.changes
      ? `\n${ctx.changes} change(s) ${dryRun ? "planned" : "applied"} (label, milestone, issues)`
      : "\nLabel, milestone & issues: no changes",
  );
  if (ctx.warnings.length) {
    console.log(`\nWarnings (${ctx.warnings.length}):`);
    for (const warning of ctx.warnings) console.log(`  - ${warning}`);
  }
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

const dryRun = args.includes("--dry-run");
if (dryRun) {
  printDesiredState(desired);
  console.log("");
}
try {
  sync(desired, dryRun);
} catch (error) {
  if (!(error instanceof GhError)) throw error;
  console.error(`\nGitHub sync failed:\n  ${error.message}`);
  process.exit(1);
}
