import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode } from "./helpers";
import { SEED } from "./seed";

// P-176 (tester): a file of a document, downloaded again, keeps the name it had on the computer (before: "1-1.pdf").
// Own DDT of the test (E2E- number).
const PDF = Buffer.from("%PDF-1.4\n%%EOF\n");

test.describe("Nome originale dei file dei documenti (scrivania)", () => {
  test("il file caricato si vede e si riscarica con il suo nome", async ({ page }) => {
    test.setTimeout(180_000);
    const name = `Bolla di prova ${uniqueCode("BG")}.pdf`;
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await page.goto("/documents/new");
    await page.getByTestId("document-kind").selectOption("ddt_in");
    await page.getByTestId("document-number").fill(uniqueCode("DDTN"));
    await page.getByTestId("document-location").selectOption(`loc_${SEED.nord.warehouse}`, { timeout: 60_000 });
    await page.getByTestId("document-files-input").setInputFiles({ name, mimeType: "application/pdf", buffer: PDF });
    await page.getByTestId("document-save-new").click();
    await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });

    // Opened again: the saved file has its name, and «Download» saves it under that name.
    await page.reload();
    const file = page.getByTestId("document-file").filter({ hasText: name });
    await expect(file).toHaveCount(1, { timeout: 30_000 });
    await file.getByRole("button", { name }).click();
    const download = page.getByTestId("document-preview-download");
    await expect(download).toBeVisible({ timeout: 30_000 });
    const [saved] = await Promise.all([page.waitForEvent("download"), download.click()]);
    expect(saved.suggestedFilename()).toBe(name);
  });
});
