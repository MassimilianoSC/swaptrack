import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, tr, uniqueCode } from "./helpers";
import { SEED } from "./seed";

// Lot 15 (battery): in "Scan" the camera stayed on in high definition until the screen was left (only the decoding
// paused). Now it is really switched off (its tracks end) when the gun reads (P-212 b), after a minute without readings
// (P-213) and while the page is not seen (P-214), and it comes back with a tap or with the page.
// The page gets a canvas stream as its camera (as camera-repeat: no fake device, it saturated the machine) and a
// BarcodeDetector that sees nothing; the tests count the camera tracks still live.

async function fakeCamera(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __streams: MediaStream[]; BarcodeDetector: unknown };
    w.__streams = [];
    w.BarcodeDetector = class {
      static async getSupportedFormats() { return ["code_128"]; }
      async detect() { return []; }
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement("canvas");
      c.width = 64; c.height = 48;
      const g = c.getContext("2d")!;
      g.fillStyle = "#777"; g.fillRect(0, 0, 64, 48);
      const s = c.captureStream(5);
      w.__streams.push(s);
      return s;
    };
  });
}
const liveTracks = (page: Page) => page.evaluate(() =>
  (window as unknown as { __streams: MediaStream[] }).__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === "live").length);
async function openScan(page: Page): Promise<void> {
  await signIn(page, ACCOUNTS.aspWarehouseNord);
  await pickLocation(page, SEED.nord.warehouse);
  await page.goto("/scan?mode=arrive_at_warehouse");
  await expect.poll(() => liveTracks(page), { timeout: 30_000 }).toBe(1);
}
const setVisibility = (page: Page, state: "hidden" | "visible") => page.evaluate((s) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s });
  document.dispatchEvent(new Event("visibilitychange"));
}, state);

test.describe("Fotocamera di Leggi spenta quando non serve (telefono)", () => {
  test("una lettura della pistola spegne la fotocamera; un tocco la riaccende", async ({ page }) => {
    test.setTimeout(120_000);
    await fakeCamera(page);
    await openScan(page);
    // An own new piece from the gun: the "unknown piece" window, closed with "Skip" (the reading is recorded).
    await page.getByTestId("scan-wedge-input").fill(uniqueCode("GUN"));
    await page.getByTestId("scan-wedge-input").press("Enter");
    await page.getByTestId("scan-modelpick-skip").click();
    await expect.poll(() => liveTracks(page), { timeout: 15_000 }).toBe(0);
    await expect(page.getByTestId("scan-camera-off")).toHaveAttribute("data-reason", "gun");
    await page.getByTestId("scan-camera-on").click();
    await expect(page.getByTestId("scan-camera-off")).toHaveCount(0);
    await expect.poll(() => liveTracks(page), { timeout: 15_000 }).toBe(1);
  });

  test("un minuto senza letture spegne la fotocamera, con «Riaccendi la fotocamera»", async ({ page }) => {
    test.setTimeout(120_000);
    await page.clock.install();
    await fakeCamera(page);
    await openScan(page);
    await page.clock.fastForward(30_000);
    expect(await liveTracks(page)).toBe(1); // half a minute: still on
    await page.clock.fastForward(31_000);
    await expect.poll(() => liveTracks(page), { timeout: 15_000 }).toBe(0);
    await expect(page.getByTestId("scan-camera-off")).toHaveAttribute("data-reason", "idle");
    await expect(page.getByTestId("scan-camera-on")).toHaveText(tr("scan.cameraOn"));
    await page.getByTestId("scan-camera-on").click();
    await expect.poll(() => liveTracks(page), { timeout: 15_000 }).toBe(1);
  });

  test("pagina non visibile (schermo bloccato, altra app): fotocamera spenta, riaccesa al ritorno", async ({ page }) => {
    test.setTimeout(120_000);
    await fakeCamera(page);
    await openScan(page);
    await setVisibility(page, "hidden");
    await expect.poll(() => liveTracks(page), { timeout: 15_000 }).toBe(0);
    await setVisibility(page, "visible");
    await expect.poll(() => liveTracks(page), { timeout: 15_000 }).toBe(1);
    await expect(page.getByTestId("scan-camera-off")).toHaveCount(0);
  });
});
