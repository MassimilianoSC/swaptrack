import { test, expect, type Browser, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, uniqueCode, tr } from "./helpers";

// P-175: in "Scan" at a site with a BOM, the BOM is at the top: a summary on the video ("BOM 1/2 ▾") opens the list of
// the pieces over the video, ticked as they are read; the video is not shorter (scan-video-size). Hidden while a warning
// is a band at the top. Own BOM (E2E- serials) of SITO-00010, a Nord site no other test uses.
const SITE = "SITO-00010";

async function ownBom(browser: Browser, lines: string): Promise<string> {
  const { baseURL, locale } = test.info().project.use;
  const ctx = await browser.newContext({ baseURL, locale });
  const admin = await ctx.newPage();
  await signIn(admin, ACCOUNTS.aspAdminNord);
  await admin.goto("/documents/new");
  await admin.getByTestId("document-kind").selectOption("bom");
  const number = uniqueCode("BOMC");
  await admin.getByTestId("document-number").fill(number);
  await admin.getByTestId("document-location").selectOption(`loc_${SITE}`);
  await admin.getByTestId("document-lines-remove").fill(lines);
  await admin.getByTestId("document-save-new").click();
  await expect(admin).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });
  await ctx.close();
  return number;
}
async function type(page: Page, code: string): Promise<void> {
  await page.getByTestId("scan-manual-input").fill(code);
  await page.getByTestId("scan-manual-submit").click();
}

test.describe("BOM in alto nella schermata di lettura (telefono)", () => {
  test("il riepilogo sul video apre l'elenco dei pezzi, che si spunta leggendo; sparisce durante la fascia", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const [a, b] = [uniqueCode("BC"), uniqueCode("BC")];
    const number = await ownBom(browser, `${a} MC400100\n${b} MC400100`);
    await signIn(page, ACCOUNTS.aspTechnicianNord);
    await pickLocation(page, SITE);
    await page.goto("/scan?mode=remove_at_site");
    const chip = page.getByTestId("scan-bom-chip");
    await expect(chip).toContainText(tr("scan.bom.chip").replace("{{done}}", "0").replace("{{total}}", "2"), { timeout: 60_000 });
    // On the video, at its top.
    const [c, v] = [(await chip.boundingBox())!, (await page.getByTestId("scan-video-box").boundingBox())!];
    expect(c.y).toBeGreaterThanOrEqual(v.y);
    expect(c.y + c.height).toBeLessThanOrEqual(v.y + v.height / 4);

    await chip.click();
    const overlay = page.getByTestId("scan-bom-overlay");
    await expect(overlay).toContainText(tr("scan.bom.direction.remove"));
    // P-185: the BOM is called by its number (it was the id of its document), on the video and in the list below.
    await expect(overlay).toContainText(number);
    await expect(page.getByTestId("scan-bom-toggle")).toContainText(number);
    await expect(overlay).toContainText(a);
    await expect(overlay).toContainText(b);
    await expect(page.getByTestId("scan-bom-overlay-done")).toHaveCount(0);

    // A piece of the BOM read: the summary and the list are ticked.
    await type(page, a);
    await expect(chip).toContainText(tr("scan.bom.chip").replace("{{done}}", "1").replace("{{total}}", "2"), { timeout: 30_000 });
    await expect(page.getByTestId("scan-bom-overlay-done")).toContainText(a);

    // Read again: a yellow warning, a band at the top after 3 s: the summary is hidden meanwhile, then back.
    await type(page, a);
    await expect(page.getByTestId("scan-flash")).toHaveAttribute("data-phase", "band", { timeout: 10_000 });
    await expect(chip).toHaveCount(0);
    await expect(chip).toBeVisible({ timeout: 15_000 });

    await chip.click();
    await expect(overlay).toHaveCount(0);
  });
});
