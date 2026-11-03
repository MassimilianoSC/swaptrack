import { test, expect, type Page, type Browser } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, tr, png } from "./helpers";
import { SEED } from "./seed";

// D-45 / D-46: the automatic reading of a DDT's photos proposes lines; they wait in the same boxes as typed lines and
// are saved only with "Save". On the emulators extractDocument answers two fixed lines (AI-DEMO-0001, AI-DEMO-0002)
// without calling the model. NOTE: settings/features is shared: these tests run one after the other, and the switch is
// always turned back off at the end; no other test may depend on it while they run.
// In a browser context of its own, so the switch is restored whoever is signed in on the test's page.
async function setAi(browser: Browser, on: boolean): Promise<void> {
  const { baseURL, locale } = test.info().project.use;
  const ctx = await browser.newContext({ baseURL, locale });
  const page = await ctx.newPage();
  await signIn(page, ACCOUNTS.clientAdmin);
  await page.goto("/admin/settings");
  await page.getByTestId("settings-tab-features").click();
  const box = page.getByTestId("settings-ai");
  if ((await box.isChecked()) !== on) await box.click();
  await page.getByTestId("settings-features-save").click();
  await expect(page.getByText(tr("common.saved")).last()).toBeVisible();
  await ctx.close();
}
// A saved DDT of the Nord warehouse with one photo page.
async function ddtWithPhoto(page: Page): Promise<void> {
  await page.goto("/documents/new");
  await page.getByTestId("document-number").fill(uniqueCode("DDTA"));
  await page.getByTestId("document-location").selectOption(`loc_${SEED.nord.warehouse}`);
  await page.getByTestId("document-files-input").setInputFiles({ name: "ddt.png", mimeType: "image/png", buffer: png(16) });
  await page.getByTestId("document-save-new").click();
  await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });
  await expect(page.getByTestId("document-file")).toHaveCount(1);
}

test.describe.serial("Lettura automatica dei documenti (scrivania)", () => {
  test("interruttore spento: nessun pulsante «Leggi automaticamente»", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await ddtWithPhoto(page);
    await expect(page.getByTestId("document-ai-read")).toHaveCount(0);
  });

  test("interruttore acceso: le righe proposte aspettano «Salva», poi si salvano", async ({ page, browser }) => {
    test.setTimeout(240_000);
    await setAi(browser, true);
    try {
      await signIn(page, ACCOUNTS.aspWarehouseNord);
      await ddtWithPhoto(page);
      await page.getByTestId("document-ai-read").click();
      await expect(page.getByTestId("document-lines")).toHaveValue("AI-DEMO-0001\nAI-DEMO-0002", { timeout: 30_000 });
      await expect(page.getByTestId("document-lines-to-confirm")).toContainText(tr("documents.aiToConfirm_other").replace("{{count}}", "2"));
      await expect(page.getByTestId("document-ai-warnings")).toHaveCount(0); // demo_extraction is never shown
      // Nothing is saved yet: a reload brings back the saved (empty) lines.
      const url = page.url();
      await page.reload();
      await expect(page.getByTestId("document-lines")).toHaveValue("");
      await page.goto(url);
      await page.getByTestId("document-ai-read").click();
      await expect(page.getByTestId("document-lines")).toHaveValue("AI-DEMO-0001\nAI-DEMO-0002", { timeout: 30_000 });
      await page.getByTestId("document-save").click();
      await expect(page.getByText(tr("common.saved")).last()).toBeVisible();
      await page.reload();
      await expect(page.getByTestId("document-lines")).toHaveValue("AI-DEMO-0001\nAI-DEMO-0002");
    } finally {
      await setAi(browser, false);
    }
  });
});
