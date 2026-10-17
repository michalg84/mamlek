import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// API tests are kept apart so `npm test` never needs a running server or Supabase: they call a running app over HTTP
// (BASE_URL) and read the local database (DATABASE_URL) to choose boundary data and count rows.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/api/**/*.test.ts"],
    environment: "node",
    // Files share the sign-up rate limit of the local Supabase and run in a predictable order.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
