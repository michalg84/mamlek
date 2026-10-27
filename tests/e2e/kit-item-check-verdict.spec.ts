import { test, expect, type Page } from "@playwright/test";
import { countKitItems, databaseNow, deleteKitItemsSince } from "./helpers/kit-db";

// risk: test-plan.md #1 — the check answers "nie masz" for a medicine that is in the kit.
// facet: the whole path a real user takes — added through /apteczka (form → POST /api/kit → kit_items), checked on
// /szukaj (real search worker → GET /api/kit/check → medicine_check → screen). The rule, the verdict mapping and the
// screen are covered piecewise by tests/db, src/lib and the component tests, which replace fetch and the Worker.
// seed: tests/e2e/seed.spec.ts
//
// Data: one kit item of the shared E2E account, deleted after the test (no app route removes it until S-05). The
// verdict before the add must be "Nie masz tego leku", so a leftover item fails the test instead of passing it.
// Panadol Femina is in the CI fixtures and in the full registry, with one active pack.

const PRODUCT = "Panadol Femina";
const OPTION = "Panadol Femina 500 mg + 10 mg · Tabletki powlekane";

let startedAt: Date;
let addedId: number | null = null;

/** Picks the product in a medicine field; retried, because text typed before the island hydrates is lost. */
async function pickMedicine(page: Page, field: string) {
  const combobox = page.getByRole("combobox", { name: field, exact: true });
  const option = page.getByRole("option", { name: OPTION, exact: true });
  await expect(async () => {
    await combobox.fill("");
    await combobox.fill("panadol");
    await expect(option).toBeVisible({ timeout: 5_000 });
  }).toPass();
  await option.click();
}

/** The verdict as shown on screen (a paragraph), not the screen-reader copy in the live region. */
function verdict(page: Page, title: string) {
  return page.getByRole("paragraph").filter({ hasText: new RegExp(`^${title}$`) });
}

test.beforeEach(async () => {
  addedId = null;
  startedAt = await databaseNow();
});

test.afterEach(async () => {
  const email = process.env.E2E_USERNAME ?? "";
  const deleted = await deleteKitItemsSince(email, PRODUCT, startedAt);
  if (addedId !== null) {
    expect(deleted).toEqual([addedId]);
  }
  // Nothing of this product is left in the account, whether or not the test got as far as the add.
  expect(await countKitItems(email, PRODUCT)).toBe(0);
});

test.describe("risk #1: a medicine in the kit is never checked as missing", () => {
  test("a medicine added on /apteczka is checked as 'Masz ten lek' on /szukaj", async ({ page }) => {
    // Before: the check says the account does not have the medicine.
    await page.goto("/szukaj");
    await pickMedicine(page, "Nazwa leku");
    await expect(verdict(page, "Nie masz tego leku")).toBeVisible();

    // Add the medicine to the kit through the form.
    await page.goto("/apteczka");
    await pickMedicine(page, "Lek");
    await expect(page.getByRole("radio", { name: "10 tabl." })).toBeChecked();
    await page.getByRole("button", { name: "Dodaj do apteczki" }).click();
    await page.waitForURL(/\/apteczka\?dodano=\d+$/);
    addedId = Number(new URL(page.url()).searchParams.get("dodano"));
    test.info().annotations.push({ type: "test-data", description: `kit_items.id=${addedId}` });
    await expect(page.getByRole("status").filter({ hasText: `Dodano: ${PRODUCT}` })).toBeVisible();

    // Check the same medicine again: the verdict is "you have it", with the added pack listed.
    await page.goto("/szukaj");
    await pickMedicine(page, "Nazwa leku");
    await expect(verdict(page, "Masz ten lek · 1 opakowanie")).toBeVisible();
    await expect(verdict(page, "Nie masz tego leku")).toBeHidden();
    await expect(page.getByRole("region", { name: "W apteczce" }).getByText(PRODUCT, { exact: true })).toBeVisible();
  });
});
