import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr } from "./helpers";
import { SEED } from "./seed";

// Demo path 1 (DA_FARE P-6): the ASP technician on the phone, without network. Sign-in, site chosen from the offline
// list, two removals and "I'm done at this site" in airplane mode, back online: the readings are sent, the pieces
// reach the client, and the BOM check of site_done raises no false alert for readings that were still on the phone
// (SPEC §6, §11.3, §16; P-57). The BOM is the test's own: the Nord admin writes it with exactly the two pieces and
// saves it twice, so that it is the newest version at that site (bomCheckForSite takes the highest version).
async function signOut(page: Page): Promise<void> {
  await page.getByTestId("user-menu-trigger").click();
  await page.getByTestId("user-menu-signout").click();
  await expect(page.getByTestId("signin-submit-button")).toBeVisible({ timeout: 30_000 });
}

test.describe("Percorso 1 — tecnico senza rete (telefono)", () => {
  test("smontaggi e «ho finito» offline, poi in rete: letture inviate, pezzi al cliente, nessun avviso BOM falso", async ({ page, context }) => {
    test.setTimeout(300_000);
    const codes = [uniqueCode("O"), uniqueCode("O")];
    const bomNumber = uniqueCode("BOM");

    // 0. The Nord admin writes the BOM of the site: the two pieces to remove.
    await signIn(page, ACCOUNTS.aspAdminNord);
    await page.goto("/documents/new");
    await page.getByTestId("document-kind").selectOption("bom");
    await page.getByTestId("document-number").fill(bomNumber);
    await page.getByTestId("document-location").selectOption(`loc_${SEED.nord.site}`);
    await page.getByTestId("document-lines").fill(codes.map((c) => `${c} [remove]`).join("\n"));
    await page.getByTestId("document-save-new").click();
    await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });
    const bomId = page.url().split("/").pop()!;
    await page.getByTestId("document-save").click(); // version 2: the newest BOM of the site
    await expect(page.getByText(tr("common.saved")).last()).toBeVisible();
    await signOut(page);

    // 1. The technician signs in online and opens the scanning screen once: site list, ASP cache and catalog
    //    (needed to pick the model of an unknown piece offline) are in the local cache.
    await signIn(page, ACCOUNTS.aspTechnicianNord);
    await pickLocation(page, SEED.nord.site);
    await page.goto("/scan?mode=remove_at_site");
    await expect(page.getByTestId("scan-screen")).toBeVisible();
    await page.getByTestId("topbar-location").click(); // back to the site picker inside the app
    await expect(page.getByTestId("site-picker-offline-info")).toBeVisible();

    // 2. Airplane mode: the site is found in the offline list, the scanning screen opens inside the app.
    await context.setOffline(true);
    await page.getByTestId("site-picker-search").fill(SEED.nord.site);
    await page.getByTestId("site-picker-item").filter({ hasText: SEED.nord.site }).first().click();
    await expect(page.getByTestId("site-picker-selected")).toContainText(SEED.nord.site);
    await page.getByTestId("scan-fab").click();
    await expect(page.getByTestId("scan-screen")).toBeVisible();
    for (const c of codes) await scanManual(page, c, { withModel: true });
    for (const c of codes) await expect(page.getByTestId("scan-today-row").filter({ hasText: c })).toContainText(tr("scan.waiting"));
    await page.getByTestId("scan-site-done").click();
    await expect(page.getByText(tr("scan.siteDone")).first()).toBeVisible();

    // 3. Back online: every reading reaches the server.
    await context.setOffline(false);
    for (const c of codes) await expect(page.getByTestId("scan-today-row").filter({ hasText: c })).toContainText(tr("scan.sent"), { timeout: 90_000 });
    await signOut(page);

    // 4. The client sees the pieces.
    await signIn(page, ACCOUNTS.clientOffice);
    for (const c of codes) {
      await expect.poll(async () => {
        await page.goto("/items");
        await page.getByTestId("items-search-input").fill(c);
        await page.getByTestId("items-search-submit").click();
        await page.waitForTimeout(1500);
        return page.url();
      }, { timeout: 90_000 }).toMatch(/\/items\/[^/]+$/);
    }
    await signOut(page);

    // 5. No false BOM alert for the site: the two pieces of the BOM were removed (the readings were only late).
    await signIn(page, ACCOUNTS.aspAdminNord);
    await page.goto(`/documents/${bomId}`);
    await expect.poll(async () => {
      await page.getByTestId("document-compare").click();
      return page.getByTestId("document-arrived").textContent();
    }, { timeout: 90_000, intervals: [3000] }).toBe("2");
    await page.goto("/alerts");
    await expect(page.getByTestId("alerts-table").or(page.getByText(tr("alerts.empty")))).toBeVisible();
    const bomAlert = page.getByTestId(`alerts-row-link-bom-${bomId}`);
    if (await bomAlert.count()) await expect(page.getByTestId(`alerts-no-difference-bom-${bomId}`)).toBeVisible();
  });
});
