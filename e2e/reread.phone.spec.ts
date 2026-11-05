import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr, emulatorFindOne } from "./helpers";
import { SEED } from "./seed";

// P-139 (D-68): reading a piece again. 1) same piece, same session, same operation: warned, not recorded again (until
// "Undo last"); 2) already there in that state: warned, sent, a row "already here" that the counter does not count;
// 3) a reading the server would flag: warned in red, sent. Own pieces (E2E- codes), Nord warehouse.
const head = (key: string, code: string) => tr(key).replace("{{code}}", code).split("{{")[0];
async function arrivedNew(page: Page, code: string): Promise<void> {
  await page.goto("/scan?mode=arrive_at_warehouse");
  await page.getByTestId("scan-flow-select").selectOption("new");
  await scanManual(page, code);
  await expect(page.getByTestId("scan-session-row").filter({ hasText: code })).toContainText(tr("scan.sent"), { timeout: 60_000 });
  // The trigger has made the piece (its code points to it): the phone can now know it.
  await expect.poll(async () => (await emulatorFindOne("codes", { raw: code }))?.itemId ?? null, { timeout: 90_000 }).not.toBeNull();
}

test.describe("Rilettura di un pezzo (telefono)", () => {
  test("stesso pezzo nella stessa sessione: avviso e nessuna seconda registrazione; dopo «Annulla l'ultima» si registra", async ({ page }) => {
    test.setTimeout(180_000);
    const a = uniqueCode("RR");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    const count = page.getByTestId("scan-session-count");
    await scanManual(page, a);
    await expect(count).toHaveText("1");
    await page.getByTestId("scan-manual-input").fill(a);
    await page.getByTestId("scan-manual-submit").click();
    await expect(page.getByTestId("scan-flash")).toContainText(head("scan.readAgain", a));
    await expect(count).toHaveText("1");
    await expect(page.getByTestId("scan-session-row")).toHaveCount(1);
    // "Undo last" takes the reading away: the same code is recorded again (a row again; it may say "already here" if
    // the server has not yet undone the first reading, so the counter is not checked here).
    await page.getByTestId("scan-undo").click();
    await expect(page.getByTestId("scan-session-row")).toHaveCount(0);
    await scanManual(page, a);
    await expect(page.getByTestId("scan-session-row").filter({ hasText: a })).toHaveCount(1);
  });

  test("pezzo già in questo magazzino e stato: avviso giallo, la lettura parte, riga «già qui» non contata", async ({ page }) => {
    test.setTimeout(240_000);
    const b = uniqueCode("RR");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await arrivedNew(page, b);
    // Another session (the screen opened again): the same arrival changes nothing.
    await page.reload();
    await page.getByTestId("scan-flow-select").selectOption("new");
    await page.getByTestId("scan-manual-input").fill(b);
    await page.getByTestId("scan-manual-submit").click();
    const flash = page.getByTestId("scan-flash");
    await expect(flash).toContainText(head("scan.alreadyHere", b));
    await expect(flash).toContainText(SEED.nord.warehouse);
    await expect(flash).toHaveAttribute("data-tone", "warn");
    await expect(page.getByTestId("scan-session-count")).toHaveText("0");
    const row = page.getByTestId("scan-session-row").filter({ hasText: b });
    await expect(row.getByTestId("scan-session-here")).toHaveText(tr("scan.alreadyHereRow"));
    await expect(row).toContainText(tr("scan.sent"), { timeout: 60_000 });
  });

  test("lettura che il server rifiuterebbe: avviso rosso con stato e luogo, la lettura parte", async ({ page }) => {
    test.setTimeout(240_000);
    const c = uniqueCode("RR");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await arrivedNew(page, c);
    // New material sorted into a category of removed material: a transition the state machine forbids.
    await page.goto("/scan?mode=classify");
    await page.getByTestId("scan-category-select").selectOption("cat_reuse");
    await page.getByTestId("scan-manual-input").fill(c);
    await page.getByTestId("scan-manual-submit").click();
    const flash = page.getByTestId("scan-flash");
    await expect(flash).toHaveAttribute("data-tone", "danger");
    await expect(flash).toContainText(head("scan.rereadConflict", c));
    await expect(flash).toContainText(tr("items.statuses.received_at_asp"));
    await expect(page.getByTestId("scan-session-row").filter({ hasText: c })).toContainText(tr("scan.sent"), { timeout: 60_000 });
  });
});
