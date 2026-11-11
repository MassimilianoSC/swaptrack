import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr, emulatorFindOne, watchFlash, flashSpell, clearFlashLog, toastLog } from "./helpers";
import { SEED } from "./seed";

// P-139 (D-68): reading a piece again. 1) same piece, same session, same operation: warned, not recorded again (until
// "Undo last"); 2) already there in that state: warned, sent, a row "already here" that the counter does not count;
// 3) a reading the server would flag: warned in red, sent. Own pieces (E2E- codes), Nord warehouse.
const head = (key: string, code: string) => tr(key).replace("{{code}}", code).split("{{")[0];
const PRODUCT = "MC400100"; // the material code of RX-100 in the seed catalog
async function type(page: Page, code: string): Promise<void> {
  await page.getByTestId("scan-manual-input").fill(code);
  await page.getByTestId("scan-manual-submit").click();
}
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
    await expect(page.getByTestId("scan-flash")).toBeHidden(); // "undone" said, before the next reading
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

  // P-157 (D-73), P-165 (D-75): a warning stays 8 s, long enough to be read by someone who has never seen it; green stays
  // short; "to sort later" stays 8 s; "Now read the product code" stays while the serial waits for it.
  test("il giallo resta 8 secondi; il verde resta breve; «Ora leggi il codice prodotto» resta finché serve", async ({ page }) => {
    test.setTimeout(240_000);
    const [a, b, c] = [uniqueCode("RR"), uniqueCode("RR"), uniqueCode("RR")];
    await watchFlash(page);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    const flash = page.getByTestId("scan-flash");

    await scanManual(page, a);
    await expect.poll(() => flashSpell(page, "ok")).toBeGreaterThan(0);
    expect(await flashSpell(page, "ok")).toBeLessThan(1800);

    await type(page, a);
    await expect(flash).toContainText(head("scan.readAgain", a));
    await expect.poll(() => flashSpell(page, "warn")).toBeGreaterThan(0);
    const yellow = await flashSpell(page, "warn");
    expect(yellow).toBeGreaterThanOrEqual(7500);
    expect(yellow).toBeLessThan(9500);

    await clearFlashLog(page);
    await page.getByTestId("scan-ask-product").check();
    await type(page, b);
    await expect(flash).toContainText(tr("scan.nowProductCode"));
    // Still there after 10 s, as a band; it goes when the product code is read (the reading then says how it went).
    await page.waitForTimeout(10_000);
    await expect(flash).toContainText(tr("scan.nowProductCode"));
    await expect(flash).toHaveAttribute("data-phase", "band");
    await type(page, PRODUCT);
    await expect(flash).toHaveAttribute("data-tone", "ok");
    await expect(flash).toContainText(b);
    await page.getByTestId("scan-ask-product").uncheck();

    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-sort-now").check();
    await type(page, c);
    await page.getByTestId("scan-modelpick-skip").click();
    await expect(flash).toContainText(head("scan.toSortLater", c));
    await expect.poll(() => flashSpell(page, "warn"), { timeout: 15_000 }).toBeGreaterThan(0);
    expect(await flashSpell(page, "warn")).toBeGreaterThanOrEqual(7500);
    expect(await flashSpell(page, "warn")).toBeLessThan(9500);
  });

  // P-165 (D-75 g): the notices at the top of "Scan" stay 8 s (the rest of the app keeps the default 4 s).
  test("un avviso in alto in «Leggi» resta 8 secondi", async ({ page }) => {
    test.setTimeout(180_000);
    const [a, b] = [uniqueCode("RR"), uniqueCode("RR")];
    await watchFlash(page);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    await page.getByTestId("scan-ask-product").check();
    await type(page, a);
    await expect(page.getByTestId("scan-flash")).toContainText(tr("scan.nowProductCode"));
    await type(page, b); // another serial instead of the product code: a notice says so
    const notice = page.getByText(tr("scan.notProductCode").replace("{{code}}", b));
    await expect(notice).toBeVisible();
    await page.waitForTimeout(7000);
    await expect(notice).toBeVisible({ timeout: 500 });
    expect(await toastLog(page)).toContain(tr("scan.notProductCode").replace("{{code}}", b));
  });

  // P-157 (D-73): the timer of a warning never switches off the next one (P-165: with the 8 s of D-75, the first one's
  // timer would switch it off at 8 s, before the 9.5 s measured).
  test("due avvisi di fila: il secondo dura i suoi 8 secondi", async ({ page }) => {
    test.setTimeout(180_000);
    const a = uniqueCode("RR");
    await watchFlash(page);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    await scanManual(page, a);
    await clearFlashLog(page);
    await type(page, a);
    await expect(page.getByTestId("scan-flash")).toContainText(head("scan.readAgain", a));
    await page.waitForTimeout(2000);
    await type(page, a);
    // The same text twice: one spell on the screen, as long as the gap plus the second warning.
    await expect.poll(() => flashSpell(page, "warn"), { timeout: 20_000 }).toBeGreaterThanOrEqual(9500);
  });

  test("lettura che il server rifiuterebbe: avviso rosso con stato e luogo, la lettura parte", async ({ page }) => {
    test.setTimeout(240_000);
    const c = uniqueCode("RR");
    await watchFlash(page);
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
    await expect.poll(() => flashSpell(page, "danger"), { timeout: 15_000 }).toBeGreaterThanOrEqual(7500); // P-165: 8 s
    await expect(page.getByTestId("scan-session-row").filter({ hasText: c })).toContainText(tr("scan.sent"), { timeout: 60_000 });
  });
});
