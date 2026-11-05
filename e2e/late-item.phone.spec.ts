import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr, emulatorFindOne } from "./helpers";
import { SEED } from "./seed";

// D-71 (P-149b): weak signal. The screen waits 2 s for the server, then uses the phone's copy; a piece made after the
// copy was loaded is not in it. Before, the server's answer that came later was thrown away: "Sort" showed no suggestion
// and "Unknown piece" asked the model of a piece the server knew. Now the late answer updates the window still open.
// The server is made slow (3 s per request) after the piece was made. Own pieces (E2E- codes), Nord warehouse.
const slowServer = (page: Page) => page.route((url) => url.pathname.includes("google.firestore"), async (r) => {
  await new Promise((ok) => setTimeout(ok, 3000));
  await r.continue().catch(() => undefined);
});
// A removed piece of model RX-100 (radio unit: suggested "Ricondizionamento") arrived at the Nord warehouse.
async function arrivedRadio(page: Page, code: string): Promise<void> {
  await page.goto("/scan?mode=arrive_at_warehouse");
  await expect(page.getByTestId("scan-flow-select")).toHaveValue("removed");
  await scanManual(page, code, { withModel: true });
  await expect(page.getByTestId("scan-session-row").filter({ hasText: code })).toContainText(tr("scan.sent"), { timeout: 60_000 });
  await expect.poll(async () => (await emulatorFindOne("codes", { raw: code }))?.itemId ?? null, { timeout: 90_000 }).not.toBeNull();
}
const type = async (page: Page, code: string) => {
  await page.getByTestId("scan-manual-input").fill(code);
  await page.getByTestId("scan-manual-submit").click();
};

test.describe("Risposta tardiva del server nella lettura (telefono)", () => {
  test("Smista con il server lento: la finestra riceve «Suggerita» quando arriva la risposta", async ({ page }) => {
    test.setTimeout(240_000);
    const code = uniqueCode("LT");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await arrivedRadio(page, code);
    await slowServer(page);
    await page.goto("/scan?mode=classify");
    await expect(page.getByTestId("scan-manual-input")).toBeVisible({ timeout: 60_000 });
    await type(page, code);
    await expect(page.getByTestId("scan-sort")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("scan-sort-suggested")).toContainText(SEED.sorting.radioCategoryLabelIt, { timeout: 45_000 });
  });

  test("Arrivo con il server lento: «Pezzo sconosciuto» si chiude da solo se il server conosce il pezzo", async ({ page }) => {
    test.setTimeout(240_000);
    const code = uniqueCode("LT");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await arrivedRadio(page, code);
    // Another session of the screen (the same arrival is not "already read"), the server slow from now on.
    await slowServer(page);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await expect(page.getByTestId("scan-manual-input")).toBeVisible({ timeout: 60_000 });
    await type(page, code);
    // The phone does not know the piece yet: it asks the model; the server's answer closes the window.
    await expect(page.getByTestId("scan-modelpick-skip")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("scan-modelpick-skip")).toHaveCount(0, { timeout: 45_000 });
    await expect(page.getByText(tr("scan.pieceRecognized"))).toBeVisible();
    await expect(page.getByTestId("scan-session-row").filter({ hasText: code })).toHaveCount(1);
  });
});
