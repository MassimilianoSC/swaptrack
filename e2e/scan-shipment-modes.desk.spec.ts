import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn } from "./helpers";
import { SEED } from "./seed";

// P-198: "Scan" opened from a shipment offers only the operation of that shipment: a return draft "Return shipment", a
// transfer draft "Transfer", an incoming transfer "Arrival". It offered every operation of the role, and a reading in
// another one went out with that shipment's id. Own shipments (no pieces), Nord warehouses.
const OPS = ["arrive_at_warehouse", "classify", "return_ship", "transfer_out"];

async function newShipment(page: Page, kind: "return" | "transfer", to: string): Promise<string> {
  await page.goto("/shipments");
  await page.getByTestId(kind === "return" ? "shipments-new-return" : "shipments-new-transfer").click();
  await page.getByTestId("shipments-from-select").selectOption(`loc_${SEED.nord.warehouse}`);
  await page.getByTestId("shipments-to-select").selectOption(`loc_${to}`);
  await page.getByTestId("shipments-create").click();
  await expect(page).toHaveURL(/\/shipments\/[^/]+$/, { timeout: 30_000 });
  return page.url().split("/").pop()!;
}
async function onlyOperation(page: Page, op: string): Promise<void> {
  await page.getByTestId("shipment-scan").click();
  await expect(page).toHaveURL(/\/scan\?/);
  await expect(page.getByTestId(`scan-mode-${op}`)).toBeVisible({ timeout: 30_000 });
  for (const other of OPS.filter((o) => o !== op)) await expect(page.getByTestId(`scan-mode-${other}`)).toHaveCount(0);
}

test.describe("Leggi aperta da una spedizione (scrivania)", () => {
  test("solo l'operazione della spedizione: reso, trasferimento in partenza, arrivo", async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);

    const ret = await newShipment(page, "return", SEED.clientWarehouse);
    await onlyOperation(page, "return_ship");

    const tr = await newShipment(page, "transfer", "MAG-NORD-02");
    await onlyOperation(page, "transfer_out");

    // The transfer sent (no pieces needed): the same ASP receives it, "Read the pieces" opens the arrival.
    await page.goto(`/shipments/${tr}`);
    await page.getByTestId("shipment-send").click();
    await page.getByTestId("shipment-send-save").click();
    await expect(page.getByTestId("shipment-send")).toHaveCount(0, { timeout: 30_000 });
    await onlyOperation(page, "arrive_at_warehouse");
    expect(ret).not.toBe(tr);
  });
});
