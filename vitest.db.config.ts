import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Database tests are kept apart so `npm test` never needs a running Supabase.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    // One connection and one rolled-back transaction per file, so files must not overlap.
    fileParallelism: false,
  },
});
