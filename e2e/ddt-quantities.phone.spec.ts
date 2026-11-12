import { test, expect, type Browser, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, uniqueCode } from "./helpers";
import { SEED } from "./seed";

// P-193 (SPEC §11.3): in the arrival with a DDT, "arrived / missing" and the DDT's count are its serial lines only, as
// the desk's comparison says them; a line without serial ("#2 MC400107") has its own counted/expected below (P-188).
// The phone said "missing" serials and quantity pieces together (9 against the desk's 4). Own DDT and pieces (E2E-).
const QTY_CODE = "MC400107"; // BB-101, the second model of the seed catalog

async function ownDdt(browser: Browser, number: string, lines: string): Promise<void> {
  const { baseURL, locale } = test.info().project.use;
  const ctx = await browser.newContext({ baseURL, locale });
  const admin = await ctx.newPage();
  await signIn(admin, ACCOUNTS.aspAdminNord);
  await admin.goto("/documents/new");
  await admin.getByTestId("document-number").fill(number);
  await admin.getByTestId("document-location").selectOption(`loc_${SEED.nord.warehouse}`);
  await admin.getByTestId("document-lines").fill(lines);
  await admin.getByTestId("document-save-new").click();
  await expect(admin).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });
  await ctx.close();
}
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

test.describe("Arrivo con DDT e righe a quantità (telefono)", () => {
  test("arrivati e mancanti contano solo i seriali; la riga «#2 MC400107» ha il suo contati/attesi", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const [number, a, b, x] = [uniqueCode("DDTQ"), uniqueCode("DQ"), uniqueCode("DQ"), uniqueCode("DQ")];
    await ownDdt(browser, number, `${a} MC400100\n${b} MC400100\n#2 ${QTY_CODE}`);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    const option = page.getByTestId("scan-ddt-select").locator("option", { hasText: number });
    await expect(option).toHaveCount(1, { timeout: 60_000 });
    await page.getByTestId("scan-ddt-select").selectOption({ label: await option.innerText() });

    await read(page, a, false); // a serial of the DDT
    await read(page, x, true); // a piece of the line without serial
    await page.getByTestId("scan-ddt-toggle").click();
    const qty = page.locator("[data-testid^='scan-ddt-qty-']").filter({ hasText: QTY_CODE });
    await expect(qty.getByTestId("scan-ddt-qty-count")).toHaveText("1/2", { timeout: 30_000 });
    // Serials only: 1 of 2 arrived, 1 missing; the piece of the quantity line is neither missing nor unexpected.
    await expect(page.getByTestId("scan-ddt-arrived")).toHaveText("1");
    await expect(page.getByTestId("scan-ddt-missing")).toHaveText("1");
    await expect(page.getByTestId("scan-ddt-unexpected")).toHaveText("0");
    await expect(page.getByTestId("scan-ddt-progress")).toHaveText("1/2");
  });
});
