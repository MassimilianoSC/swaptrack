import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr } from "./helpers";
import { SEED } from "./seed";

// Demo path 3 (DA_FARE P-6): arrival of removed material at the ASP warehouse and sorting with the suggested
// category shown in large type, confirmed with one tap (SPEC §10, §12.2). Own piece (E2E- code): removed at a
// Nord site by the technician (model RX-100, a radio unit), then received and sorted by the Nord warehouse worker.
async function signOut(page: Page): Promise<void> {
  await page.getByTestId("user-menu-trigger").click();
  await page.getByTestId("user-menu-signout").click();
  await expect(page.getByTestId("signin-submit-button")).toBeVisible({ timeout: 30_000 });
}

async function waitForPiece(page: Page, code: string): Promise<string> {
  // The trigger creates the piece a moment after the scan: wait until the code search finds it.
  await expect.poll(async () => {
    await page.goto("/items");
    await page.getByTestId("items-search-input").fill(code);
    await page.getByTestId("items-search-submit").click();
    await page.waitForTimeout(1500);
    return page.url();
  }, { timeout: 60_000 }).toMatch(/\/items\/[^/]+$/);
  return page.url().split("/").pop()!;
}

test.describe("Percorso 3 — arrivo di materiale smontato e smistamento (telefono)", () => {
  test("categoria suggerita in grande, confermata con la lettura; il pezzo risulta smistato", async ({ page }) => {
    test.setTimeout(240_000);
    const code = uniqueCode("S");

    // 1. The technician removes the piece at a Nord site and picks its model (RX-100, radio unit).
    await signIn(page, ACCOUNTS.aspTechnicianNord);
    await pickLocation(page, SEED.nord.site);
    await page.goto("/scan?mode=remove_at_site");
    await scanManual(page, code, { withModel: true });
    await expect(page.getByTestId("scan-today-row").filter({ hasText: code })).toContainText(tr("scan.sent"), { timeout: 60_000 });
    await signOut(page);

    // 2. The warehouse worker: the piece exists (trigger), then the arrival at the warehouse.
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    const itemId = await waitForPiece(page, code);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await expect(page.getByTestId("scan-flow-select")).toHaveValue("removed");
    await scanManual(page, code);
    await expect(page.getByTestId("scan-today-row").filter({ hasText: code })).toContainText(tr("scan.sent"), { timeout: 60_000 });

    // 3. Sorting: the suggested category appears in large type at the reading, and the reading confirms it.
    await page.getByTestId("scan-mode-classify").click();
    await scanManual(page, code);
    const suggested = page.getByTestId("scan-suggested-category");
    await expect(suggested).toContainText(SEED.sorting.radioCategoryLabelIt);
    const fontSize = await suggested.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(24);
    await expect(page.getByTestId("scan-session-count")).toHaveText("2");

    // 4. The piece is sorted into the suggested category, shown by its label, never the raw id (P-43).
    await page.goto(`/items/${itemId}`);
    await expect(page.getByTestId("item-status")).toContainText(tr("items.statuses.sorted"), { timeout: 60_000 });
    await expect(page.getByTestId("item-sorting-category")).toHaveText(SEED.sorting.radioCategoryLabelIt);
    await expect(page.getByTestId("main-content")).not.toContainText(SEED.sorting.radioCategoryId);
  });
});
