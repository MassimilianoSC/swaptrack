import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, tr, collectRows } from "./helpers";
import { SEED } from "./seed";

// P-101, SPEC §13.1 "Every number drills down to the list of pieces" and §13.2 "search by code, site, model".
// Read-only: nothing is written. Expected values come from the spec and the seed (./seed.ts), not from the page.
test.describe("Pezzi — filtri e numeri del cruscotto (scrivania)", () => {
  test("dal cruscotto «Smistato» alla lista dei soli pezzi smistati", async ({ page }) => {
    await signIn(page, ACCOUNTS.clientOffice);
    await page.goto("/dashboard");
    await page.locator('a[href="/items?status=sorted"]').click();
    await expect(page).toHaveURL(/\/items\?status=sorted$/);
    await expect(page.getByTestId("items-filter-status")).toHaveValue("sorted");
    const rows = await collectRows(page, "items-table");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.text).toContain(tr("items.statuses.sorted"));
  });

  test("filtro per modello e per magazzino, anche insieme", async ({ page }) => {
    await signIn(page, ACCOUNTS.clientOffice);
    await page.goto("/items");
    const option = page.getByTestId("items-filter-model").locator("option", { hasText: `${SEED.firstModel.model} ·` }).first();
    await expect(option).toHaveCount(1);
    await page.getByTestId("items-filter-model").selectOption((await option.getAttribute("value"))!);
    await expect(page).toHaveURL(/modelId=/);
    // The previous rows stay on screen until the filtered ones arrive.
    await expect.poll(async () => {
      const rows = await collectRows(page, "items-table");
      return rows.length > 0 && rows.every((r) => r.text.includes(SEED.firstModel.model));
    }, { timeout: 30_000 }).toBe(true);

    await page.goto(`/items?locationId=loc_${SEED.nord.warehouse}`);
    await expect(page.getByTestId("items-filter-location")).toHaveValue(new RegExp(`^${SEED.nord.warehouse} · `));
    const byPlace = await collectRows(page, "items-table");
    expect(byPlace.length).toBeGreaterThan(0);
    for (const r of byPlace) expect(r.text).toContain(SEED.nord.warehouse);
  });

  test("una pagina alla volta: «Mostra altri» aggiunge pezzi", async ({ page }) => {
    await signIn(page, ACCOUNTS.clientOffice);
    await page.goto("/items");
    await expect(page.getByTestId("items-more")).toBeVisible();
    const first = (await collectRows(page, "items-table")).length;
    await page.getByTestId("items-show-more").click();
    await expect.poll(async () => (await collectRows(page, "items-table")).length).toBeGreaterThan(first);
  });

  test("ASP Centro: un filtro ASP nell'indirizzo non apre i pezzi di Nord", async ({ page }) => {
    await signIn(page, ACCOUNTS.aspAdminCentro);
    await page.goto(`/items?asp=${SEED.nord.orgId}`);
    await expect(page.getByTestId("items-filter-asp")).toHaveCount(0);
    await expect(page.getByTestId("state-error")).toHaveCount(0);
    const rows = await collectRows(page, "items-table");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.hrefs).not.toContain(`/items/${SEED.nord.itemId}`);
      expect(r.text).not.toContain("MAG-NORD");
      expect(r.text).not.toContain(SEED.nord.site);
    }
  });
});
