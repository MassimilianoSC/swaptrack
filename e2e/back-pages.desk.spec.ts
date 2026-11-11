import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, emulatorSetDoc } from "./helpers";
import { SEED } from "./seed";

// P-163: the pages not reached from the menu have "Back" above the title: to the page the user came from, or to the
// parent page when opened from a direct link (never out of the app). Own documents of ASP Nord (E2E- numbers).
async function ownDocument(): Promise<string> {
  const id = `e2e-${uniqueCode("BKD").toLowerCase()}`;
  const now = new Date();
  await emulatorSetDoc(`documents/${id}`, {
    kind: "ddt_in", number: uniqueCode("DDTB"), aspId: SEED.nord.orgId, locationId: `loc_${SEED.nord.warehouse}`, files: [],
    lines: [], linesSource: "manual", version: 1, status: "open", createdAt: now, updatedAt: now, history: [], duplicateOf: null, shipmentId: null,
  });
  return id;
}
const back = (page: Page) => page.getByTestId("page-back");

test.describe("Indietro nelle pagine di dettaglio (scrivania)", () => {
  test("documento aperto dall'elenco: «Indietro» torna all'elenco", async ({ page }) => {
    test.setTimeout(120_000);
    const id = await ownDocument();
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await page.goto("/documents");
    await page.getByTestId(`documents-row-${id}`).click();
    await expect(page).toHaveURL(new RegExp(`/documents/${id}$`));
    await back(page).click();
    await expect(page).toHaveURL(/\/documents$/);
  });

  test("documento, pezzo e spedizione aperti da un link diretto: «Indietro» porta all'elenco, non fuori dall'app", async ({ page }) => {
    test.setTimeout(120_000);
    const id = await ownDocument();
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await page.goto(`/documents/${id}`);
    await back(page).click();
    await expect(page).toHaveURL(/\/documents$/);
    // A piece that cannot be shown has "Back" too.
    await page.goto("/items/e2e-nessun-pezzo");
    await back(page).click();
    await expect(page).toHaveURL(/\/items$/);
  });

  test("documento nuovo salvato: «Indietro» torna alla pagina di prima, non al modulo vuoto", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await page.goto("/documents");
    await page.getByTestId("documents-new").click();
    await page.getByTestId("document-kind").selectOption("ddt_in");
    await page.getByTestId("document-number").fill(uniqueCode("DDTB"));
    await page.getByTestId("document-location").selectOption(`loc_${SEED.nord.warehouse}`);
    await page.getByTestId("document-lines").fill(uniqueCode("X"));
    await page.getByTestId("document-save-new").click();
    await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });
    await back(page).click();
    await expect(page).toHaveURL(/\/documents$/);
  });
});
