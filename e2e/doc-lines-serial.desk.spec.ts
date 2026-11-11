import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, emulatorFindOne, tr } from "./helpers";
import { SEED } from "./seed";

// P-169 (tester): in a DDT the row "#1 KRD901305/11" (quantity, then serial) became a quantity line of a material code
// that does not exist, so the piece was never expected. "#1 CODE" is now that serial when CODE is not a material code
// of the catalog; a real material code ("#3 MC400107", e2e/seed.ts) stays a quantity line. Under the box the page says
// how it reads the lines, before saving. Own DDT of the test (E2E- number and serial).
test.describe("Righe dei documenti scritte a mano (scrivania)", () => {
  test("«#1 seriale» è un seriale atteso; «#3 codice materiale» resta una quantità; il riepilogo lo dice prima di salvare", async ({ page }) => {
    test.setTimeout(180_000);
    const serial = `${uniqueCode("KRD")}/11`;
    const number = uniqueCode("DDTS");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await page.goto("/documents/new");
    await page.getByTestId("document-kind").selectOption("ddt_in");
    await page.getByTestId("document-number").fill(number);
    await page.getByTestId("document-location").selectOption(`loc_${SEED.nord.warehouse}`, { timeout: 60_000 });
    await page.getByTestId("document-lines").fill(`#1 ${serial}\n#3 MC400107`);
    const summary = tr("documents.linesSummary").replace("{{serials}}", "1").replace("{{quantities}}", "1");
    await expect(page.getByTestId("document-lines-summary")).toHaveText(summary, { timeout: 30_000 });

    await page.getByTestId("document-save-new").click();
    await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });
    const id = page.url().split("/").pop()!;
    // Opened again: the serial as a serial line (no "#1"), the quantity as it was.
    await page.reload();
    await expect(page.getByTestId("document-lines")).toHaveValue(`${serial}\n#3 MC400107`, { timeout: 30_000 });
    // The serial is expected by the DDT (a quantity line has no expected code).
    await expect.poll(async () => (await emulatorFindOne("expectedCodes", { documentId: id }))?.documentId ?? null, { timeout: 30_000 }).toBe(id);
  });
});
