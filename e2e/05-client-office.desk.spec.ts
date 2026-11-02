import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, tr, collectRows, fileStart } from "./helpers";
import { SEED } from "./seed";

// Demo path 5 (DA_FARE P-6): the client's office on a computer. Reads only, plus an export and a report
// it generates for itself (new documents of its own; nothing shared is changed).
test.describe("Percorso 5 — ufficio cliente (computer)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.clientOffice);
  });

  test("cruscotto: ambito di tutte le ASP e quantità", async ({ page }) => {
    await page.goto("/dashboard");
    const scope = page.getByTestId("dashboard-scope");
    await expect(scope).toBeVisible();
    await expect(scope.locator("option")).toHaveCount(4); // all ASPs + the three of the seed
    for (const k of ["k-received", "k-installed", "k-removed", "k-returned", "k-sorted"]) {
      await expect(page.getByTestId(k)).toHaveText(/^[1-9]\d*$/);
    }
    const all = Number(await page.getByTestId("k-installed").textContent());
    await scope.selectOption(SEED.nord.orgId);
    await expect.poll(async () => Number(await page.getByTestId("k-installed").textContent())).toBeLessThan(all);
  });

  test("ricerca per codice e storia del pezzo", async ({ page }) => {
    await page.goto("/items");
    await page.getByTestId("items-search-input").fill(SEED.nord.itemCode);
    await page.getByTestId("items-search-submit").click();
    await expect(page).toHaveURL(new RegExp(`/items/${SEED.nord.itemId}$`));
    await expect(page.getByTestId("item-status")).toBeVisible();
    await expect(page.getByTestId("item-codes")).toContainText(SEED.nord.itemCode);
    // An installed piece of the seed has at least two events: arrival at the warehouse, installation at the site.
    const events = page.getByTestId("item-history").locator("li");
    await expect(events.first()).toBeVisible();
    expect(await events.count()).toBeGreaterThanOrEqual(2);
    // R11: the history never names a person.
    await expect(page.getByTestId("item-history")).not.toContainText("@");
  });

  test("avvisi e anomalie di tutte le ASP", async ({ page }) => {
    await page.goto("/alerts");
    await page.getByTestId("alerts-toggle-closed").click();
    const alerts = await collectRows(page, "alerts-table");
    expect(alerts.some((r) => r.hrefs.includes(`/items?locationId=${SEED.nord.staleAlertLocationId}`))).toBe(true);
    expect(alerts.some((r) => r.hrefs.includes(`/documents/${SEED.centro.ddtAlertDoc}`))).toBe(true);
    await page.goto("/anomalies");
    await page.getByTestId("anomalies-toggle").click();
    const anomalies = await collectRows(page, "anomalies-table");
    expect(anomalies.some((r) => r.hrefs.includes(`/items/${SEED.centro.itemId}`))).toBe(true);
    expect(anomalies.some((r) => r.hrefs.some((h) => h.startsWith("/items/it_SNN-")))).toBe(true);
  });

  test("export Excel", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/exports");
    await page.getByTestId("exports-create").click();
    await expect(page.getByText(tr("exports.created")).first()).toBeVisible({ timeout: 120_000 });
    const download = page.getByTestId("exports-table-row").first().locator("[data-testid^='exports-download-']");
    await expect(download).toBeVisible();
    // D-35: the file is read with the Storage rules (getBlob) and saved by the browser, never through a public URL.
    const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
    expect(file.suggestedFilename().endsWith(".xlsx")).toBe(true);
    expect((await fileStart(file, 2))).toBe("PK"); // an .xlsx file is a zip
  });

  // §13.3 (P-81): the filters of the specification reach the server. The pieces of ASP Nord in its warehouse are some,
  // and fewer than the export of everything.
  test("export Excel con filtri: ASP Nord nel suo magazzino", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/exports");
    const rowsOf = async (i: number) => Number(await page.getByTestId("exports-table-row").nth(i).locator("td").nth(2).textContent());
    await page.getByTestId("exports-create").click();
    await expect(page.getByText(tr("exports.created")).first()).toBeVisible({ timeout: 120_000 });
    await expect.poll(() => page.getByTestId("exports-table-row").count(), { timeout: 30_000 }).toBeGreaterThan(0);
    const all = await rowsOf(0);
    const before = await page.getByTestId("exports-table-row").count();

    await page.getByTestId("exports-asp").selectOption(SEED.nord.orgId);
    await page.getByTestId("exports-location").selectOption(`loc_${SEED.nord.warehouse}`);
    await page.getByTestId("exports-create").click();
    await expect.poll(() => page.getByTestId("exports-table-row").count(), { timeout: 120_000 }).toBe(before + 1);
    const filtered = await rowsOf(0);
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(all);
    const download = page.getByTestId("exports-table-row").first().locator("[data-testid^='exports-download-']");
    const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
    expect((await fileStart(file, 2))).toBe("PK");
  });

  test("resoconto mensile in PDF", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/reports");
    await page.getByTestId("reports-generate").click();
    await expect(page.getByText(tr("reports.generated")).first()).toBeVisible({ timeout: 120_000 });
    const pdf = page.getByTestId("reports-table-row").first().locator("[data-testid^='reports-pdf-']");
    await expect(pdf).toBeVisible();
    const [file] = await Promise.all([page.waitForEvent("download"), pdf.click()]);
    expect(file.suggestedFilename().endsWith(".pdf")).toBe(true);
    expect((await fileStart(file, 4))).toBe("%PDF");
  });

  test("nessuna voce di amministrazione", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("nav-dashboard")).toBeVisible();
    await expect(page.getByTestId("nav-admin-settings")).toHaveCount(0);
    await page.goto("/admin/settings");
    await expect(page).toHaveURL(/\/$/);
  });
});
