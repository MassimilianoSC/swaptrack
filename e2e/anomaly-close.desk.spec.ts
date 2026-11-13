import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, emulatorSetDoc, emulatorRead, tr } from "./helpers";
import { SEED } from "./seed";

// P-210 (SPEC §3.3, §8.3): nobody could close an anomaly from the app (only «Accept move» of the client admin). On the
// piece page an open anomaly has «Close» with an optional note: the client admin for every anomaly, an ASP admin for
// those of its ASP (as the server, routers/alerts.ts). Closed, it leaves the open ones in «Anomalies» and comes back
// with «Show resolved too». Own data: a piece of ASP Nord and two anomalies on it, written in the emulator.
test.describe("Chiudere un'anomalia (scrivania)", () => {
  test("l'amministratore ASP chiude l'anomalia della sua ASP, non quella di un'altra; poi non è più tra le aperte", async ({ page }) => {
    test.setTimeout(150_000);
    const tag = uniqueCode("ANC").toLowerCase();
    const itemId = `e2e-${tag}`, own = `e2e-${tag}-own`, other = `e2e-${tag}-other`;
    const now = new Date();
    await emulatorSetDoc(`items/${itemId}`, {
      flow: "new", previousFlow: null, modelId: null, materialCode: null, model: null, manufacturer: null, equipmentType: null,
      status: "received_at_asp", statusSince: now, previousStatus: null, currentLocationId: `loc_${SEED.nord.warehouse}`, currentLocationType: "asp_warehouse",
      currentAspId: SEED.nord.orgId, pendingAspId: null, shipmentId: null, sortingCategoryId: null, siteOfOrigin: null, siteOfInstallation: null,
      lastEventId: null, lastScannedAt: now, needsModel: false, mergedInto: null,
    });
    const anomaly = (aspId: string) => ({ type: "late_event", eventId: null, codeId: null, itemId, locationId: `loc_${SEED.nord.warehouse}`, aspId, detail: "late_event", openedAt: now, resolution: null, resolvedAt: null, resolvedBy: null });
    await emulatorSetDoc(`anomalies/${own}`, anomaly(SEED.nord.orgId));
    await emulatorSetDoc(`anomalies/${other}`, anomaly(SEED.centro.orgId));

    await signIn(page, ACCOUNTS.aspAdminNord);
    await page.goto(`/items/${itemId}`);
    await expect(page.getByTestId("item-anomalies")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`item-anomaly-close-${other}`)).toHaveCount(0); // another ASP's: the server would refuse it
    await page.getByTestId(`item-anomaly-close-${own}`).click();
    await page.getByTestId("confirm-ok").click(); // no note: it is optional
    await expect(page.getByTestId(`item-anomaly-closed-${own}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`item-anomaly-close-${own}`)).toHaveCount(0);
    expect((await emulatorRead(`anomalies/${own}`)).resolution).toBe("manual");

    // «Anomalies»: no longer among the open ones; «Show resolved too» shows it.
    await page.goto("/anomalies");
    await expect(page.getByTestId("anomalies-toggle")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`anomalies-row-item-${own}`)).toHaveCount(0);
    await page.getByTestId("anomalies-toggle").click();
    await expect(page.getByTestId(`anomalies-row-item-${own}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(tr("anomalies.types.late_event")).first()).toBeVisible();
  });
});
