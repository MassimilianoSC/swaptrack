import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, uniqueCode, tr } from "./helpers";
import { SEED } from "./seed";

// P-98 (criterion 2): in burst mode the camera restarts 0.9 s after a reading; with the phone held still on the
// label the same code must not be recorded twice, nor reopen the model pick of the piece just recorded.
// No fake camera device (it saturated the machine, e25c963): the page gets a tiny canvas stream as its camera and a
// BarcodeDetector that "sees" window.__fakeCode, so the real engine (webEngine.js, native path) runs unchanged.
test.describe("Fotocamera — raffica col telefono fermo sul codice (telefono)", () => {
  test("lo stesso codice inquadrato dopo la lettura non si registra due volte né riapre la scelta del modello", async ({ page }) => {
    test.setTimeout(180_000);
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
    const code = uniqueCode("C");

    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    await expect(page.getByTestId("scan-engine")).toHaveText(tr("scan.engine.native"));

    // The phone frames the label: unknown piece, the model is asked once and the reading is recorded.
    await page.evaluate((c) => { (window as unknown as { __fakeCode: string }).__fakeCode = c; }, code);
    await expect(page.getByTestId("scan-modelpick-select")).toBeVisible();
    await page.getByTestId("scan-modelpick-select").selectOption({ index: 1 });
    await page.getByTestId("scan-modelpick-save").click();
    await expect(page.getByTestId("scan-flash")).toContainText(code);

    // The phone stays on the label well past the camera restart (0.9 s): nothing else happens.
    await page.waitForTimeout(4000);
    await expect(page.getByTestId("scan-modelpick-select")).toBeHidden();
    await expect(page.getByTestId("scan-session-count")).toHaveText("1");
    await expect(page.getByTestId("scan-today-row").filter({ hasText: code })).toHaveCount(1);
    await page.evaluate(() => { (window as unknown as { __fakeCode: null }).__fakeCode = null; });
  });
});
