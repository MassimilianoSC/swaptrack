import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr, openPiece, emulatorRead, emulatorSetDoc } from "./helpers";
import { SEED } from "./seed";

// P-116 (censimento §11): the desk pages offer only what the server accepts and say what a role cannot see.
// Seeded data is only read; what is changed belongs to the test (an own alert, an own piece).
async function signOut(page: Page): Promise<void> {
  await page.getByTestId("user-menu-trigger").click();
  await page.getByTestId("user-menu-signout").click();
  await expect(page.getByTestId("signin-submit-button")).toBeVisible({ timeout: 30_000 });
}

test.describe("Scrivania — solo ciò che il server accetta (P-116)", () => {
  test("ufficio cliente: niente «Accetta spostamento», niente lettura, niente «Salva» su un documento nuovo", async ({ page }) => {
    test.setTimeout(120_000);
    const itemId = (await emulatorRead("anomalies/an_1")).itemId as string; // a code_of_another_asp anomaly (fullSeed)
    await signIn(page, ACCOUNTS.clientOffice);
    // n.7: accept_move is for the client admin only.
    await page.goto(`/items/${itemId}`);
    await expect(page.getByTestId("item-status")).toBeVisible();
    await expect(page.getByTestId("anomaly-resolve-an_1")).toHaveCount(0);
    // n.34: the scanning screen is for the ASP roles.
    await page.goto("/scan");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("scan-screen")).toHaveCount(0);
    // n.6: a new document is not saved by the client office.
    await page.goto("/documents/new");
    await expect(page.getByTestId("document-kind")).toBeVisible();
    await expect(page.getByTestId("document-save-new")).toHaveCount(0);
    // n.31: the date column says "Created", n.39: the filter finds the kind shown in its badge.
    await page.goto("/documents");
    await expect(page.getByTestId("documents-table").locator("th")).toContainText([tr("shipments.created_at")]);
    await page.getByTestId("documents-table-filter").fill(tr("documents.kinds.ddt_in"));
    await expect.poll(() => page.getByTestId("documents-table-row").count()).toBeGreaterThan(0);
    await signOut(page);
    // The client admin does see "Accept move" on the same anomaly.
    await signIn(page, ACCOUNTS.clientAdmin);
    await page.goto(`/items/${itemId}`);
    await expect(page.getByTestId("anomaly-resolve-an_1")).toBeVisible();
    // "Change ASP" in the office override: ASPs chosen by name, never typed as internal ids (nothing is saved here).
    await page.getByTestId("item-force-state").click();
    const asp = page.getByTestId("item-force-asp");
    await expect(asp.locator(`option[value="${SEED.nord.orgId}"]`)).toHaveCount(1);
    await expect(asp.locator(`option[value="${SEED.nord.orgId}"]`)).not.toHaveText(SEED.nord.orgId);
  });

  test("magazzino cliente: la storia del pezzo dice che non è disponibile per il ruolo", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.clientWarehouse);
    await page.goto(`/items/${SEED.nord.itemId}`);
    await expect(page.getByTestId("item-history-not-for-role")).toHaveText(tr("items.historyNotForRole"));
  });

  test("amministratore cliente: un nuovo trasferimento propone come arrivo solo magazzini di un'altra ASP", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.clientAdmin);
    await page.goto("/shipments");
    await page.getByTestId("shipments-new-transfer").click();
    await page.getByTestId("shipments-from-select").selectOption("loc_MAG-NORD-01");
    const to = page.getByTestId("shipments-to-select").locator("option");
    await expect(to.filter({ hasText: "MAG-CENTRO-01" })).toHaveCount(1);
    await expect(to.filter({ hasText: "MAG-NORD-02" })).toHaveCount(0);
  });

  test("annullare la nota non chiude l'avviso", async ({ page }) => {
    test.setTimeout(120_000);
    const id = `e2e-${uniqueCode("AL").toLowerCase()}`;
    const now = new Date();
    await emulatorSetDoc(`alerts/${id}`, {
      kind: "stale_material", aspId: SEED.nord.orgId, locationId: `loc_${SEED.nord.warehouse}`, documentId: null, shipmentId: null,
      detail: {}, count: 1, flow: "new", createdAt: now, updatedAt: now, seenAt: null, closedAt: null, closedNote: null,
    });
    await signIn(page, ACCOUNTS.aspAdminNord);
    await page.goto("/alerts");
    page.once("dialog", (d) => void d.dismiss());
    await page.getByTestId(`alerts-close-${id}`).click();
    await page.waitForTimeout(2000);
    expect((await emulatorRead(`alerts/${id}`)).closedAt).toBeNull();
    await expect(page.getByTestId(`alerts-close-${id}`)).toBeVisible();
  });

  test("«Correggi luogo»: il luogo si sceglie per nome, solo tra quelli dell'ASP", async ({ page }) => {
    test.setTimeout(240_000);
    const code = uniqueCode("L");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    await scanManual(page, code, { withModel: true });
    await expect(page.getByTestId("scan-today-row").filter({ hasText: code })).toContainText(tr("scan.sent"), { timeout: 60_000 });
    await signOut(page);

    await signIn(page, ACCOUNTS.aspAdminNord);
    await openPiece(page, code);
    await page.locator("[data-testid^='item-correct-']").first().click();
    await page.getByTestId("item-correct-search").fill("MAG");
    const results = page.getByTestId("item-correct-result");
    await expect(results.filter({ hasText: "MAG-NORD-02" })).toHaveCount(1);
    await expect(results.filter({ hasText: "MAG-CENTRO" })).toHaveCount(0); // criterion 1: only the ASP's own places
    await results.filter({ hasText: "MAG-NORD-02" }).click();
    await expect(page.getByTestId("item-correct-chosen")).toContainText("MAG-NORD-02");
    await page.getByTestId("item-correct-reason").fill("Arrivato nell'altro magazzino");
    await page.getByTestId("item-correct-save").click();
    await expect(page.getByTestId("item-history")).toContainText(tr("items.corrected"), { timeout: 60_000 });
  });
});
