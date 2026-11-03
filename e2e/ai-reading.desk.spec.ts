import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, uniqueCode, tr, png, emulatorPatchSetting, emulatorFindOne } from "./helpers";
import { SEED } from "./seed";

// D-45 / D-46: the automatic reading of a DDT's photos proposes lines; they wait in the same boxes as typed lines and
// are saved only with "Save". On the emulators extractDocument answers two fixed lines (AI-DEMO-0001, AI-DEMO-0002)
// without calling the model. NOTE: settings/features is shared: these tests run one after the other, and the switch is
// always turned back off at the end; no other test may depend on it while they run.
// Written in the emulator (what the Settings page saves): these tests are about the document page reading it.
const setAi = (on: boolean) => emulatorPatchSetting("features", { aiDocumentExtraction: on });
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
  test("interruttore spento: nessun pulsante «Leggi automaticamente», né sui documenti né in lettura", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await ddtWithPhoto(page);
    await expect(page.getByTestId("document-ai-read")).toHaveCount(0);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=classify");
    await expect(page.getByTestId("scan-manual-input")).toBeVisible();
    await expect(page.getByTestId("scan-ai-label")).toHaveCount(0);
  });

  test("interruttore acceso: le righe proposte aspettano «Salva», poi si salvano", async ({ page }) => {
    test.setTimeout(240_000);
    await setAi(true);
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
      await setAi(false);
    }
  });

  // D-49: the photo of a damaged label proposes codes (on the emulators AI-LABEL-0001 and AI-LABEL-0O01, its 11th
  // character uncertain); the worker corrects one and confirms; the reading starts as typed, marked aiAssisted.
  test("etichetta rovinata: codici proposti, uno corretto e confermato, la lettura parte segnata aiAssisted", async ({ page }) => {
    test.setTimeout(180_000);
    const code = uniqueCode("L");
    await setAi(true);
    try {
      await signIn(page, ACCOUNTS.aspWarehouseNord);
      await pickLocation(page, SEED.nord.warehouse);
      await page.goto("/scan?mode=classify");
      await page.getByTestId("scan-category-select").selectOption("cat_reuse"); // a fixed category: no sorting window
      await page.getByTestId("scan-ai-label-input").setInputFiles({ name: "etichetta.png", mimeType: "image/png", buffer: png(16) });
      await expect(page.getByTestId("scan-ai-label-code-0")).toHaveText("AI-LABEL-0001", { timeout: 30_000 });
      await expect(page.getByTestId("scan-ai-label-code-1").locator("[data-uncertain]")).toHaveText("O");
      await expect(page.getByTestId("scan-session-count")).toHaveText("0"); // nothing before the confirmation
      await page.getByTestId("scan-ai-label-input-1").fill(code);
      await page.getByTestId("scan-ai-label-use-1").click();
      await expect(page.getByTestId("scan-flash")).toContainText(code);
      await expect(page.getByTestId("scan-session-count")).toHaveText("1");
      await expect.poll(async () => ((await emulatorFindOne("events", { codeRaw: code }))?.payload as { aiAssisted?: boolean } | undefined)?.aiAssisted, { timeout: 30_000 }).toBe(true);
      const ev = await emulatorFindOne("events", { codeRaw: code });
      expect(ev?.source).toBe("manual");
    } finally {
      await setAi(false);
    }
  });

  test("etichetta rovinata senza rete: il pulsante spiega e porta alle cifre a mano", async ({ page, context }) => {
    test.setTimeout(120_000);
    await setAi(true);
    try {
      await signIn(page, ACCOUNTS.aspWarehouseNord);
      await pickLocation(page, SEED.nord.warehouse);
      await page.goto("/scan?mode=classify");
      await expect(page.getByTestId("scan-ai-label")).toBeVisible();
      await context.setOffline(true);
      await page.getByTestId("scan-ai-label").click();
      await expect(page.getByText(tr("scan.aiLabelOffline"))).toBeVisible();
      await expect(page.getByTestId("scan-manual-input")).toBeFocused();
      await context.setOffline(false);
    } finally {
      await setAi(false);
    }
  });
});
