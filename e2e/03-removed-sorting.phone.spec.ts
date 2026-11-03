import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr, openPiece } from "./helpers";
import { SEED } from "./seed";

// Demo path 3 (DA_FARE P-6): arrival of removed material at the ASP warehouse and sorting with the suggested
// category shown in large type, confirmed with one tap (SPEC §10, §12.2). Own piece (E2E- code): removed at a
// Nord site by the technician (model RX-100, a radio unit), then received and sorted by the Nord warehouse worker.
async function signOut(page: Page): Promise<void> {
  await page.getByTestId("user-menu-trigger").click();
  await page.getByTestId("user-menu-signout").click();
  await expect(page.getByTestId("signin-submit-button")).toBeVisible({ timeout: 30_000 });
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
    const itemId = await openPiece(page, code);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await expect(page.getByTestId("scan-flow-select")).toHaveValue("removed");
    await scanManual(page, code);
    await expect(page.getByTestId("scan-today-row").filter({ hasText: code })).toContainText(tr("scan.sent"), { timeout: 60_000 });

    // 3. Sorting (§10, P-102): the suggested category appears in large type at the reading and is confirmed with one tap;
    //    nothing is recorded before the tap.
    await page.getByTestId("scan-mode-classify").click();
    await page.getByTestId("scan-manual-input").fill(code);
    await page.getByTestId("scan-manual-input").press("Enter");
    const suggested = page.getByTestId("scan-sort-suggested");
    await expect(suggested).toContainText(SEED.sorting.radioCategoryLabelIt);
    const fontSize = await suggested.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(24);
    await expect(page.getByTestId("scan-session-count")).toHaveText("1");
    await page.getByTestId("scan-sort-confirm").click();
    await expect(page.getByTestId("scan-flash")).toContainText(code);
    await expect(page.getByTestId("scan-session-count")).toHaveText("2");

    // 4. The piece is sorted into the suggested category, shown by its label, never the raw id (P-43).
    await page.goto(`/items/${itemId}`);
    await expect(page.getByTestId("item-status")).toContainText(tr("items.statuses.sorted"), { timeout: 60_000 });
    await expect(page.getByTestId("item-sorting-category")).toHaveText(SEED.sorting.radioCategoryLabelIt);
    await expect(page.getByTestId("main-content")).not.toContainText(SEED.sorting.radioCategoryId);
  });

  // SPEC §12.2 / P-25 (D-27): "can sort in the same pass (the suggested category appears at each reading)".
  test("arrivo con «Smista nello stesso passaggio»: categoria suggerita alla lettura, pezzo smistato senza passare da «Smista»", async ({ page }) => {
    test.setTimeout(240_000);
    const code = uniqueCode("S");

    await signIn(page, ACCOUNTS.aspTechnicianNord);
    await pickLocation(page, SEED.nord.site);
    await page.goto("/scan?mode=remove_at_site");
    await scanManual(page, code, { withModel: true });
    await expect(page.getByTestId("scan-today-row").filter({ hasText: code })).toContainText(tr("scan.sent"), { timeout: 60_000 });
    await signOut(page);

    await signIn(page, ACCOUNTS.aspWarehouseNord);
    const itemId = await openPiece(page, code);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await expect(page.getByTestId("scan-flow-select")).toHaveValue("removed");
    const sortNow = page.getByTestId("scan-sort-now");
    await expect(sortNow).not.toBeChecked(); // arrival only unless the worker chooses otherwise
    await sortNow.check();
    await scanManual(page, code);
    await expect(page.getByTestId("scan-suggested-category")).toContainText(SEED.sorting.radioCategoryLabelIt);
    await expect(page.getByTestId("scan-today-row").filter({ hasText: code })).toContainText(tr("scan.sent"), { timeout: 60_000 });
    await expect(page.getByTestId("scan-session-count")).toHaveText("1");

    await page.goto(`/items/${itemId}`);
    await expect(page.getByTestId("item-status")).toContainText(tr("items.statuses.sorted"), { timeout: 60_000 });
    await expect(page.getByTestId("item-sorting-category")).toHaveText(SEED.sorting.radioCategoryLabelIt);
  });

  // D-39: only removed material is sorted. A category chosen with "removed" does not follow the worker to "new".
  test("categoria scelta con «smontato», poi «nuovo»: il pezzo nuovo arriva al magazzino senza essere smistato", async ({ page }) => {
    test.setTimeout(240_000);
    const code = uniqueCode("N");

    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await expect(page.getByTestId("scan-flow-select")).toHaveValue("removed");
    await page.getByTestId("scan-category-select").selectOption(SEED.sorting.radioCategoryId);
    await page.getByTestId("scan-flow-select").selectOption("new");
    await scanManual(page, code, { withModel: true });
    await expect(page.getByTestId("scan-today-row").filter({ hasText: code })).toContainText(tr("scan.sent"), { timeout: 60_000 });

    await openPiece(page, code);
    await expect(page.getByTestId("item-status")).toContainText(tr("items.statuses.received_at_asp"), { timeout: 60_000 });
    await expect(page.getByTestId("item-sorting-category")).not.toHaveText(SEED.sorting.radioCategoryLabelIt);
  });
});
