import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, tr } from "./helpers";

// P-172 (SPEC §11.2): a saved document stays in its ASP. The client admin, on a saved BOM of a Nord site, is offered only
// the Nord sites in "Place" (before: the sites of every ASP, and saving another ASP's site was refused with "You are not
// allowed"), with a line that says why. A new document still offers every ASP's sites. Own BOM (E2E- serial) of
// SITO-00019, a Nord site no other test uses; SITO-00004 is Nord, SITO-00002 belongs to another ASP.
const SITE = "SITO-00019";
const option = (code: string) => `option[value="loc_${code}"]`;

test.describe("Luogo di un documento salvato (scrivania)", () => {
  test("amministratore cliente: su una BOM salvata la tendina offre solo i siti della sua ASP e dice perché", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, ACCOUNTS.clientAdmin);
    await page.goto("/documents/new");
    await page.getByTestId("document-kind").selectOption("bom");
    const place = page.getByTestId("document-location");
    // A new document: every ASP's sites.
    await expect(place.locator(option("SITO-00002"))).toHaveCount(1, { timeout: 60_000 });
    await page.getByTestId("document-number").fill(uniqueCode("BOML"));
    await place.selectOption(`loc_${SITE}`);
    await page.getByTestId("document-lines-remove").fill(uniqueCode("BL"));
    await page.getByTestId("document-save-new").click();
    await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });

    // Saved: only the Nord sites, and the line that says why.
    await expect(place.locator(option("SITO-00004"))).toHaveCount(1, { timeout: 60_000 });
    await expect(place).toHaveValue(`loc_${SITE}`);
    await expect(place.locator(option("SITO-00002"))).toHaveCount(0);
    await expect(page.getByTestId("document-location-same-asp")).toHaveText(tr("documents.locationSameAsp"));
  });
});
