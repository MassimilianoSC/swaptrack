import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation } from "./helpers";
import { SEED } from "./seed";

// On a phone no page is wider than the screen: a page that scrolls sideways is zoomed out by the browser and every
// tap lands a little off (seen on the BOM page, 03/11: the top bar was 19 px too wide on every page).
const noSideScroll = async (page: Page) =>
  expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

test.describe("Telefono — nessuna pagina più larga dello schermo", () => {
  test("Home, lettura e documento nuovo", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspAdminNord);
    await expect(page.getByTestId("topbar-connection")).toBeVisible();
    await noSideScroll(page);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await expect(page.getByTestId("scan-screen")).toBeVisible();
    await noSideScroll(page);
    await page.goto("/documents/new");
    await page.getByTestId("document-kind").selectOption("bom");
    await expect(page.getByTestId("document-lines-remove")).toBeVisible();
    await noSideScroll(page);
  });
});
