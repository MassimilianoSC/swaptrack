import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr, openPiece } from "./helpers";
import { SEED } from "./seed";

// P-220 (D-81, new form of D-27): in "Arrival" of removed material one choice, "Arrival only (sort later)" or
// "Arrival and sorting"; "Category" only with the second; at the top the operation and the warehouse. A category chosen
// and then "Arrival only" is not recorded (it was, with the switch off). Own piece (E2E- code), Nord warehouse.
test.describe("Arrivo del materiale smontato: una scelta sola (telefono)", () => {
  test("«Solo arrivo» di partenza, categoria solo con «Arrivo e smistamento»; tornando a «Solo arrivo» la categoria non si registra", async ({ page }) => {
    test.setTimeout(240_000);
    const code = uniqueCode("AC");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await expect(page.getByTestId("scan-flow-select")).toHaveValue("removed");
    await expect(page.getByTestId("scan-mode-at")).toHaveText(tr("scan.modeAt").replace("{{mode}}", tr("scan.modes.arrive_at_warehouse")).replace("{{place}}", SEED.nord.warehouse));

    const only = page.getByTestId("scan-arrival-only");
    const sort = page.getByTestId("scan-sort-now");
    await expect(only).toBeChecked();
    await expect(sort).not.toBeChecked();
    await expect(page.getByTestId("scan-category-select")).toHaveCount(0);

    await sort.check();
    const category = page.getByTestId("scan-category-select");
    await expect(category.locator("option").first()).toHaveText(tr("scan.useSuggested"));
    await category.selectOption(SEED.sorting.radioCategoryId);

    // Back to "Arrival only": the category goes, and the piece only arrives.
    await only.check();
    await expect(page.getByTestId("scan-category-select")).toHaveCount(0);
    await scanManual(page, code, { withModel: true });
    await expect(page.getByTestId("scan-today-row").filter({ hasText: code })).toContainText(tr("scan.sent"), { timeout: 60_000 });
    await openPiece(page, code);
    await expect(page.getByTestId("item-status")).toContainText(tr("items.statuses.received_at_asp"), { timeout: 60_000 });
  });

  // The defect of the census (DIFETTO, not only the new form): with sorting off, a category chosen in the menu was
  // recorded all the same and the piece became "Sorted". Written for both screens: where a category can still be chosen
  // with "arrival only" (the old one), it is chosen; the piece must only arrive.
  test("con «Solo arrivo» una categoria a portata di mano non si registra: il pezzo è solo arrivato", async ({ page }) => {
    test.setTimeout(240_000);
    const code = uniqueCode("AC");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await expect(page.getByTestId("scan-flow-select")).toHaveValue("removed");
    await expect(page.getByTestId("scan-sort-now")).not.toBeChecked();
    const category = page.getByTestId("scan-category-select");
    if (await category.count()) await category.selectOption(SEED.sorting.radioCategoryId);
    await scanManual(page, code, { withModel: true });
    await expect(page.getByTestId("scan-today-row").filter({ hasText: code })).toContainText(tr("scan.sent"), { timeout: 60_000 });
    await openPiece(page, code);
    await expect(page.getByTestId("item-status")).toContainText(tr("items.statuses.received_at_asp"), { timeout: 60_000 });
  });
});
