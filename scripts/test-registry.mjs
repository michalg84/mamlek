// Runs the whole `registry` Vitest project. lint-staged appends the staged file paths to every command, and
// `vitest run <path>` would treat them as a filter (an XML fixture matches no test file, so Vitest exits 1);
// this wrapper ignores its arguments so a staged XML fixture still runs every parser test.
//
//   node scripts/test-registry.mjs [ignored...]
//
// Exit code: that of Vitest.

import { spawnSync } from "node:child_process";
import { URL, fileURLToPath } from "node:url";

const vitest = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const { status } = spawnSync(process.execPath, [vitest, "run", "--project", "registry"], { stdio: "inherit" });
process.exit(status ?? 1);
