import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Plain Vite config on purpose: the files under test import no `astro:*` modules, and Astro's
// getViteConfig() would load the Cloudflare plugin, which is not needed to run them.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "component",
          include: ["src/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["./tests/setup-component.ts"],
        },
      },
      {
        test: {
          // The RPL registry XML parser (scripts/lib/rpl-parser.mjs): pure text-in, records-out, no database.
          name: "registry",
          include: ["tests/registry/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          // Proof of the Claude Code hooks in .claude/hooks/: real scripts and git in throwaway repos.
          name: "hooks",
          include: ["tests/hooks/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
        },
      },
    ],
  },
});
