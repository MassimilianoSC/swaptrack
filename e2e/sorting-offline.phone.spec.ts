import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, tr } from "./helpers";
import { SEED } from "./seed";

// D-58 A2: the sorting categories and rules are part of the phone's offline cache: after the sign-in (cache loaded,
// "updated"), "Sort" works without network, never with an empty list. The scanning screen is opened inside the app
// (no reload without network: on a phone the installed app is cached, the dev server is not).
test.describe("Smista senza rete (telefono)", () => {
  test("dopo l'accesso, senza rete, «Smista» ha le sue categorie", async ({ page, context }) => {
    test.setTimeout(180_000);
    const signInAt = Date.now();
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await expect.poll(async () => Number(await page.getByTestId("site-picker-offline-info").getAttribute("data-updated-at") ?? 0), { timeout: 90_000 }).toBeGreaterThan(signInAt);

    await context.setOffline(true);
    await page.getByTestId("scan-fab").click();
    await page.getByTestId("scan-mode-classify").click();
    await expect(page.getByTestId("scan-category-select").locator("option", { hasText: SEED.sorting.radioCategoryLabelIt })).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByTestId("scan-sorting-missing")).toHaveCount(0);
    await context.setOffline(false);
    expect(tr("scan.sortingMissing")).toBeTruthy();
  });
});
