import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, uniqueCode, tr, emulatorPatchSetting, emulatorFindOne } from "./helpers";
import { SEED } from "./seed";

// P-136 (D-66): "Read the product code after the serial". a) "or" between the label photo and the digits; b) a line
// says what the option does; c) the reading after a serial is its product code only if it is a material code of the
// catalog (before, a second serial was taken as the product code and that piece was never recorded), and a piece with
// its product code still goes through the window of the category in "Sort" (before, it was recorded with the suggestion,
// or not at all). MC400100 is the material code of RX-100 in the seed catalog. Own pieces (E2E- codes).
const PRODUCT = "MC400100";
async function type(page: Page, code: string): Promise<void> {
  await page.getByTestId("scan-manual-input").fill(code);
  await page.getByTestId("scan-manual-submit").click();
}

test.describe("Codice prodotto dopo il seriale (telefono)", () => {
  test("la casella dice cosa fa; «oppure» tra la foto dell'etichetta e le cifre", async ({ page }) => {
    test.setTimeout(120_000);
    await emulatorPatchSetting("features", { aiDocumentExtraction: true });
    try {
      await signIn(page, ACCOUNTS.aspWarehouseNord);
      await pickLocation(page, SEED.nord.warehouse);
      await page.goto("/scan?mode=arrive_at_warehouse");
      await expect(page.getByTestId("scan-ask-product-hint")).toHaveText(tr("scan.askProductHint"));
      await expect(page.getByTestId("scan-cannot-read-or")).toHaveText(tr("scan.cannotReadOr"));
    } finally {
      await emulatorPatchSetting("features", { aiDocumentExtraction: false });
    }
  });

  test("un secondo seriale al posto del codice prodotto: tutti e due i pezzi registrati, nessuno perso", async ({ page }) => {
    test.setTimeout(180_000);
    const [a, b] = [uniqueCode("PC"), uniqueCode("PC")];
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    await page.getByTestId("scan-ask-product").check();

    await type(page, a);
    await expect(page.getByTestId("scan-flash")).toContainText(tr("scan.nowProductCode"));
    await type(page, b); // by mistake, another serial
    await expect(page.getByText(tr("scan.notProductCode").replace("{{code}}", b))).toBeVisible();
    // A is a new piece without a product code: its model is asked as for any unknown piece.
    await page.getByTestId("scan-modelpick-skip").click();
    // B starts over as a serial; its product code follows.
    await expect(page.getByTestId("scan-flash")).toContainText(tr("scan.nowProductCode"));
    await type(page, PRODUCT);

    const rows = page.getByTestId("scan-session-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: a })).toHaveCount(1);
    await expect(rows.filter({ hasText: b })).toHaveCount(1);
    await expect(rows.filter({ hasText: a })).toContainText(tr("scan.sent"), { timeout: 60_000 });
    await expect(rows.filter({ hasText: b })).toContainText(tr("scan.sent"), { timeout: 60_000 });
    expect((await emulatorFindOne("events", { codeRaw: a }))?.secondCodeRaw ?? null).toBeNull();
    expect((await emulatorFindOne("events", { codeRaw: b }))?.secondCodeRaw).toBe(PRODUCT);
  });

  test("Smista per pezzo con il codice prodotto: si apre la scelta della categoria", async ({ page }) => {
    test.setTimeout(120_000);
    const c = uniqueCode("PC");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=classify");
    await page.getByTestId("scan-ask-product").check();
    await type(page, c);
    await type(page, PRODUCT);
    await expect(page.getByTestId("scan-sort")).toBeVisible();
    await page.getByTestId("scan-sort-defective").click();
    await expect(page.getByTestId("scan-session-row").filter({ hasText: c })).toHaveCount(1);
  });
});
