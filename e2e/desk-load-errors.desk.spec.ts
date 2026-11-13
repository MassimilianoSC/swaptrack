import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, emulatorSetDoc, tr } from "./helpers";
import { SEED } from "./seed";

// P-208 (census by role, group 3): what the desk says when something cannot be read, and what it lets the user touch.
// Own data: pieces and a document of this test written in the emulator (E2E- codes).
async function ownItem(o: Record<string, unknown> = {}): Promise<string> {
  const id = `e2e-${uniqueCode("LDI").toLowerCase()}`;
  const now = new Date();
  await emulatorSetDoc(`items/${id}`, {
    flow: "new", previousFlow: null, modelId: null, materialCode: null, model: null, manufacturer: null, equipmentType: null,
    status: "received_at_asp", statusSince: now, previousStatus: null, currentLocationId: `loc_${SEED.nord.warehouse}`, currentLocationType: "asp_warehouse",
    currentAspId: SEED.nord.orgId, pendingAspId: null, shipmentId: null, sortingCategoryId: null, siteOfOrigin: null, siteOfInstallation: null,
    lastEventId: null, lastScannedAt: now, needsModel: false, mergedInto: null, ...o,
  });
  return id;
}

const ITEMS_ROUTER = /\/(__functions|europe-west1)\/items(\?|$)/;

test.describe("Errori di lettura e campi della scrivania (P-208)", () => {
  test("la storia del pezzo che non si legge dice che non è disponibile, con «Riprova»; mai «Nessun evento.»", async ({ page }) => {
    test.setTimeout(120_000);
    const id = await ownItem();
    await signIn(page, ACCOUNTS.clientOffice);
    // The history is a call to the server (itemHistory, router "items"): it fails as without network. On the emulators the
    // app calls <site>/__functions/items (src/lib/data/firebase.ts), where the e2e tests run.
    await page.route(ITEMS_ROUTER, (route) => route.abort());
    await page.goto(`/items/${id}`);
    await expect(page.getByTestId("item-history-unavailable")).toContainText(tr("items.historyUnavailable"), { timeout: 30_000 });
    await expect(page.getByText(tr("items.historyEmpty"))).toHaveCount(0);
    await page.unroute(ITEMS_ROUTER);
    await page.getByTestId("item-history-retry").click();
    await expect(page.getByTestId("item-history-unavailable")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText(tr("items.historyEmpty"))).toBeVisible(); // this piece has no readings: now that is true
  });

  test("un pezzo solo in arrivo alla propria ASP: né «Forza stato» né «Unisci»; sì su un pezzo della propria ASP", async ({ page }) => {
    test.setTimeout(120_000);
    const arriving = await ownItem({ currentAspId: SEED.centro.orgId, currentLocationId: `loc_${SEED.centro.warehouse}`, pendingAspId: SEED.nord.orgId, status: "in_transfer" });
    const own = await ownItem();
    await signIn(page, ACCOUNTS.aspAdminNord);
    await page.goto(`/items/${arriving}`);
    await expect(page.getByTestId("item-status")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("item-edit")).toBeVisible(); // its data can be completed (editItem accepts a piece on its way)
    await expect(page.getByTestId("item-force-state")).toHaveCount(0);
    await expect(page.getByTestId("item-merge")).toHaveCount(0);
    await page.goto(`/items/${own}`);
    await expect(page.getByTestId("item-force-state")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("item-merge")).toBeVisible();
  });

  test("nuovo documento: cambiando «Tipo» dopo il «Luogo» il luogo che non va più si azzera", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.clientAdmin);
    await page.goto("/documents/new?kind=ddt_in");
    await page.getByTestId("document-number").fill(uniqueCode("DOCK"));
    await page.getByTestId("document-location").selectOption(`loc_${SEED.nord.warehouse}`, { timeout: 30_000 });
    await expect(page.getByTestId("document-save-new")).toBeEnabled();
    // The list hides the warehouse for a BOM; before, the page kept it and «Save» put the BOM on the warehouse.
    await page.getByTestId("document-kind").selectOption("bom");
    await expect(page.getByTestId("document-save-new")).toBeDisabled(); // no place chosen: nothing to save yet
    await page.getByTestId("document-location").selectOption(`loc_${SEED.nord.site}`);
    await expect(page.getByTestId("document-save-new")).toBeEnabled();
    await page.getByTestId("document-kind").selectOption("ddt_in");
    await expect(page.getByTestId("document-save-new")).toBeDisabled();
  });

  test("documento senza «Salva» (ufficio cliente): «Numero» e «Luogo» non si modificano", async ({ page }) => {
    test.setTimeout(120_000);
    const id = `e2e-${uniqueCode("LDD").toLowerCase()}`;
    const now = new Date();
    await emulatorSetDoc(`documents/${id}`, {
      kind: "ddt_in", number: uniqueCode("DDTL"), aspId: SEED.nord.orgId, locationId: `loc_${SEED.nord.warehouse}`, files: [],
      lines: [], linesSource: "manual", version: 1, status: "open", createdAt: now, updatedAt: now, history: [], duplicateOf: null, shipmentId: null,
    });
    await signIn(page, ACCOUNTS.clientOffice);
    await page.goto(`/documents/${id}`);
    await expect(page.getByTestId("document-compare")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("document-save")).toHaveCount(0);
    await expect(page.getByTestId("document-number")).toHaveAttribute("readonly", "");
    await expect(page.getByTestId("document-location")).toBeDisabled();
  });
});
