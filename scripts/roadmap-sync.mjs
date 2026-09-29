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

// GraphQL query/mutation with {query, variables} on stdin; gh exits non-zero (-> GhError) on GraphQL errors.
function graphql(query, variables) {
  return ghJson(["api", "graphql", "--input", "-"], { input: JSON.stringify({ query, variables }) }).data;
}

// --- Sync steps: each reads current GitHub state, diffs against the desired state, writes only differences. ---

const LABEL = "roadmap";
const MARKER = /<!--\s*roadmap-id:\s*(\S+)\s*-->/;

// Change counts are kept per step (see startStep) so the summary says which parts changed.
function startStep(ctx, name) {
  ctx.step = name;
  ctx.changes[name] = 0;
}

function action(ctx, verb, text) {
  ctx.changes[ctx.step]++;
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

const PROJECT_TITLE = "MamLek Roadmap";
// Board Status options, in column order; `status` is the roadmap.md value each one mirrors.
const STATUS_OPTIONS = [
  { status: "proposed", name: "Proposed", color: "GRAY", description: "In the roadmap, not yet ready to plan" },
  { status: "ready", name: "Ready", color: "BLUE", description: "Prerequisites met; ready for /10x-plan" },
  { status: "planning", name: "Planning", color: "PURPLE", description: "Implementation plan in progress" },
  { status: "in-progress", name: "In progress", color: "YELLOW", description: "Being implemented" },
  { status: "done", name: "Done", color: "GREEN", description: "Change archived" },
];
const TEXT_FIELDS = {
  "Roadmap ID": (item) => item.id,
  "Change ID": (item) => item.changeId,
  Stream: (item) => item.stream,
};

// Lists every project with the board title. The GraphQL owner listing (not a search) is used so a project created
// by a previous run is found; duplicates are warned about and the lowest number wins.
function findProject(ctx) {
  const data = graphql(
    `
      query ($login: String!) {
        repositoryOwner(login: $login) {
          ... on ProjectV2Owner {
            projectsV2(first: 100) {
              nodes {
                id
                number
                title
                closed
              }
            }
          }
        }
      }
    `,
    { login: ctx.repo.owner },
  );
  const matches = (data.repositoryOwner?.projectsV2?.nodes ?? [])
    .filter((project) => project?.title === PROJECT_TITLE)
    .sort((a, b) => a.number - b.number);
  if (matches.length > 1) {
    ctx.warnings.push(
      `${matches.length} projects titled "${PROJECT_TITLE}" (${matches.map((p) => `#${p.number}`).join(", ")}) — syncing #${matches[0].number}; delete the others by hand`,
    );
  }
  if (matches[0]?.closed) ctx.warnings.push(`project #${matches[0].number} "${PROJECT_TITLE}" is closed`);
  return matches[0] ?? null;
}

// Reads linked repos, fields (with Status option IDs) and this repo's issue items with their current values
// (Status as option ID, text fields as text).
function readProject(ctx, projectId) {
  const repoFullName = `${ctx.repo.owner}/${ctx.repo.name}`;
  const state = { repos: new Set(), fields: new Map(), items: new Map() };
  let after = null;
  do {
    const project = graphql(
      `
        query ($id: ID!, $after: String) {
          node(id: $id) {
            ... on ProjectV2 {
              repositories(first: 100) {
                nodes {
                  nameWithOwner
                }
              }
              fields(first: 50) {
                nodes {
                  ... on ProjectV2FieldCommon {
                    id
                    name
                    dataType
                  }
                  ... on ProjectV2SingleSelectField {
                    options {
                      id
                      name
                    }
                  }
                }
              }
              items(first: 100, after: $after) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  id
                  content {
                    ... on Issue {
                      number
                      repository {
                        nameWithOwner
                      }
                    }
                  }
                  fieldValues(first: 50) {
                    nodes {
                      ... on ProjectV2ItemFieldTextValue {
                        text
                        field {
                          ... on ProjectV2FieldCommon {
                            name
                          }
                        }
                      }
                      ... on ProjectV2ItemFieldSingleSelectValue {
                        optionId
                        field {
                          ... on ProjectV2FieldCommon {
                            name
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      { id: projectId, after },
    ).node;
    for (const repo of project.repositories.nodes) state.repos.add(repo.nameWithOwner);
    for (const field of project.fields.nodes) {
      if (field?.name) state.fields.set(field.name, { id: field.id, dataType: field.dataType, options: field.options });
    }
    for (const node of project.items.nodes) {
      if (node.content?.repository?.nameWithOwner !== repoFullName) continue;
      const values = new Map();
      for (const value of node.fieldValues.nodes) {
        const name = value?.field?.name;
        if (!name) continue;
        if ("optionId" in value) values.set(name, value.optionId);
        else if ("text" in value) values.set(name, value.text);
      }
      state.items.set(node.content.number, { id: node.id, values });
    }
    after = project.items.pageInfo.hasNextPage ? project.items.pageInfo.endCursor : null;
  } while (after);
  return state;
}

// Status options are replaced only when names/order differ: the replacement regenerates option IDs and clears every
// item's Status, so it runs before any item is touched and the cleared values are dropped from the read state.
// Returns option name -> ID, or null when the IDs are unknown (dry run that would replace the options).
function ensureStatusOptions(ctx, project, state) {
  const field = state.fields.get("Status");
  if (project && field?.dataType !== "SINGLE_SELECT") {
    throw new GhError(`project #${project.number} "${PROJECT_TITLE}" has no single-select Status field`);
  }
  const desiredNames = STATUS_OPTIONS.map((option) => option.name);
  const currentNames = field?.options.map((option) => option.name) ?? [];
  if (currentNames.join("\n") === desiredNames.join("\n")) {
    return new Map(field.options.map((option) => [option.name, option.id]));
  }
  action(ctx, "update", `board Status options → ${desiredNames.join(", ")}`);
  if (ctx.dryRun) return null;
  const options = graphql(
    `
      mutation ($fieldId: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]) {
        updateProjectV2Field(input: { fieldId: $fieldId, singleSelectOptions: $options }) {
          projectV2Field {
            ... on ProjectV2SingleSelectField {
              options {
                id
                name
              }
            }
          }
        }
      }
    `,
    {
      fieldId: field.id,
      options: STATUS_OPTIONS.map(({ name, color, description }) => ({ name, color, description })),
    },
  ).updateProjectV2Field.projectV2Field.options;
  for (const item of state.items.values()) item.values.delete("Status");
  return new Map(options.map((option) => [option.name, option.id]));
}

// Returns text field name -> field ID (null when it would be created in a dry run); fields of the wrong type are
// warned about and left out.
function ensureTextFields(ctx, project, state) {
  const fieldIds = new Map();
  for (const name of Object.keys(TEXT_FIELDS)) {
    const field = state.fields.get(name);
    if (field && field.dataType !== "TEXT") {
      ctx.warnings.push(
        `board field "${name}" is ${field.dataType}, not TEXT — not synced; delete it to let the sync recreate it`,
      );
      continue;
    }
    if (field) {
      fieldIds.set(name, field.id);
      continue;
    }
    action(ctx, "create", `board field ${name}`);
    if (ctx.dryRun) fieldIds.set(name, null);
    else {
      const created = ghJson([
        "project",
        "field-create",
        String(project.number),
        "--owner",
        ctx.repo.owner,
        "--name",
        name,
        "--data-type",
        "TEXT",
        "--format",
        "json",
      ]);
      fieldIds.set(name, created.id);
    }
  }
  return fieldIds;
}

// Mirrors the roadmap onto the user project: project + repo link, Status options, text fields, one item per roadmap
// issue with Status (not for closed issues) and text values. Only differing values are written.
function ensureBoard(ctx, { items }) {
  const repoFullName = `${ctx.repo.owner}/${ctx.repo.name}`;
  let project = findProject(ctx);
  if (!project) {
    action(ctx, "create", `project ${PROJECT_TITLE}`);
    if (!ctx.dryRun) {
      // The returned id/number are used for the rest of the run, so a lagging listing cannot cause a second create.
      project = ghJson(["project", "create", "--owner", ctx.repo.owner, "--title", PROJECT_TITLE, "--format", "json"]);
    }
  }
  const state = project ? readProject(ctx, project.id) : { repos: new Set(), fields: new Map(), items: new Map() };

  if (!state.repos.has(repoFullName)) {
    action(ctx, "link", `project ${PROJECT_TITLE} to ${repoFullName}`);
    if (!ctx.dryRun) gh(["project", "link", String(project.number), "--owner", ctx.repo.owner, "--repo", repoFullName]);
  }

  const optionIds = ensureStatusOptions(ctx, project, state);
  const fieldIds = ensureTextFields(ctx, project, state);

  for (const item of items) {
    const issue = ctx.issues.get(item.id);
    const label = issue.number === null ? `${item.id} (new issue)` : `#${issue.number} ${item.id}`;
    let boardItem = issue.number === null ? undefined : state.items.get(issue.number);
    if (!boardItem) {
      action(ctx, "add", `${label} to board`);
      if (ctx.dryRun) boardItem = { id: null, values: new Map() };
      else {
        // item-add is idempotent: for an item the listing missed it returns the existing one (values then rewritten).
        const added = ghJson([
          "project",
          "item-add",
          String(project.number),
          "--owner",
          ctx.repo.owner,
          "--url",
          `https://github.com/${repoFullName}/issues/${issue.number}`,
          "--format",
          "json",
        ]);
        boardItem = { id: added.id, values: new Map() };
      }
    }

    const edits = [];
    if (issue.state !== "closed") {
      const statusName = STATUS_OPTIONS.find((option) => option.status === item.status).name;
      const optionId = optionIds?.get(statusName) ?? null;
      if (optionIds === null || boardItem.values.get("Status") !== optionId) {
        edits.push({
          text: `Status → ${statusName}`,
          fieldId: state.fields.get("Status")?.id,
          args: ["--single-select-option-id", optionId],
        });
      }
    }
    for (const [name, fieldId] of fieldIds) {
      const value = TEXT_FIELDS[name](item) ?? "";
      if ((boardItem.values.get(name) ?? "") === value) continue;
      edits.push({ text: `${name} → ${value || "(empty)"}`, fieldId, args: value ? ["--text", value] : ["--clear"] });
    }
    if (!edits.length) continue;

    action(ctx, "update", `board item ${label} (${edits.map((edit) => edit.text).join(", ")})`);
    if (ctx.dryRun) continue;
    for (const edit of edits) {
      gh([
        "project",
        "item-edit",
        "--id",
        boardItem.id,
        "--project-id",
        project.id,
        "--field-id",
        edit.fieldId,
        ...edit.args,
      ]);
    }
  }
}

function sync(desired, dryRun) {
  const repoInfo = ghJson(["repo", "view", "--json", "owner,name"]);
  const ctx = {
    dryRun,
    repo: { owner: repoInfo.owner.login, name: repoInfo.name },
    step: null,
    changes: {},
    warnings: [],
    issues: new Map(),
  };
  console.log(`${dryRun ? "Dry run — no writes. " : ""}Syncing roadmap to ${ctx.repo.owner}/${ctx.repo.name}\n`);

  startStep(ctx, "Label, milestone & issues");
  ensureLabel(ctx);
  const milestoneNumber = ensureMilestone(ctx, desired.milestone);
  ensureIssues(ctx, desired, milestoneNumber);
  startStep(ctx, "Board");
  ensureBoard(ctx, desired);

  console.log("");
  for (const [step, count] of Object.entries(ctx.changes)) {
    console.log(`${step}: ${count ? `${count} change(s) ${dryRun ? "planned" : "applied"}` : "no changes"}`);
  }
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
