import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, uniqueCode, tr, openPiece } from "./helpers";
import { SEED } from "./seed";

// P-113 (SPEC §6.4, "search by code or name"): in the unknown-piece window the model is found by typing part of its
// name or code, and chosen with a big button (gloves). Own piece (E2E- code), Nord warehouse worker on the phone.
test.describe("Pezzo sconosciuto — ricerca del modello (telefono)", () => {
  test("cerco il modello per nome, lo tocco, confermo: il pezzo ha quel modello", async ({ page }) => {
    test.setTimeout(180_000);
    const code = uniqueCode("M");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");

    const input = page.getByTestId("scan-manual-input");
    await input.fill(code);
    await input.press("Enter");
    const search = page.getByTestId("scan-modelpick-search");
    await expect(search).toBeVisible();
    // A search with no match says so (the user can still skip).
    await search.fill("zz-nessun-modello");
    await expect(page.getByTestId("scan-modelpick-none")).toHaveText(tr("scan.modelSearchNone"));
    await search.fill(SEED.firstModel.model.toLowerCase());
    const result = page.getByTestId("scan-modelpick-result").filter({ hasText: `${SEED.firstModel.model} ·` }).first();
    await expect(result).toBeVisible();
    await result.click();
    await page.getByTestId("scan-modelpick-save").click();
    await expect(page.getByTestId("scan-today-row").filter({ hasText: code })).toContainText(tr("scan.sent"), { timeout: 60_000 });

    await openPiece(page, code);
    await expect(page.getByTestId("main-content")).toContainText(`${SEED.firstModel.model} ·`, { timeout: 60_000 });
  });
});
