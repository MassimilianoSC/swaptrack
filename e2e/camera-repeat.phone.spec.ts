import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, uniqueCode, tr } from "./helpers";
import { SEED } from "./seed";

// The camera of the scanning screen with the phone held on a label (criterion 2).
// No fake camera device (it saturated the machine, e25c963): the page gets a tiny canvas stream as its camera and a
// BarcodeDetector that "sees" window.__fakeCode, so the real engine (webEngine.js, native path) runs unchanged.
async function fakeCamera(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __fakeCode: string | null; BarcodeDetector: unknown };
    w.__fakeCode = null;
    w.BarcodeDetector = class {
      static async getSupportedFormats() { return ["code_128"]; }
      async detect() { return w.__fakeCode ? [{ rawValue: w.__fakeCode, boundingBox: { x: 0, y: 0, width: 32, height: 24 } }] : []; }
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
});
