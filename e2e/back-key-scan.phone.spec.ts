import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, uniqueCode, tr } from "./helpers";
import { SEED } from "./seed";

// P-163: the back key of the phone (Android) or of the browser in "Scan". A reading waiting in a window ("Unknown
// piece", "Sort") or a serial waiting for its product code is not recorded yet: the back key left the page and the
// reading was gone (shown on the code before: no row among today's readings). Now it does what the window's X does.
// Own pieces (E2E- codes), Nord warehouse.
async function type(page: Page, code: string): Promise<void> {
  await page.getByTestId("scan-manual-input").fill(code);
  await page.getByTestId("scan-manual-submit").click();
}
async function scanAt(page: Page, mode: string): Promise<void> {
  await signIn(page, ACCOUNTS.aspWarehouseNord);
  await pickLocation(page, SEED.nord.warehouse);
  await page.goto(`/scan?mode=${mode}`);
  if (mode === "arrive_at_warehouse") await page.getByTestId("scan-flow-select").selectOption("new");
}
// The readings of today on this phone. Still in the screen (the back key closed what was open): its list, as it is; out
// of it (the code before: the back key left the screen): a new visit. Never a reload right after the reading: a reading
// written a moment before a reload may not be in the phone's copy yet, which no user does.
async function readToday(page: Page, code: string, n: number): Promise<void> {
  if (!/\/scan\?/.test(page.url())) await page.goto("/scan?mode=arrive_at_warehouse");
  await expect(page.getByTestId("scan-today-row").filter({ hasText: code })).toHaveCount(n, { timeout: n ? 30_000 : 5_000 });
}

test.describe("Tasto Indietro del telefono nella schermata di lettura (telefono)", () => {
  test("finestra «Pezzo sconosciuto» aperta e Indietro del telefono: la finestra si chiude come con la X e la lettura resta", async ({ page }) => {
    test.setTimeout(180_000);
    const code = uniqueCode("BK");
    await scanAt(page, "arrive_at_warehouse");
    await type(page, code);
    await expect(page.getByTestId("scan-modelpick-skip")).toBeVisible();
    await page.goBack();
    await page.waitForTimeout(1500);
    const after = page.url();
    const windowAfter = await page.getByTestId("scan-modelpick-skip").count();
    await readToday(page, code, 1);
    expect(after).toMatch(/\/scan\?/);
    expect(windowAfter).toBe(0);
  });

  // Back at the very moment the window appears (the race seen in the run of lot 11: React Router had not applied the
  // step yet, the window stayed open with its step gone, and the next Back lost the reading). Pressed by the page itself
  // as soon as the window is in it, so the race happens every time, not only on a loaded machine.
  test("Indietro nello stesso istante in cui compare la finestra: la finestra si chiude lo stesso e la lettura resta", async ({ page }) => {
    test.setTimeout(180_000);
    const code = uniqueCode("BK");
    await page.addInitScript(() => {
      new MutationObserver(() => {
        const w = window as unknown as { __backAtWindow?: boolean };
        if (w.__backAtWindow && document.querySelector("[data-testid='scan-modelpick-skip']")) { w.__backAtWindow = false; history.back(); }
      }).observe(document, { childList: true, subtree: true });
    });
    await scanAt(page, "arrive_at_warehouse");
    await page.evaluate(() => { (window as unknown as { __backAtWindow?: boolean }).__backAtWindow = true; });
    await type(page, code);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __backAtWindow?: boolean }).__backAtWindow), { timeout: 20_000 }).toBe(false);
    await page.waitForTimeout(2500);
    const after = page.url();
    const windowAfter = await page.getByTestId("scan-modelpick-skip").count();
    await readToday(page, code, 1);
    expect(after).toMatch(/\/scan\?/);
    expect(windowAfter).toBe(0);
  });

  test("seriale in attesa del codice prodotto e Indietro del telefono: il seriale non si perde", async ({ page }) => {
    test.setTimeout(180_000);
    const code = uniqueCode("BK");
    await scanAt(page, "arrive_at_warehouse");
    await page.getByTestId("scan-ask-product").check();
    await type(page, code);
    await expect(page.getByTestId("scan-flash")).toContainText(tr("scan.nowProductCode"));
    await page.goBack();
    // As when another serial comes instead of the product code (D-66): the serial goes on its way, and a new piece
    // asks for its model first; Back again closes that window like the X.
    await expect(page.getByTestId("scan-modelpick-skip")).toBeVisible({ timeout: 10_000 });
    await page.goBack();
    await page.waitForTimeout(1500);
    const after = page.url();
    await readToday(page, code, 1);
    expect(after).toMatch(/\/scan\?/);
  });

  test("finestra «Smista» aperta e Indietro del telefono: annullata come con «Annulla», si resta nella lettura", async ({ page }) => {
    test.setTimeout(180_000);
    const code = uniqueCode("BK");
    await scanAt(page, "classify");
    await type(page, code);
    await expect(page.getByTestId("scan-sort")).toBeVisible({ timeout: 20_000 });
    await page.goBack();
    await expect(page.getByTestId("scan-sort")).toHaveCount(0);
    await expect(page.getByText(tr("scan.notSorted").replace("{{code}}", code))).toBeVisible();
    await expect(page).toHaveURL(/\/scan\?mode=classify/);
    await expect(page.getByTestId("scan-session-count")).toHaveText("0");
  });

  test("finestra chiusa con la X: Indietro del telefono poi esce dalla lettura, senza passi in più", async ({ page }) => {
    test.setTimeout(180_000);
    const code = uniqueCode("BK");
    await scanAt(page, "arrive_at_warehouse");
    await type(page, code);
    await page.getByTestId("scan-modelpick-skip").click();
    await expect(page.getByTestId("scan-session-count")).toHaveText("1");
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });
  // Guard: a step left in the history (the screen left from the menu with a serial waiting, then reached again with
  // Back) never makes the next window closed with its X leave the screen.
  test("tornati con Indietro dopo essere usciti dal menu: chiudere una finestra non fa uscire dalla lettura", async ({ page }) => {
    test.setTimeout(180_000);
    const [a, b] = [uniqueCode("BK"), uniqueCode("BK")];
    await scanAt(page, "arrive_at_warehouse");
    await page.getByTestId("scan-ask-product").check();
    await type(page, a);
    await expect(page.getByTestId("scan-flash")).toContainText(tr("scan.nowProductCode"));
    // Leaving from the menu (a link inside the app), then Back.
    await page.evaluate(() => { history.pushState({}, "", "/"); dispatchEvent(new PopStateEvent("popstate")); });
    await expect(page.getByTestId("scan-screen")).toHaveCount(0);
    await page.goBack();
    await expect(page.getByTestId("scan-screen")).toBeVisible();
    await page.getByTestId("scan-flow-select").selectOption("new");
    await type(page, b);
    await page.getByTestId("scan-modelpick-skip").click();
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/scan\?/);
    await expect(page.getByTestId("scan-session-count")).toHaveText("1");
  });
});
