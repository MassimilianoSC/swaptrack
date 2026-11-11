import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, uniqueCode, tr } from "./helpers";
import { SEED } from "./seed";

// P-163: "Back" in the scanning screen, which had no way back of its own (the installed app has no back button on an
// iPhone). It never loses a reading. Own pieces (E2E- codes), Nord warehouse.
async function type(page: Page, code: string): Promise<void> {
  await page.getByTestId("scan-manual-input").fill(code);
  await page.getByTestId("scan-manual-submit").click();
}
const back = (page: Page) => page.getByTestId("page-back");

test.describe("Indietro nella schermata di lettura (telefono)", () => {
  test("da Home a «Leggi» e «Indietro»: di nuovo a Home", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.getByTestId("scan-fab").click();
    await expect(page.getByTestId("scan-screen")).toBeVisible();
    await back(page).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("«Leggi» di una spedizione aperta da un link diretto: «Indietro» porta alla spedizione", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=return_ship&shipmentId=e2e-spedizione");
    await expect(page.getByTestId("scan-screen")).toBeVisible();
    await back(page).click();
    await expect(page).toHaveURL(/\/shipments\/e2e-spedizione$/);
  });

  test("cambiare operazione non entra nella cronologia: Indietro del telefono esce dalla lettura", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-mode-classify").click();
    await page.getByTestId("scan-mode-arrive_at_warehouse").click();
    await expect(page).toHaveURL(/mode=arrive_at_warehouse/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });

  test("seriale in attesa del codice prodotto e «Indietro»: il seriale prosegue, poi si esce", async ({ page }) => {
    test.setTimeout(180_000);
    const code = uniqueCode("BK");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    await page.getByTestId("scan-ask-product").check();
    await type(page, code);
    await expect(page.getByTestId("scan-flash")).toContainText(tr("scan.nowProductCode"));
    await back(page).click();
    // As when another serial comes instead of the product code (D-66): a new piece asks for its model; the user stays.
    await page.getByTestId("scan-modelpick-skip").click();
    await expect(page.getByTestId("scan-today-row").filter({ hasText: code })).toHaveCount(1, { timeout: 30_000 });
    await back(page).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
