import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, tr, collectRows, captureOpenedUrl } from "./helpers";
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
    const url = await captureOpenedUrl(page, () => download.click());
    const res = await page.request.get(url);
    expect(res.status()).toBe(200);
    expect((await res.body()).subarray(0, 2).toString("latin1")).toBe("PK"); // an .xlsx file is a zip
  });

  test("resoconto mensile in PDF", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/reports");
    await page.getByTestId("reports-generate").click();
    await expect(page.getByText(tr("reports.generated")).first()).toBeVisible({ timeout: 120_000 });
    const pdf = page.getByTestId("reports-table-row").first().locator("[data-testid^='reports-pdf-']");
    await expect(pdf).toBeVisible();
    const url = await captureOpenedUrl(page, () => pdf.click());
    const res = await page.request.get(url);
    expect(res.status()).toBe(200);
    expect((await res.body()).subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  test("nessuna voce di amministrazione", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("nav-dashboard")).toBeVisible();
    await expect(page.getByTestId("nav-admin-settings")).toHaveCount(0);
    await page.goto("/admin/settings");
    await expect(page).toHaveURL(/\/$/);
  });
});
