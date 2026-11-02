import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr } from "./helpers";
import { SEED } from "./seed";

// Demo path 4 (DA_FARE P-6): return to the client. The Nord warehouse worker sorts three own pieces, creates a return
// to the client warehouse, scans them and sends it with a DDT number (SPEC §9.3); the client warehouse confirms with
// one piece missing: the ddt_return_difference alert appears (§11.4). A second, complete confirmation raises no
// anomaly (P-56) and leaves the alert open with no differences (D-29, P-60). Own pieces (E2E- codes).
async function signOut(page: Page): Promise<void> {
  await page.getByTestId("user-menu-trigger").click();
  await page.getByTestId("user-menu-signout").click();
  await expect(page.getByTestId("signin-submit-button")).toBeVisible({ timeout: 30_000 });
}

test.describe("Percorso 4 — reso al cliente (scrivania)", () => {
  test("reso di tre pezzi, conferma con un mancante: avviso; seconda conferma completa: nessuna anomalia", async ({ page }) => {
    test.setTimeout(300_000);
    const codes = [uniqueCode("R"), uniqueCode("R"), uniqueCode("R")];
    const ddtNumber = uniqueCode("DDTR");

    // 1. Three removed pieces arrive at the Nord warehouse and are sorted in the same pass (fixed category).
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await expect(page.getByTestId("scan-flow-select")).toHaveValue("removed");
    await page.getByTestId("scan-category-select").selectOption(SEED.sorting.radioCategoryId);
    for (const c of codes) await scanManual(page, c, { withModel: true });
    for (const c of codes) await expect(page.getByTestId("scan-today-row").filter({ hasText: c })).toContainText(tr("scan.sent"), { timeout: 60_000 });

    // 2. A return from the own warehouse to the client warehouse.
    await page.goto("/shipments");
    await page.getByTestId("shipments-new-return").click();
    await page.getByTestId("shipments-from-select").selectOption(`loc_${SEED.nord.warehouse}`);
    await page.getByTestId("shipments-to-select").selectOption(`loc_${SEED.clientWarehouse}`);
    await page.getByTestId("shipments-create").click();
    await expect(page).toHaveURL(/\/shipments\/[^/]+$/, { timeout: 30_000 });
    const shipmentId = page.url().split("/").pop()!;

    // 3. The pieces are scanned into the return; the trigger fills its lines.
    await page.getByTestId("shipment-scan").click();
    await expect(page).toHaveURL(/mode=return_ship/);
    for (const c of codes) await scanManual(page, c);
    for (const c of codes) await expect(page.getByTestId("scan-today-row").filter({ hasText: c })).toContainText(tr("scan.sent"), { timeout: 60_000 });
    await page.goto(`/shipments/${shipmentId}`);
    const lines = page.getByTestId("shipment-lines").locator("li");
    await expect(lines).toHaveCount(3, { timeout: 90_000 });
    for (const c of codes) await expect(page.getByTestId("shipment-lines")).toContainText(c);

    // 4. Sent with the DDT number.
    await page.getByTestId("shipment-send").click();
    await page.getByTestId("shipment-ddt-input").fill(ddtNumber);
    await page.getByTestId("shipment-send-save").click();
    await expect(page.getByText(tr("shipments.sent")).first()).toBeVisible();
    await expect(page.getByTestId("shipment-send")).toHaveCount(0);
    await signOut(page);

    // 5. The client warehouse confirms with the first piece missing: the line is "missing", the alert appears.
    await signIn(page, ACCOUNTS.clientWarehouse);
    await page.goto(`/shipments/${shipmentId}`);
    await expect(page.getByTestId("shipment-lines")).toContainText(codes[0]);
    await page.getByTestId("shipment-confirm").click();
    const firstLine = page.getByTestId("confirm-lines-list").locator("li").filter({ hasText: codes[0] }).locator("input[type=checkbox]");
    await firstLine.uncheck();
    await page.getByTestId("confirm-save").click();
    await expect(page.getByText(tr("shipments.confirmed")).first()).toBeVisible();
    await expect(page.getByTestId("shipment-lines").locator("li").filter({ hasText: codes[0] })).toContainText(tr("shipments.missing"), { timeout: 30_000 });
    await page.goto("/alerts");
    const alertLink = page.getByTestId(`alerts-row-link-return-${shipmentId}`);
    await expect(alertLink).toBeVisible({ timeout: 60_000 });

    // 6. The missing piece turns up: a second, complete confirmation. No anomaly, the alert has no differences now.
    await page.goto(`/shipments/${shipmentId}`);
    await page.getByTestId("shipment-confirm").click();
    await expect(page.getByTestId("confirm-lines-list").locator("li").filter({ hasText: codes[0] }).locator("input[type=checkbox]")).toBeChecked();
    await page.getByTestId("confirm-save").click();
    await expect(page.getByText(tr("shipments.confirmed")).first()).toBeVisible();
    await expect(page.getByTestId("shipment-lines").locator("li").filter({ hasText: codes[0] })).toContainText(tr("shipments.confirmedLine"), { timeout: 30_000 });
    await page.goto("/alerts");
    await expect(page.getByTestId(`alerts-no-difference-return-${shipmentId}`)).toBeVisible({ timeout: 60_000 });
    await signOut(page);

    // Every piece is returned and none has an anomaly (seen by the client office, which reads all of them).
    await signIn(page, ACCOUNTS.clientOffice);
    for (const c of codes) {
      await page.goto("/items");
      await page.getByTestId("items-search-input").fill(c);
      await page.getByTestId("items-search-submit").click();
      await expect(page).toHaveURL(/\/items\/[^/]+$/, { timeout: 30_000 });
      await expect(page.getByTestId("item-status")).toContainText(tr("items.statuses.returned"), { timeout: 60_000 });
      await expect(page.getByTestId("item-anomalies")).toHaveCount(0);
    }
  });
});
