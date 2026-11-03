import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, uniqueCode } from "./helpers";
import { SEED } from "./seed";

// D-58 A3: the open DDTs of the arrival screen come from the server when it answers within 2 s, else from the phone's
// copy; when the server answers later, its list replaces the copy (before, a DDT created after the cache was loaded
// stayed missing until the next load of the cache, minutes away). The server is made slow by delaying its answers.
test.describe("Arrivo — DDT nuovo con il server lento (scrivania)", () => {
  test("un DDT creato dopo il caricamento della cache compare anche se il server risponde in ritardo", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const number = uniqueCode("DDTL");
    const signInAt = Date.now();
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await expect.poll(async () => Number(await page.getByTestId("site-picker-offline-info").getAttribute("data-updated-at") ?? 0), { timeout: 90_000 }).toBeGreaterThan(signInAt);

    // Another person (the ASP admin, on another device) creates the DDT after this phone loaded its cache.
    const { baseURL, locale } = test.info().project.use;
    const other = await browser.newContext({ baseURL, locale });
    const admin = await other.newPage();
    await signIn(admin, ACCOUNTS.aspAdminNord);
    await admin.goto("/documents/new");
    await admin.getByTestId("document-number").fill(number);
    await admin.getByTestId("document-location").selectOption(`loc_${SEED.nord.warehouse}`);
    await admin.getByTestId("document-lines").fill(uniqueCode("X"));
    await admin.getByTestId("document-save-new").click();
    await expect(admin).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });
    await other.close();

    // The server answers 3 s late from now on.
    await page.route((url) => url.pathname.includes("google.firestore"), async (r) => { await new Promise((ok) => setTimeout(ok, 3000)); await r.continue().catch(() => undefined); });
    await page.goto("/scan?mode=arrive_at_warehouse");
    const option = page.getByTestId("scan-ddt-select").locator("option", { hasText: number });
    await expect(option).toHaveCount(1, { timeout: 60_000 });
  });
});
