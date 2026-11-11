import { test, expect, type Page, type Route } from "@playwright/test";
import { ACCOUNTS, signIn } from "./helpers";
import { SEED } from "./seed";

// P-166: with a server that does not answer (a weak signal), the menus of the places of a new document and of a new
// return are filled from the device's copy after a few seconds; before, they stayed empty for good. Nothing is written.
const firestore = (url: URL) => url.pathname.includes("google.firestore");
const go = (page: Page, to: string) => page.evaluate((path) => { history.pushState({}, "", path); dispatchEvent(new PopStateEvent("popstate")); }, to);

test.describe("Luoghi con poco segnale (scrivania)", () => {
  test("nuovo documento e nuovo reso: con il server che non risponde i luoghi arrivano dalla copia", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    // A first visit with the network: the places are in the device's copy.
    await page.goto("/documents/new");
    const warehouse = `option[value="loc_${SEED.nord.warehouse}"]`;
    await expect(page.getByTestId("document-location").locator(warehouse)).toHaveCount(1, { timeout: 60_000 });
    await page.goto("/shipments");
    await page.getByTestId("shipments-new-return").click();
    await expect(page.getByTestId("shipments-from-select").locator(warehouse)).toHaveCount(1, { timeout: 60_000 });
    await page.keyboard.press("Escape");

    // The server stops answering; new screens inside the app (no reload).
    const held: Route[] = [];
    await page.route(firestore, (r) => { held.push(r); });
    await go(page, "/");
    await go(page, "/documents/new");
    await expect(page.getByTestId("document-location").locator(warehouse)).toHaveCount(1, { timeout: 15_000 });
    await go(page, "/");
    await go(page, "/shipments");
    await page.getByTestId("shipments-new-return").click();
    await expect(page.getByTestId("shipments-from-select").locator(warehouse)).toHaveCount(1, { timeout: 15_000 });
    await page.unroute(firestore);
    for (const r of held) await r.continue().catch(() => undefined);
  });
});
