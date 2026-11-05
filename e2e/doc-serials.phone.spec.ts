import { test, expect, type Browser, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, uniqueCode, tr, emulatorFindOne, emulatorRead } from "./helpers";
import { SEED } from "./seed";

// The committente's rule (P-104 extended): in "Remove" and "Arrival" the phone does not ask the model ("Unknown piece")
// of a serial that is a line of a saved document it knows: the site's BOM (lines to remove), any open DDT of the
// warehouse, also when no DDT is chosen on the screen. The server takes the model from the line (expectedCodes).
// A serial in no document is still asked. Own documents and serials; SITO-00022 is a Nord site without a seeded BOM.
const SITE = "SITO-00022";
const SITE_OFFLINE = "SITO-00025"; // another Nord site: the screen shows one BOM per site

async function saveDocument(browser: Browser, kind: "bom" | "ddt_in", place: string, lines: string): Promise<void> {
  const { baseURL, locale } = test.info().project.use;
  const ctx = await browser.newContext({ baseURL, locale });
  const admin = await ctx.newPage();
  await signIn(admin, ACCOUNTS.aspAdminNord);
  await admin.goto("/documents/new");
  await admin.getByTestId("document-kind").selectOption(kind);
  await admin.getByTestId("document-number").fill(uniqueCode(kind === "bom" ? "BOMS" : "DDTS"));
  await admin.getByTestId("document-location").selectOption(`loc_${place}`);
  await admin.getByTestId(kind === "bom" ? "document-lines-remove" : "document-lines").fill(lines);
  await admin.getByTestId("document-save-new").click();
  await expect(admin).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });
  await ctx.close();
}
async function type(page: Page, code: string): Promise<void> {
  await page.getByTestId("scan-manual-input").fill(code);
  await page.getByTestId("scan-manual-submit").click();
}
// The reading is recorded at once (the flash with the code), never through the window "Unknown piece".
async function recordedWithoutAsking(page: Page, code: string): Promise<void> {
  await expect(page.getByTestId("scan-flash")).toContainText(code);
  await expect(page.getByTestId("scan-modelpick-skip")).toHaveCount(0);
  await expect(page.getByTestId("scan-session-row").filter({ hasText: code })).toHaveCount(1);
}
const modelOf = async (code: string) => {
  const c = await emulatorFindOne("codes", { raw: code });
  return c?.itemId ? (await emulatorRead(`items/${c.itemId as string}`)).modelId ?? null : null;
};

test.describe("Niente «Pezzo sconosciuto» per i seriali dei documenti salvati (telefono)", () => {
  test("Smonta: un seriale della BOM del sito non chiede il modello, che viene dalla BOM", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const s = uniqueCode("DS");
    await saveDocument(browser, "bom", SITE, `${s} MC400100`);
    await signIn(page, ACCOUNTS.aspTechnicianNord);
    await pickLocation(page, SITE);
    await page.goto("/scan?mode=remove_at_site");
    await expect(page.getByTestId("scan-bom-count")).toHaveText("0/1", { timeout: 60_000 });
    await type(page, s);
    await recordedWithoutAsking(page, s);
    await expect.poll(() => modelOf(s), { timeout: 90_000 }).toBe("mdl_MC400100");
  });

  test("Arrivo senza scegliere il DDT: un seriale di un DDT aperto del magazzino non chiede il modello", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const s = uniqueCode("DS");
    await saveDocument(browser, "ddt_in", SEED.nord.warehouse, `${s} MC400107`);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    await expect(page.getByTestId("scan-ddt-select")).toHaveValue(""); // «Nessun DDT (solo arrivo)»
    await expect(page.getByTestId("scan-ddt-select").locator("option").nth(1)).toBeAttached({ timeout: 60_000 });
    await type(page, s);
    await recordedWithoutAsking(page, s);
    await expect.poll(() => modelOf(s), { timeout: 90_000 }).toBe("mdl_MC400107");
  });

  test("un seriale che non è in nessun documento chiede ancora il modello", async ({ page }) => {
    test.setTimeout(120_000);
    const s = uniqueCode("DS");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    await type(page, s);
    await expect(page.getByTestId("scan-modelpick-skip")).toBeVisible();
    await expect(page.getByText(tr("scan.unknownPieceTitle"))).toBeVisible();
  });

  test("senza rete: un seriale della BOM, già sul telefono, non chiede il modello", async ({ page, browser, context }) => {
    test.setTimeout(240_000);
    const s = uniqueCode("DS");
    await saveDocument(browser, "bom", SITE_OFFLINE, `${s} MC400114`);
    await signIn(page, ACCOUNTS.aspTechnicianNord);
    await pickLocation(page, SITE_OFFLINE);
    await page.goto("/scan?mode=remove_at_site");
    await expect(page.getByTestId("scan-bom-count")).toHaveText(/^0\/\d+$/, { timeout: 60_000 }); // the BOM is on the phone
    await context.setOffline(true);
    await type(page, s);
    await recordedWithoutAsking(page, s);
    await expect(page.getByTestId("scan-session-row").filter({ hasText: s })).toContainText(tr("scan.waiting"));
    await context.setOffline(false);
  });
});
