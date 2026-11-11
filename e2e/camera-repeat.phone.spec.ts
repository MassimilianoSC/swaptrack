import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, uniqueCode, tr, watchFlash, flashLog, toastLog, clearFlashLog, flashSpell } from "./helpers";
import { SEED } from "./seed";

// The camera of the scanning screen with the phone held on a label (criterion 2).
// No fake camera device (it saturated the machine, e25c963): the page gets a tiny canvas stream as its camera and a
// BarcodeDetector that "sees" window.__fakeCode, so the real engine (webEngine.js, native path) runs unchanged.
// burst: the camera restarts by itself after a reading (P-121, off by default); the tests of burst behaviour turn it on.
async function fakeCamera(page: Page, burst = true): Promise<void> {
  if (burst) await page.addInitScript(() => { try { localStorage.setItem("swaptrack.burst", "1"); } catch { /* no storage */ } });
  await page.addInitScript(() => {
    const w = window as unknown as { __fakeCode: string | null; __detects: number; BarcodeDetector: unknown };
    w.__fakeCode = null;
    w.__detects = 0;
    w.BarcodeDetector = class {
      static async getSupportedFormats() { return ["code_128"]; }
      async detect() { w.__detects++; return w.__fakeCode ? [{ rawValue: w.__fakeCode, boundingBox: { x: 0, y: 0, width: 32, height: 24 } }] : []; }
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement("canvas");
      c.width = 64; c.height = 48;
      const g = c.getContext("2d")!;
      let n = 0;
      setInterval(() => { g.fillStyle = n++ % 2 ? "#777" : "#888"; g.fillRect(0, 0, 64, 48); }, 100);
      return c.captureStream(10);
    };
  });
}
// The label in front of the camera (null: the phone is moved away).
const frame = (page: Page, code: string | null) => page.evaluate((c) => { (window as unknown as { __fakeCode: string | null }).__fakeCode = c; }, code);

const detects = (page: Page) => page.evaluate(() => (window as unknown as { __detects: number }).__detects);
const readAgainHead = (code: string) => tr("scan.readAgain").replace("{{code}}", code).split("{{")[0];
// A piece read by the camera (model chosen), then the phone moved away until the 3 s rule and the popup are over.
async function readOnceAndMoveAway(page: Page, code: string): Promise<void> {
  await frame(page, code);
  await page.getByTestId("scan-modelpick-select").selectOption({ index: 1 });
  await page.getByTestId("scan-modelpick-save").click();
  await expect(page.getByTestId("scan-flash")).toContainText(code);
  await frame(page, null);
  await page.waitForTimeout(3500);
  await expect(page.getByText(tr("scan.alreadyRead"))).toHaveCount(0);
  await expect(page.getByTestId("scan-flash")).toBeHidden();
}

// The Nord warehouse worker, arrival of new material, camera running.
async function arrivalWithCamera(page: Page): Promise<void> {
  await fakeCamera(page);
  await signIn(page, ACCOUNTS.aspWarehouseNord);
  await pickLocation(page, SEED.nord.warehouse);
  await page.goto("/scan?mode=arrive_at_warehouse");
  await page.getByTestId("scan-flow-select").selectOption("new");
  await expect(page.getByTestId("scan-engine")).toHaveText(tr("scan.engine.native"));
}

test.describe("Fotocamera — raffica col telefono fermo sul codice (telefono)", () => {
  // P-98, P-108, P-109: in burst mode the camera restarts 0.9 s after a reading; with the phone held still on the label
  // the same code must not be recorded twice, nor reopen the model pick of the piece just recorded, and the user is told.
  test("lo stesso codice inquadrato dopo la lettura non si registra due volte né riapre la scelta del modello", async ({ page }) => {
    test.setTimeout(180_000);
    const code = uniqueCode("C");
    await arrivalWithCamera(page);

    // P-108: before the first reading the photo button is off, looks like a button (dashed border, not faded) and says why.
    const photo = page.getByTestId("scan-photo-button");
    await expect(photo).toBeDisabled();
    await expect(page.getByTestId("scan-photo-hint")).toHaveText(tr("scan.photoHint"));
    expect(await photo.evaluate((b) => [getComputedStyle(b).borderStyle, getComputedStyle(b).opacity])).toEqual(["dashed", "1"]);

    // The phone frames the label: unknown piece, the model is asked once and the reading is recorded.
    await frame(page, code);
    await expect(page.getByTestId("scan-modelpick-select")).toBeVisible();
    await page.getByTestId("scan-modelpick-select").selectOption({ index: 1 });
    await page.getByTestId("scan-modelpick-save").click();
    await expect(page.getByTestId("scan-flash")).toContainText(code);
    await expect(photo).toBeEnabled();
    await expect(page.getByTestId("scan-photo-hint")).toHaveCount(0);

    // P-109: the camera sees the code again after its restart: a short notice says why nothing is recorded.
    await expect(page.getByText(tr("scan.alreadyRead"))).toBeVisible({ timeout: 5000 });

    // The phone stays on the label well past the camera restart (0.9 s): nothing else happens.
    await page.waitForTimeout(4000);
    await expect(page.getByTestId("scan-modelpick-select")).toBeHidden();
    await expect(page.getByTestId("scan-session-count")).toHaveText("1");
    await expect(page.getByTestId("scan-today-row").filter({ hasText: code })).toHaveCount(1);
    await frame(page, null);
  });

  // P-157 (D-73): the yellow says it once: with the label still in view no second yellow (the 3 s rule would be over
  // when the camera restarts) and no quiet "already read" after it.
  test("etichetta ferma 11 secondi dopo un giallo: un solo giallo, niente popup, contatore fermo", async ({ page }) => {
    test.setTimeout(180_000);
    const code = uniqueCode("C");
    await watchFlash(page);
    await arrivalWithCamera(page);
    await readOnceAndMoveAway(page, code);
    await clearFlashLog(page);

    await frame(page, code);
    await expect(page.getByTestId("scan-flash")).toContainText(readAgainHead(code));
    await page.waitForTimeout(11_000); // P-165: past the end of the band (8 s)
    expect((await flashLog(page)).filter((e) => e.v.startsWith("warn|"))).toHaveLength(1);
    expect(await toastLog(page)).not.toContain(tr("scan.alreadyRead"));
    await expect(page.getByTestId("scan-session-count")).toHaveText("1");
    await expect(page.getByTestId("scan-session-row")).toHaveCount(1);
    await frame(page, null);
  });

  // P-157 (D-73): a window opened during the warning (a code typed by hand) keeps the camera stopped; it restarts when
  // the window closes. Before, the camera restarted under the window and the next label replaced the piece being asked.
  test("una finestra aperta durante il giallo: la fotocamera non riparte sotto, riparte quando si chiude", async ({ page }) => {
    test.setTimeout(240_000);
    const [a, b, c] = [uniqueCode("C"), uniqueCode("C"), uniqueCode("C")];
    await arrivalWithCamera(page);
    await readOnceAndMoveAway(page, a);
    await frame(page, a);
    await expect(page.getByTestId("scan-flash")).toContainText(readAgainHead(a));
    await frame(page, null);

    await page.getByTestId("scan-manual-input").fill(c);
    await page.getByTestId("scan-manual-submit").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(c);
    await page.waitForTimeout(3500); // past the camera restart (3 s, P-165: not the end of the message)
    await frame(page, b);
    await page.waitForTimeout(2500);
    await expect(dialog).toContainText(c);
    await expect(dialog).not.toContainText(b);

    await page.getByTestId("scan-modelpick-skip").click();
    await expect(dialog).toContainText(b, { timeout: 10_000 });
    await frame(page, null);
  });

  // P-157 (D-73): leaving the screen during the warning leaves nothing behind; coming back the camera reads normally.
  test("uscire dalla schermata durante il giallo: nessuna ripartenza dopo, al ritorno si legge", async ({ page }) => {
    test.setTimeout(240_000);
    const [a, b] = [uniqueCode("C"), uniqueCode("C")];
    await arrivalWithCamera(page);
    await readOnceAndMoveAway(page, a);
    await frame(page, a);
    await expect(page.getByTestId("scan-flash")).toContainText(readAgainHead(a));
    await frame(page, null);

    const go = (to: string) => page.evaluate((path) => { history.pushState({}, "", path); dispatchEvent(new PopStateEvent("popstate")); }, to);
    await go("/");
    await expect(page.getByTestId("scan-screen")).toHaveCount(0);
    const before = await detects(page);
    await page.waitForTimeout(4000); // past the camera restart (3 s, P-165: not the end of the message)
    expect(await detects(page)).toBe(before);

    await go("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    await expect(page.getByTestId("scan-engine")).toHaveText(tr("scan.engine.native"));
    await frame(page, b);
    await expect(page.getByTestId("scan-modelpick-select")).toBeVisible({ timeout: 10_000 });
    await frame(page, null);
  });

  // P-165 (D-75): the yellow stays 8 s; when the camera reads again (3 s) it becomes a band at the top of the video that
  // leaves the frame free.
  test("giallo: alla ripartenza della fotocamera diventa una fascia in alto, il mirino libero, fino a 8 secondi", async ({ page }) => {
    test.setTimeout(180_000);
    const code = uniqueCode("C");
    await watchFlash(page);
    await arrivalWithCamera(page);
    await readOnceAndMoveAway(page, code);
    await clearFlashLog(page);
    await frame(page, code);
    const flash = page.getByTestId("scan-flash");
    await expect(flash).toContainText(readAgainHead(code));
    await frame(page, null);
    await expect(flash).toHaveAttribute("data-phase", "band", { timeout: 6000 });
    const band = (await flash.boundingBox())!;
    const aim = (await page.getByTestId("scan-aim").boundingBox())!;
    expect(band.y + band.height).toBeLessThanOrEqual(aim.y);
    await expect.poll(() => flashSpell(page, "warn"), { timeout: 15_000 }).toBeGreaterThanOrEqual(7500);
    expect(await flashSpell(page, "warn")).toBeLessThan(9500);
  });

  // P-165 (D-75 c): a new reading takes the band away (guard: before, the yellow was already gone at 3 s).
  test("una lettura nuova toglie la fascia del giallo", async ({ page }) => {
    test.setTimeout(180_000);
    const [a, b] = [uniqueCode("C"), uniqueCode("C")];
    await arrivalWithCamera(page);
    await readOnceAndMoveAway(page, a);
    await frame(page, a);
    await expect(page.getByTestId("scan-flash")).toContainText(readAgainHead(a));
    await frame(page, null);
    await page.waitForTimeout(3500); // the camera reads again
    await frame(page, b);
    await expect(page.getByText(readAgainHead(a))).toHaveCount(0, { timeout: 3000 });
    await expect(page.getByRole("dialog")).toContainText(b);
    await frame(page, null);
  });

  // P-102: in "Sort" the confirmation window cancelled with Escape (like the back key) records nothing and the camera
  // reads the next label at once.
  test("Smista: annullare la conferma non ferma la fotocamera", async ({ page }) => {
    test.setTimeout(180_000);
    const [a, b] = [uniqueCode("K"), uniqueCode("K")];
    await fakeCamera(page);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=classify");
    await expect(page.getByTestId("scan-engine")).toHaveText(tr("scan.engine.native"));
    const dialog = page.getByRole("dialog");
    await frame(page, a);
    await expect(dialog).toContainText(a);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("scan-session-count")).toHaveText("0");
    await frame(page, b);
    await expect(dialog).toContainText(b, { timeout: 10_000 });
    await frame(page, null);
  });

  // P-112 / D-50: closing the model window of an unknown piece (X, Escape like the back key) is "Skip": the reading is
  // recorded without a model and the camera reads the next label at once (before, it stayed paused for good).
  test("chiudere la scelta del modello registra la lettura e la fotocamera legge subito l'etichetta dopo", async ({ page }) => {
    test.setTimeout(180_000);
    const [a, b] = [uniqueCode("K"), uniqueCode("K")];
    await arrivalWithCamera(page);
    const dialog = page.getByRole("dialog");

    await frame(page, a);
    await expect(dialog).toContainText(a);
    await page.getByTestId("dialog-close-button").click();
    await expect(page.getByTestId("scan-session-count")).toHaveText("1");
    await expect(page.getByTestId("scan-today-row").filter({ hasText: a })).toHaveCount(1);

    await frame(page, b);
    await expect(dialog).toContainText(b, { timeout: 10_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("scan-session-count")).toHaveText("2");
    await expect(page.getByTestId("scan-today-row").filter({ hasText: b })).toHaveCount(1);
    await frame(page, null);
  });

  // D-55 / P-121: burst mode off (the default): after a reading the camera waits for "Read the next"; turned on, it reads
  // the next label by itself, and the phone remembers the choice. Fixed category in "Sort": no window, one reading each.
  test("Raffica: spenta aspetta «Leggi il prossimo», accesa legge da sola e la scelta resta", async ({ page }) => {
    test.setTimeout(240_000);
    const [a, b, c, d] = [uniqueCode("R"), uniqueCode("R"), uniqueCode("R"), uniqueCode("R")];
    await fakeCamera(page, false);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=classify");
    await page.getByTestId("scan-category-select").selectOption("cat_reuse");
    await expect(page.getByTestId("scan-engine")).toHaveText(tr("scan.engine.native"));
    await expect(page.getByTestId("scan-burst")).not.toBeChecked();
    const count = page.getByTestId("scan-session-count");

    await frame(page, a);
    await expect(count).toHaveText("1");
    await frame(page, b);
    await page.waitForTimeout(3000);
    await expect(count).toHaveText("1"); // the camera waits
    await page.getByTestId("scan-next").click();
    await expect(count).toHaveText("2");

    // Burst on: the next label is read without touching anything; the choice survives a reload.
    await page.getByTestId("scan-burst").check();
    await page.reload();
    await expect(page.getByTestId("scan-burst")).toBeChecked();
    await page.getByTestId("scan-category-select").selectOption("cat_reuse");
    await expect(page.getByTestId("scan-engine")).toHaveText(tr("scan.engine.native"));
    await frame(page, c);
    await expect(count).toHaveText("1");
    await frame(page, d);
    await expect(count).toHaveText("2", { timeout: 10_000 });
    await expect(page.getByTestId("scan-next")).toHaveCount(0);
    await frame(page, null);
  });
});
