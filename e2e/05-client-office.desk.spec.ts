import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, tr, collectRows, fileStart } from "./helpers";
import { SEED } from "./seed";
import { fileNamePart } from "../src/lib/fileNames";

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
    // P-106: a readable name, from the creation time; the Storage path is unchanged.
    expect(file.suggestedFilename()).toMatch(/^SwapTrack-export-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/);
    expect((await fileStart(file, 2))).toBe("PK"); // an .xlsx file is a zip
  });

  // §13.3 (P-81): the filters of the specification reach the server. The pieces of ASP Nord in its warehouse are some,
  // and fewer than the export of everything.
  test("export Excel con filtri: ASP Nord nel suo magazzino", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/exports");
    // Every export is told by its id (exports-download-<id>), never by its place in the list: the list is read again
    // when an export is answered, so an export slow to arrive could be taken for the next one (run of lot 11).
    const exportIds = () => page.locator("[data-testid^='exports-download-']").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("exports-download-", "")));
    const rowsOf = async (id: string) => Number(await page.getByTestId("exports-table-row").filter({ has: page.getByTestId(`exports-download-${id}`) }).locator("td").nth(2).textContent());
    const create = async (): Promise<string> => {
      const before = new Set(await exportIds());
      await page.getByTestId("exports-create").click();
      let id = "";
      await expect.poll(async () => { id = (await exportIds()).find((x) => !before.has(x)) ?? ""; return id; }, { timeout: 150_000 }).not.toBe("");
      return id;
    };
    const all = await rowsOf(await create());

    await page.getByTestId("exports-asp").selectOption(SEED.nord.orgId);
    await page.getByTestId("exports-location").selectOption(`loc_${SEED.nord.warehouse}`);
    const filteredId = await create();
    const filtered = await rowsOf(filteredId);
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(all);
    const download = page.getByTestId(`exports-download-${filteredId}`);
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
    expect(file.suggestedFilename()).toMatch(/^SwapTrack-resoconto-\d{4}-\d{2}-cliente\.pdf$/); // P-106
    expect((await fileStart(file, 4))).toBe("%PDF");
  });

  // §13.4 / P-99: the client office also sees and generates the report of one ASP.
  test("resoconto mensile di un'ASP: Nord", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/reports");
    await page.getByTestId("reports-scope").selectOption(SEED.nord.orgId);
    const aspName = (await page.getByTestId("reports-scope").locator(`option[value="${SEED.nord.orgId}"]`).textContent())!.trim();
    await page.getByTestId("reports-generate").click();
    await expect(page.getByText(tr("reports.generated")).first()).toBeVisible({ timeout: 120_000 });
    const row = page.getByTestId("reports-table-row").first();
    await expect(row).toContainText(aspName);
    const [file] = await Promise.all([page.waitForEvent("download"), row.locator("[data-testid^='reports-pdf-']").click()]);
    expect(file.suggestedFilename()).toMatch(new RegExp(`^SwapTrack-resoconto-\\d{4}-\\d{2}-${fileNamePart(aspName)}\\.pdf$`)); // P-106
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
