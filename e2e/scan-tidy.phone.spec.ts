import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr, emulatorPatchSetting } from "./helpers";
import { SEED } from "./seed";

// P-134 (D-63, criteria D-62): small fixes of the scanning screen on a 390×844 phone. 1) return shipment and transfer
// only inside a shipment; 2) no floating "Scan" button on the scanning page; 3) one place when the code cannot be read
// (label photo with the AI on and the network, digits always); 4) DDT comparison, BOM and today's readings in closed
// panels with the count, so that "Photo" and "Undo last" are in the first screen. Own DDT and pieces (E2E- codes).
test.use({ viewport: { width: 390, height: 844 } });

const inFirstScreen = async (page: Page, testId: string) => {
  const box = await page.getByTestId(testId).boundingBox();
  return !!box && box.y >= 0 && box.y + box.height <= 844;
};

test.describe("Schermata di lettura — correzioni P-134 (telefono 390×844)", () => {
  test("reso e trasferimento solo da una spedizione; nessun pulsante «Leggi» flottante sulla lettura", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await expect(page.getByTestId("scan-fab")).toBeVisible();
    await page.goto("/scan?mode=arrive_at_warehouse");
    await expect(page.getByTestId("scan-mode-arrive_at_warehouse")).toBeVisible();
    await expect(page.getByTestId("scan-mode-return_ship")).toHaveCount(0);
    await expect(page.getByTestId("scan-mode-transfer_out")).toHaveCount(0);
    await expect(page.getByTestId("scan-fab")).toHaveCount(0);
    expect(await page.getByTestId("main-content").evaluate((el) => getComputedStyle(el).paddingBottom)).toBe("16px");
    // An old link to a shipment mode without a shipment opens the first mode, never a mode that cannot work.
    await page.goto("/scan?mode=return_ship");
    await expect(page.getByTestId("scan-mode-arrive_at_warehouse")).toHaveClass(/bg-primary/);
    // Opened from a shipment: its mode is there.
    await page.goto(`/scan?mode=return_ship&shipmentId=e2e-${uniqueCode("S").toLowerCase()}`);
    await expect(page.getByTestId("scan-mode-return_ship")).toBeVisible();
  });

  test("«Il codice non si legge?»: foto dell'etichetta (AI accesa, con rete) e cifre nello stesso posto", async ({ page, context }) => {
    test.setTimeout(120_000);
    await emulatorPatchSetting("features", { aiDocumentExtraction: true });
    try {
      await signIn(page, ACCOUNTS.aspWarehouseNord);
      await pickLocation(page, SEED.nord.warehouse);
      await page.goto("/scan?mode=classify");
      const place = page.getByTestId("scan-cannot-read");
      await expect(place).toContainText(tr("scan.cannotRead"));
      await expect(place.getByTestId("scan-ai-label")).toHaveText(tr("scan.aiLabel"));
      await expect(place.getByTestId("scan-manual-input")).toBeVisible();
      await context.setOffline(true);
      await expect(page.getByTestId("scan-ai-label")).toHaveCount(0);
      await expect(place.getByTestId("scan-manual-input")).toBeVisible();
      await context.setOffline(false);
    } finally {
      await emulatorPatchSetting("features", { aiDocumentExtraction: false });
    }
  });

  test("Arrivo con DDT: confronto chiuso con il conteggio; «Foto» e «Annulla l'ultima» nel primo schermo", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const [number, a, b] = [uniqueCode("DDTP"), uniqueCode("P"), uniqueCode("P")];
    // The ASP admin saves a DDT with two serials (another device).
    const { baseURL, locale } = test.info().project.use;
    const other = await browser.newContext({ baseURL, locale });
    const admin = await other.newPage();
    await signIn(admin, ACCOUNTS.aspAdminNord);
    await admin.goto("/documents/new");
    await admin.getByTestId("document-number").fill(number);
    await admin.getByTestId("document-location").selectOption(`loc_${SEED.nord.warehouse}`);
    await admin.getByTestId("document-lines").fill(`${a}\n${b}`);
    await admin.getByTestId("document-save-new").click();
    await expect(admin).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });
    await other.close();

    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    const option = page.getByTestId("scan-ddt-select").locator("option", { hasText: number });
    await expect(option).toHaveCount(1, { timeout: 60_000 });
    await page.getByTestId("scan-ddt-select").selectOption({ label: await option.innerText() });
    await scanManual(page, a);
    await expect(page.getByTestId("scan-ddt-progress")).toHaveText("1/2");
    await expect(page.getByTestId("scan-ddt-toggle")).toContainText(number);
    await expect(page.getByTestId("scan-ddt-lines")).toBeHidden(); // closed until tapped
    await expect(page.getByTestId("scan-today-toggle")).toContainText(tr("scan.today"));

    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await inFirstScreen(page, "scan-photo-button")).toBe(true);
    expect(await inFirstScreen(page, "scan-undo")).toBe(true);

    await page.getByTestId("scan-ddt-toggle").click();
    await expect(page.getByTestId("scan-ddt-lines")).toBeVisible();
  });
});
