import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, tr, collectRows } from "./helpers";
import { SEED } from "./seed";

// Demo path 6 (DA_FARE P-6): confidentiality, shown. Signed in as ASP Centro, nothing of ASP Nord is visible
// (REGISTRO criterion 1; SPEC R7). Read-only: nothing is written. The seed facts are in ./seed.ts.
const NORD = "NORD";

test.describe("Percorso 6 — riservatezza: ASP Centro non vede ASP Nord (scrivania)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.aspAdminCentro);
  });

  test("ricerca per codice: trova un pezzo di Centro, non uno di Nord", async ({ page }) => {
    await page.goto("/items");
    await page.getByTestId("items-search-input").fill(SEED.centro.itemCode);
    await page.getByTestId("items-search-submit").click();
    await expect(page).toHaveURL(new RegExp(`/items/${SEED.centro.itemId}$`));
    await expect(page.getByTestId("item-codes")).toContainText(SEED.centro.itemCode);

    await page.goto("/items");
    await page.getByTestId("items-search-input").fill(SEED.nord.itemCode);
    await page.getByTestId("items-search-submit").click();
    // A code this ASP may not read is "not found" for it, and the app says so (never a silent failure).
    await expect(page.getByText(tr("items.notFound")).first()).toBeVisible();
    await expect(page).toHaveURL(/\/items$/);
  });

  test("indirizzo diretto di un pezzo di Nord: stato d'errore, nessun dato", async ({ page }) => {
    await page.goto(`/items/${SEED.nord.itemId}`);
    await expect(page.getByTestId("state-error")).toBeVisible();
    await expect(page.getByTestId("item-status")).toHaveCount(0);
    await expect(page.getByTestId("item-codes")).toHaveCount(0);
    await expect(page.getByTestId("main-content")).not.toContainText(SEED.nord.itemCode);
  });

  test("persone: solo quelle di Centro", async ({ page }) => {
    await page.goto("/people");
    const rows = await collectRows(page, "users-table");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.text).toMatch(/\.centro@/);
      expect(r.text.toLowerCase()).not.toContain("nord");
    }
  });

  test("spedizioni: le proprie e quelle con altri, mai i magazzini altrui; nulla di Nord", async ({ page }) => {
    await page.goto("/shipments");
    const rows = await collectRows(page, "shipments-table");
    const byId = (id: string) => rows.filter((r) => r.hrefs.includes(`/shipments/${id}`));
    expect(byId(SEED.centro.shipmentWithin)).toHaveLength(1);
    expect(byId(SEED.nord.shipmentWithin)).toHaveLength(0);
    expect(byId(SEED.nord.transferNordSud)).toHaveLength(0);
    for (const id of SEED.centro.transfersWithOthers) {
      const [row] = byId(id);
      expect(row, id).toBeDefined();
      // The other end is "another organization": never the name of its warehouse (SPEC §9.4).
      expect(row.text).toContain(tr("items.anotherOrg"));
      expect(row.text).not.toContain("MAG-NORD");
      expect(row.text).not.toContain("MAG-SUD");
    }
    for (const r of rows) expect(r.text).not.toContain(NORD);
  });

  test("avvisi: nessuno di Nord", async ({ page }) => {
    await page.goto("/alerts");
    await page.getByTestId("alerts-toggle-closed").click();
    const rows = await collectRows(page, "alerts-table");
    expect(rows.some((r) => r.hrefs.includes(`/documents/${SEED.centro.ddtAlertDoc}`))).toBe(true);
    expect(rows.some((r) => r.hrefs.includes(`/documents/${SEED.nord.ddtAlertDoc}`))).toBe(false);
    for (const r of rows) {
      expect(r.text).not.toContain(NORD);
      for (const h of r.hrefs) expect(h).not.toContain(NORD);
    }
  });

  test("anomalie: solo quelle di Centro", async ({ page }) => {
    await page.goto("/anomalies");
    await page.getByTestId("anomalies-toggle").click();
    const rows = await collectRows(page, "anomalies-table");
    expect(rows.some((r) => r.hrefs.includes(`/items/${SEED.centro.itemId}`))).toBe(true);
    for (const r of rows) {
      expect(r.text).not.toContain(NORD);
      for (const h of r.hrefs) expect(h).not.toMatch(/\/items\/it_SN[NS]-/);
    }
  });

  test("documenti: solo quelli di Centro", async ({ page }) => {
    await page.goto("/documents");
    const rows = await collectRows(page, "documents-table");
    expect(rows.some((r) => r.hrefs.includes(`/documents/${SEED.centro.ddtAlertDoc}`))).toBe(true);
    expect(rows.some((r) => r.hrefs.includes(`/documents/${SEED.nord.ddtAlertDoc}`))).toBe(false);
    for (const r of rows) expect(r.text).not.toContain(NORD);
  });

  test("cruscotto del proprio ASP senza scelta dell'ambito; niente amministrazione", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("k-received")).toBeVisible();
    await expect(page.getByTestId("dashboard-scope")).toHaveCount(0);
    await expect(page.getByTestId("nav-admin-users")).toHaveCount(0);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("users-table")).toHaveCount(0);
  });
});
