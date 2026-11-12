import { test, expect, type Browser, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, uniqueCode, tr } from "./helpers";

// P-188 (COLLAUDO C9): in "Scan" at a site, the BOM's lines without serial ("#3 MC400107": three pieces of a model) are
// listed with their quantity and counted as pieces of that model are read (the server's comparison, D-79): a serial
// line of the BOM is not counted by them. Own BOM (E2E- serials) of SITO-00016, a Nord site no other test uses.
const SITE = "SITO-00016";
const QTY_CODE = "MC400107"; // the material code of the second model of the seed catalog
const chipText = (done: number, total: number) => tr("scan.bom.chip").replace("{{done}}", String(done)).replace("{{total}}", String(total));

async function ownBom(browser: Browser, lines: string): Promise<void> {
  const { baseURL, locale } = test.info().project.use;
  const ctx = await browser.newContext({ baseURL, locale });
  const admin = await ctx.newPage();
  await signIn(admin, ACCOUNTS.aspAdminNord);
  await admin.goto("/documents/new");
  await admin.getByTestId("document-kind").selectOption("bom");
  await admin.getByTestId("document-number").fill(uniqueCode("BOMQ"));
  await admin.getByTestId("document-location").selectOption(`loc_${SITE}`);
  await admin.getByTestId("document-lines-remove").fill(lines);
  await admin.getByTestId("document-save-new").click();
  await expect(admin).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });
  await ctx.close();
}
// A reading; an unknown piece gets the model of QTY_CODE in the window.
async function read(page: Page, code: string, pickQtyModel: boolean): Promise<void> {
  await page.getByTestId("scan-manual-input").fill(code);
  await page.getByTestId("scan-manual-submit").click();
  if (pickQtyModel) {
    await page.getByTestId("scan-modelpick-search").fill(QTY_CODE);
    await page.getByTestId("scan-modelpick-result").first().click();
    await page.getByTestId("scan-modelpick-save").click();
  }
  await expect(page.getByTestId("scan-session-row").filter({ hasText: code })).toHaveCount(1, { timeout: 30_000 });
}

test.describe("Righe a quantità della BOM in Leggi (telefono)", () => {
  test("la riga «#3 MC400107» compare con la quantità e conta i pezzi di quel modello letti; la riga seriale no", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const [a, b, c] = [uniqueCode("BQ"), uniqueCode("BQ"), uniqueCode("BQ")];
    await ownBom(browser, `${a} MC400100\n#3 ${QTY_CODE}`);
    await signIn(page, ACCOUNTS.aspTechnicianNord);
    await pickLocation(page, SITE);
    await page.goto("/scan?mode=remove_at_site");
    const chip = page.getByTestId("scan-bom-chip");
    await expect(chip).toContainText(chipText(0, 4), { timeout: 60_000 });
    await chip.click();
    const qty = page.getByTestId("scan-bom-overlay").locator("[data-testid^='scan-bom-overlay-qty-']").filter({ hasText: QTY_CODE });
    await expect(qty).toHaveCount(1);
    await expect(qty.getByTestId("scan-bom-overlay-qty-count")).toHaveText("0/3");

    // The serial line: ticked, not counted by the quantity line.
    await read(page, a, false);
    await expect(chip).toContainText(chipText(1, 4), { timeout: 30_000 });
    await expect(qty.getByTestId("scan-bom-overlay-qty-count")).toHaveText("0/3");
    // Two pieces of the quantity line's model (unknown pieces, the model picked in the window).
    await read(page, b, true);
    await read(page, c, true);
    await expect(qty.getByTestId("scan-bom-overlay-qty-count")).toHaveText("2/3", { timeout: 30_000 });
    await expect(chip).toContainText(chipText(3, 4));
    // Not "not expected": the quantity line takes them.
    await expect(page.getByTestId("scan-bom-unexpected-title")).toHaveCount(0);
    await expect(page.getByTestId("scan-bom-count")).toHaveText("3/4");
  });
});
