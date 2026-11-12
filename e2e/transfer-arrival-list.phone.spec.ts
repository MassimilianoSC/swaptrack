import { test, expect, type Browser, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr, emulatorFindOne } from "./helpers";
import { SEED } from "./seed";

// P-189 (COLLAUDO C10): in "Scan" of the warehouse that receives a transfer, the pieces of the transfer are listed and
// ticked as they are read, as the BOM of a site (P-175): a summary on the video opens the list over the video, and the
// section below. Own pieces and own transfer (E2E- codes) from MAG-NORD-01 to MAG-NORD-02.
const TO = "MAG-NORD-02";
const chipText = (done: number, total: number) => tr("scan.transfer.chip").replace("{{done}}", String(done)).replace("{{total}}", String(total));
const todayRow = (page: Page, code: string, mode: string) =>
  page.getByTestId("scan-today-row").filter({ hasText: code }).filter({ hasText: tr(`scan.modes.${mode}`) });

// A sent transfer with the given pieces (new material arrived at MAG-NORD-01 first); returns its id.
async function sentTransfer(browser: Browser, codes: string[]): Promise<string> {
  const { baseURL, locale } = test.info().project.use;
  const ctx = await browser.newContext({ baseURL, locale, viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await signIn(page, ACCOUNTS.aspWarehouseNord);
  await pickLocation(page, SEED.nord.warehouse);
  await page.goto("/scan?mode=arrive_at_warehouse");
  await page.getByTestId("scan-flow-select").selectOption("new");
  for (const c of codes) await scanManual(page, c, { withModel: true });
  for (const c of codes) await expect.poll(async () => (await emulatorFindOne("codes", { raw: c }))?.itemId ?? null, { timeout: 90_000 }).not.toBeNull();

  await page.goto("/shipments");
  await page.getByTestId("shipments-new-transfer").click();
  await page.getByTestId("shipments-from-select").selectOption(`loc_${SEED.nord.warehouse}`);
  await page.getByTestId("shipments-to-select").selectOption(`loc_${TO}`);
  await page.getByTestId("shipments-create").click();
  await expect(page).toHaveURL(/\/shipments\/[^/]+$/, { timeout: 30_000 });
  const id = page.url().split("/").pop()!;
  await page.getByTestId("shipment-scan").click();
  for (const c of codes) await scanManual(page, c);
  for (const c of codes) await expect(todayRow(page, c, "transfer_out")).toContainText(tr("scan.sent"), { timeout: 60_000 });
  await page.goto(`/shipments/${id}`);
  for (const c of codes) await expect(page.getByTestId("shipment-lines")).toContainText(c, { timeout: 90_000 });
  await page.getByTestId("shipment-send").click();
  await page.getByTestId("shipment-send-save").click();
  await expect(page.getByTestId("shipment-send")).toHaveCount(0, { timeout: 30_000 });
  await ctx.close();
  return id;
}

test.describe("Arrivo di un trasferimento: pezzi attesi (telefono)", () => {
  test("il riepilogo sul video apre i pezzi del trasferimento, che si spuntano leggendo", async ({ page, browser }) => {
    test.setTimeout(420_000);
    const [a, b, c] = [uniqueCode("TA"), uniqueCode("TA"), uniqueCode("TA")];
    const id = await sentTransfer(browser, [a, b, c]);

    await signIn(page, ACCOUNTS.aspWarehouseNord);
    // As the button "Read the pieces" of the incoming transfer opens it.
    await page.goto(`/scan?mode=arrive_at_warehouse&shipmentId=${id}&location=loc_${TO}`);
    const chip = page.getByTestId("scan-transfer-chip");
    await expect(chip).toContainText(chipText(0, 3), { timeout: 60_000 });
    // On the video, at its top.
    const [box, v] = [(await chip.boundingBox())!, (await page.getByTestId("scan-video-box").boundingBox())!];
    expect(box.y).toBeGreaterThanOrEqual(v.y);
    expect(box.y + box.height).toBeLessThanOrEqual(v.y + v.height / 4);

    await chip.click();
    const overlay = page.getByTestId("scan-transfer-overlay");
    await expect(overlay).toContainText(SEED.nord.warehouse);
    for (const x of [a, b, c]) await expect(overlay).toContainText(x);
    await expect(page.getByTestId("scan-transfer-overlay-done")).toHaveCount(0);

    // A piece of the transfer read here: the summary, the list and the section below are ticked.
    await scanManual(page, a);
    await expect(chip).toContainText(chipText(1, 3), { timeout: 30_000 });
    await expect(page.getByTestId("scan-transfer-overlay-done")).toContainText(a);
    await expect(page.getByTestId("scan-transfer-count")).toHaveText("1/3");
    await page.getByTestId("scan-transfer-toggle").click();
    await expect(page.getByTestId("scan-transfer-line-done")).toContainText(a);
    await expect(page.getByTestId("scan-transfer-line-todo")).toHaveCount(2);
  });
});
