import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation } from "./helpers";
import { SEED } from "./seed";

// P-217 (tester, 20/11): "Scan" opened half way down the page: its gun field had autoFocus, and the browser scrolled
// the page down to it. Now it opens at the top (the video first), with the gun field selected all the same.
test.describe("«Leggi» si apre in cima (telefono)", () => {
  test("dalla Home, «Leggi» si apre in cima alla pagina", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.getByTestId("scan-fab").click();
    await expect(page.getByTestId("scan-video-box")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("scan-manual-input")).toBeAttached();
    await page.waitForTimeout(500); // any scrolling of the opening is done
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByTestId("scan-wedge-input")).toBeFocused();
  });
});
