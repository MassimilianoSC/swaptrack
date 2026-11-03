import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr, openPiece } from "./helpers";
import { SEED } from "./seed";

// P-102 (SPEC §10): in "Sort" the suggested category is confirmed with one tap or another one is chosen; with a fixed
// category the readings are recorded at once (a series of identical pieces); cancelling records nothing and the camera
// reads again. Own pieces (E2E- codes), Nord warehouse worker on the phone.
async function sortScreen(page: Page): Promise<void> {
  await signIn(page, ACCOUNTS.aspWarehouseNord);
  await pickLocation(page, SEED.nord.warehouse);
}
// A removed piece of model RX-100 (radio unit: suggested "Ricondizionamento") arrived at the Nord warehouse.
async function arrivedRadio(page: Page, code: string): Promise<void> {
  await page.goto("/scan?mode=arrive_at_warehouse");
  await expect(page.getByTestId("scan-flow-select")).toHaveValue("removed");
  await scanManual(page, code, { withModel: true });
  await expect(page.getByTestId("scan-today-row").filter({ hasText: code })).toContainText(tr("scan.sent"), { timeout: 60_000 });
}
const typeCode = async (page: Page, code: string) => {
  await page.getByTestId("scan-manual-input").fill(code);
  await page.getByTestId("scan-manual-input").press("Enter");
};

test.describe("Smista — conferma con un tocco (telefono)", () => {
  test("un'altra categoria toccata: il pezzo va in quella, non nella suggerita", async ({ page }) => {
    test.setTimeout(240_000);
    const code = uniqueCode("Q");
    await sortScreen(page);
    await arrivedRadio(page, code);
    await page.getByTestId("scan-mode-classify").click();
    await typeCode(page, code);
    await expect(page.getByTestId("scan-sort-suggested")).toContainText(SEED.sorting.radioCategoryLabelIt);
    await page.getByTestId("scan-sort-option-cat_reuse").click();
    await expect(page.getByTestId("scan-flash")).toContainText(code);
    await openPiece(page, code);
    await expect(page.getByTestId("item-status")).toContainText(tr("items.statuses.sorted"), { timeout: 60_000 });
    await expect(page.getByTestId("item-sorting-category")).not.toHaveText(SEED.sorting.radioCategoryLabelIt);
  });

  test("Annulla: niente registrato, una riga lo dice, si legge subito il pezzo dopo", async ({ page }) => {
    test.setTimeout(180_000);
    const [a, b] = [uniqueCode("Q"), uniqueCode("Q")];
    await sortScreen(page);
    await page.goto("/scan?mode=classify");
    await typeCode(page, a);
    await expect(page.getByTestId("scan-sort")).toBeVisible();
    await page.keyboard.press("Escape"); // like the back key
    await expect(page.getByText(tr("scan.notSorted").replace("{{code}}", a))).toBeVisible();
    await expect(page.getByTestId("scan-session-count")).toHaveText("0");
    await typeCode(page, b);
    await expect(page.getByTestId("scan-sort")).toBeVisible();
    await page.getByTestId("scan-sort-cancel").click();
    await expect(page.getByTestId("scan-session-count")).toHaveText("0");
  });

  test("categoria fissa: le letture si registrano subito, senza tocchi", async ({ page }) => {
    test.setTimeout(180_000);
    const codes = [uniqueCode("Q"), uniqueCode("Q")];
    await sortScreen(page);
    await page.goto("/scan?mode=classify");
    await page.getByTestId("scan-category-select").selectOption("cat_reuse");
    for (const c of codes) await scanManual(page, c);
    await expect(page.getByTestId("scan-sort")).toHaveCount(0);
    await expect(page.getByTestId("scan-session-count")).toHaveText("2");
  });
});
