import { test, expect } from "@playwright/test";

// Seed test: the pattern every generated E2E test copies.
// Protects: auth-gate-roundtrip (not in test-plan.md; chosen at setup) — an anonymous visitor to a
// protected page is sent to sign-in and never sees the page.
// Opts out of the saved session, because its risk is the signed-out path.
test.use({ storageState: { cookies: [], origins: [] } });

test("anonymous visitor to /szukaj is sent to sign-in and does not see the search", async ({ page }) => {
  await page.goto("/szukaj");

  await page.waitForURL("**/auth/signin");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Szukaj leku" })).toBeHidden();

  // No cleanup: the test creates no data and does not touch the shared test user's session.
});
