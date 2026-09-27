// PostToolUse (Write|Edit) hook: run the project's Prettier on the edited file.
// Reads the hook payload from stdin; skips file types lint-staged doesn't format.
import { spawnSync } from "node:child_process";
import path from "node:path";

const FORMATTED = new Set([".ts", ".tsx", ".astro", ".json", ".css", ".md"]);

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

const payload = JSON.parse(raw);
const file = payload.tool_response?.filePath ?? payload.tool_input?.file_path;
if (!file || !FORMATTED.has(path.extname(file))) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const prettier = path.join(projectDir, "node_modules", "prettier", "bin", "prettier.cjs");
const result = spawnSync(process.execPath, [prettier, "--write", "--ignore-unknown", "--log-level", "warn", file], {
  cwd: projectDir,
  stdio: ["ignore", "inherit", "inherit"],
});
process.exit(result.status ?? 1);
