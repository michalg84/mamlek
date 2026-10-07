// Hardcoded-value scan: finds literal colours and one-off sizes in the views that already read design tokens, so they
// stay on the role classes of src/styles/global.css (bg-background, text-muted-foreground, ring-ring, ...).
// Zero dependencies on purpose (like scripts/smoke.mjs). The pattern is the 10x-ui hardcoded-value scan plus `bg-cosmic`.
//
//   npm run ui:scan                      scan every guarded view
//   node scripts/ui-scan.mjs <files...>  scan only those of the given files that are guarded (lint-staged passes
//                                        absolute paths of the staged files; everything else is ignored)
//
// Prints `file:line: <line>` per hit and a total. Exit codes: 0 no hit, 1 at least one hit.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

// Add a view here when its own change has cleaned it. Never list src/components/ui/ or src/styles/global.css: they
// are the token source and the shared components, where literal values belong.
const GUARDED = [
  "src/pages/szukaj.astro",
  "src/components/Topbar.astro",
  "src/components/registry/RegistrySearch.tsx",
  "src/components/registry/MedicineSuggest.tsx",
];

const PATTERN = new RegExp(
  [
    String.raw`#[0-9a-fA-F]{3,8}\b`,
    String.raw`rgba?\(`,
    String.raw`hsla?\(`,
    String.raw`oklch\(`,
    String.raw`-\[[0-9.]+(px|rem)\]`,
    String.raw`\b(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b`,
    String.raw`\bbg-cosmic\b`,
  ].join("|"),
);

function toRelative(file) {
  return path.relative(ROOT, path.resolve(ROOT, file)).split(path.sep).join("/");
}

async function main() {
  const args = process.argv.slice(2);
  const guarded = new Set(GUARDED);
  const files = args.length === 0 ? GUARDED : [...new Set(args.map(toRelative))].filter((file) => guarded.has(file));

  let total = 0;
  for (const file of files) {
    const lines = (await readFile(path.join(ROOT, file), "utf8")).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (PATTERN.test(line)) {
        total++;
        console.log(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
  }
  console.log(`\nui:scan: ${total} hit(s) in ${files.length} file(s)`);
  if (total > 0) process.exit(1);
}

try {
  await main();
} catch (error) {
  console.error(`ui:scan failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
