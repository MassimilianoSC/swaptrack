import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, tr, emulatorSetDoc, emulatorRead } from "./helpers";
import { SEED } from "./seed";

// P-151: closing a document, cancelling a shipment draft and closing an alert ask in the app's own window, never in
// the browser's confirm / prompt. «Annulla» does nothing; the confirmation does it. Own documents, drafts and alerts.
test.describe("Finestre di conferma dell'app (scrivania)", () => {
  test("chiudere un documento: la finestra dell'app, «Annulla» non chiude, la conferma sì", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspAdminNord);
    await page.goto("/documents/new");
    await page.getByTestId("document-number").fill(uniqueCode("DDTC"));
    await page.getByTestId("document-location").selectOption(`loc_${SEED.nord.warehouse}`);
    await page.getByTestId("document-lines").fill(uniqueCode("C"));
    await page.getByTestId("document-save-new").click();
    await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });
    const id = page.url().split("/").pop()!;

    await page.getByTestId("document-close").click();
    await expect(page.getByRole("dialog")).toContainText(tr("documents.closeConfirm"));
    await page.getByTestId("confirm-cancel").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await emulatorRead(`documents/${id}`)).status).toBe("open");

    await page.getByTestId("document-close").click();
    await page.getByTestId("confirm-ok").click();
    await expect.poll(async () => (await emulatorRead(`documents/${id}`)).status, { timeout: 30_000 }).toBe("closed");
  });

  test("annullare una bozza di spedizione: la finestra dell'app, «Annulla» non annulla, la conferma sì", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await page.goto("/shipments");
    await page.getByTestId("shipments-new-return").click();
    await page.getByTestId("shipments-from-select").selectOption(`loc_${SEED.nord.warehouse}`);
    await page.getByTestId("shipments-to-select").selectOption(`loc_${SEED.clientWarehouse}`);
    await page.getByTestId("shipments-create").click();
    await expect(page).toHaveURL(/\/shipments\/[^/]+$/, { timeout: 30_000 });
    const id = page.url().split("/").pop()!;

    await page.getByTestId("shipment-cancel").click();
    await expect(page.getByRole("dialog")).toContainText(tr("shipments.cancelConfirm"));
    await page.getByTestId("confirm-cancel").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await emulatorRead(`shipments/${id}`)).status).toBe("draft");

    await page.getByTestId("shipment-cancel").click();
    await page.getByTestId("confirm-ok").click();
    await expect.poll(async () => (await emulatorRead(`shipments/${id}`)).status, { timeout: 30_000 }).toBe("cancelled");
  });

  test("chiudere un avviso: la finestra dell'app con la nota facoltativa", async ({ page }) => {
    test.setTimeout(120_000);
    const id = `e2e-${uniqueCode("AD").toLowerCase()}`;
    const now = new Date();
    await emulatorSetDoc(`alerts/${id}`, {
      kind: "stale_material", aspId: SEED.nord.orgId, locationId: `loc_${SEED.nord.warehouse}`, documentId: null, shipmentId: null,
      detail: {}, count: 1, flow: "new", createdAt: now, updatedAt: now, seenAt: null, closedAt: null, closedNote: null,
    });
    await signIn(page, ACCOUNTS.aspAdminNord);
    await page.goto("/alerts");
    await page.getByTestId(`alerts-close-${id}`).click();
    await expect(page.getByRole("dialog")).toContainText(tr("alerts.closeNote"));
    await page.getByTestId("confirm-cancel").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await emulatorRead(`alerts/${id}`)).closedAt).toBeNull();

    await page.getByTestId(`alerts-close-${id}`).click();
    await page.getByTestId("alerts-close-note").fill("nota della prova");
    await page.getByTestId("confirm-ok").click();
    await expect.poll(async () => (await emulatorRead(`alerts/${id}`)).closedNote ?? null, { timeout: 30_000 }).toBe("nota della prova");
  });
});
