import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, tr, emulatorSetDoc } from "./helpers";
import { SEED } from "./seed";

// P-209 (census of the roles, minor): "Shipment created" is seen (the whole page was loaded again and the message went
// with it); "Open" on an extra piece of a return without network says so (it said "Unexpected error"). Own data.
test.describe("Spedizioni: messaggi che si vedono (scrivania)", () => {
  test("«Spedizione creata» si vede dopo «Crea»", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await page.goto("/shipments");
    await page.getByTestId("shipments-new-return").click();
    await page.getByTestId("shipments-from-select").selectOption(`loc_${SEED.nord.warehouse}`);
    await page.getByTestId("shipments-to-select").selectOption(`loc_${SEED.clientWarehouse}`);
    await page.getByTestId("shipments-create").click();
    await expect(page).toHaveURL(/\/shipments\/[^/]+$/, { timeout: 30_000 });
    await expect(page.getByText(tr("shipments.created")).first()).toBeVisible();
  });

  test("«Apri» su un pezzo in più senza rete: dice che manca la rete", async ({ page, context }) => {
    test.setTimeout(120_000);
    // A confirmed return of the Nord warehouse with one extra piece (own document; the piece does not exist).
    const id = `e2e-${uniqueCode("rx").toLowerCase()}`;
    const extra = uniqueCode("RX");
    await emulatorSetDoc(`shipments/${id}`, {
      kind: "return", fromAspId: SEED.nord.orgId, toAspId: null, fromLocationId: `loc_${SEED.nord.warehouse}`, toLocationId: `loc_${SEED.clientWarehouse}`,
      status: "confirmed", itemCount: 0, ddtNumber: uniqueCode("DDTX"), documentId: null, createdBy: "e2e", createdAt: new Date(), sentAt: new Date(),
      confirmedAt: new Date(), receivedAt: null, confirmedComplete: false, extraCodes: [extra],
    });
    await signIn(page, ACCOUNTS.clientWarehouse);
    await page.goto(`/shipments/${id}`);
    const open = page.getByTestId(`shipment-extra-open-${extra}`);
    await expect(open).toBeVisible({ timeout: 30_000 });
    await context.setOffline(true);
    await open.click();
    // The first message shown is the one about the network (on the old code it read "Unexpected error. Try again.").
    await expect(page.locator("[data-sonner-toast]").first()).toContainText(tr("errors.offlineUnavailable"), { timeout: 30_000 });
    await expect(page.getByText(tr("errors.unexpected"))).toHaveCount(0);
    await context.setOffline(false);
  });
});
