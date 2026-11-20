import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, tr } from "./helpers";
import { SEED } from "./seed";

// P-221 (tester, 20/11): the warehouse's Home with a warehouse chosen shows "Warehouse operations": the active warehouse
// with "Change warehouse" and the four operations; "Receive a transfer" opens the incoming transfers. Own transfer.
const OTHER = "MAG-NORD-02";

test.describe("Home del magazzino: «Operazioni di magazzino» (telefono)", () => {
  test("magazzino scelto: le quattro operazioni, «Cambia magazzino» e i trasferimenti in arrivo", async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await expect(page.getByTestId("page-title")).toHaveText(tr("home.warehouse.title"));
    await expect(page.getByTestId("warehouse-home-place")).toContainText(SEED.nord.warehouse);
    for (const op of ["arrive", "classify", "ship", "incoming"]) await expect(page.getByTestId(`warehouse-op-${op}`)).toContainText(tr(`home.warehouse.${op}`));

    // "Receive material" is "Scan" in "Arrival"; "Sort material" in "Sort / classify".
    await page.getByTestId("warehouse-op-arrive").click();
    await expect(page).toHaveURL(/\/scan\?mode=arrive_at_warehouse/);
    await page.goto("/");
    await page.getByTestId("warehouse-op-classify").click();
    await expect(page).toHaveURL(/\/scan\?mode=classify/);

    // "Change warehouse": the list; "Stay on…" keeps the warehouse; another one chosen: its operations.
    await page.goto("/");
    await page.getByTestId("warehouse-home-change").click();
    await expect(page.getByTestId("site-picker-search")).toBeVisible();
    await page.getByTestId("warehouse-home-back").click();
    await expect(page.getByTestId("warehouse-home-place")).toContainText(SEED.nord.warehouse);
    await pickLocation(page, OTHER);
    await expect(page.getByTestId("warehouse-home-place")).toContainText(OTHER);

    // An own transfer to the other warehouse: a draft is not incoming; once sent it is.
    await page.goto("/shipments");
    await page.getByTestId("shipments-new-transfer").click();
    await page.getByTestId("shipments-from-select").selectOption(`loc_${SEED.nord.warehouse}`);
    await page.getByTestId("shipments-to-select").selectOption(`loc_${OTHER}`);
    await page.getByTestId("shipments-create").click();
    await expect(page).toHaveURL(/\/shipments\/[^/]+$/, { timeout: 30_000 });
    const id = page.url().split("/").pop()!;
    await page.goto("/");
    await page.getByTestId("warehouse-op-incoming").click();
    await expect(page).toHaveURL(/\/shipments\?view=incoming/);
    await expect(page.getByTestId("shipments-view-incoming")).toBeChecked();
    await expect(page.getByTestId(`shipments-row-${id}`)).toHaveCount(0);
    await page.goto(`/shipments/${id}`);
    await page.getByTestId("shipment-send").click();
    await page.getByTestId("shipment-send-save").click();
    await expect(page.getByTestId("shipment-send")).toHaveCount(0, { timeout: 30_000 });
    await page.goto("/shipments?view=incoming");
    await expect(page.getByTestId(`shipments-row-${id}`)).toHaveCount(1, { timeout: 30_000 });
    await page.getByTestId("shipments-view-all").click();
    await expect(page).not.toHaveURL(/view=incoming/);
  });
});
