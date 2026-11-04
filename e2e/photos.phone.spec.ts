import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr, openPiece, png, emulatorRead, emulatorFile } from "./helpers";
import { SEED } from "./seed";
import { addExifGps, hasExif, hasGps } from "../tests/fixtures/exifGps";

// Photos (SPEC §7.3, §13.2; REGISTRO P-69, P-70 / D-32): a photo taken after a reading goes through the device queue,
// is uploaded to Storage and attached to the piece, ONCE; the piece page shows it. Own piece (E2E- code), Nord
// warehouse worker on the phone. Needs P-68 (server) for a photo attached before the trigger processed the event.

const PNG = png(16);

// Photos waiting in the device queue (IndexedDB of the app).
const queued = (page: Page) => page.evaluate(() => new Promise<number>((resolve, reject) => {
  const r = indexedDB.open("swaptrack-device");
  r.onsuccess = () => {
    const c = r.result.transaction("photos", "readonly").objectStore("photos").count();
    c.onsuccess = () => { resolve(c.result); r.result.close(); };
    c.onerror = () => reject(c.error);
  };
  r.onerror = () => reject(r.error);
}));

test.describe("Foto — dalla lettura alla pagina del pezzo (telefono)", () => {
  test("foto dopo la lettura: in coda, caricata una volta, visibile nella pagina del pezzo", async ({ page }) => {
    test.setTimeout(240_000);
    const code = uniqueCode("F");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    await scanManual(page, code, { withModel: true });

    await expect(page.getByTestId("scan-photo-button")).toBeEnabled();
    await page.getByTestId("scan-photo-input").setInputFiles({ name: "piece.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText(tr("scan.photoQueued")).first()).toBeVisible();
    await expect(page.getByTestId("scan-today-row").filter({ hasText: code })).toContainText(tr("scan.sent"), { timeout: 60_000 });

    // The photo leaves the device: the queue in IndexedDB empties (upload and attach done). Only then the test
    // leaves the scan screen, so no reload cuts the upload and sends the photo again.
    await expect.poll(() => page.evaluate(() => new Promise<number>((resolve, reject) => {
      const r = indexedDB.open("swaptrack-device");
      r.onsuccess = () => {
        const c = r.result.transaction("photos", "readonly").objectStore("photos").count();
        c.onsuccess = () => { resolve(c.result); r.result.close(); };
        c.onerror = () => reject(c.error);
      };
      r.onerror = () => reject(r.error);
    })), { timeout: 90_000, intervals: [2000] }).toBe(0);

    // The piece exists once the trigger has processed the reading; its page (live) shows exactly one photo.
    await openPiece(page, code);
    await expect(page.getByTestId("item-photos")).toBeVisible();
    await expect(page.getByTestId("item-photo")).toHaveCount(1, { timeout: 90_000 });
    await expect(page.getByTestId("item-photo").locator("img")).toHaveJSProperty("complete", true);
    await expect(page.getByTestId("item-photos")).not.toContainText(tr("items.photosEmpty"));
  });

  // P-22 (SPEC §7.3, §13.2): a photo taken WITHOUT network in the scanning screen stays on the phone; the app is closed
  // and opened again with the network: the photo leaves by itself, joins the piece, and the file on Storage carries no
  // EXIF and no GPS (the photo given to the app has an invented GPS position).
  test("foto senza rete: dopo la riapertura con la rete parte da sola, compare nel pezzo, senza EXIF né GPS", async ({ page, context }) => {
    test.setTimeout(300_000);
    const code = uniqueCode("F");
    const signInAt = Date.now();
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await expect.poll(async () => Number(await page.getByTestId("site-picker-offline-info").getAttribute("data-updated-at") ?? 0), { timeout: 90_000 }).toBeGreaterThan(signInAt);
    // A real JPEG made by the browser, with an invented GPS position added.
    const plain = await page.evaluate(() => new Promise<number[]>((resolve) => {
      const c = document.createElement("canvas"); c.width = 64; c.height = 48;
      const g = c.getContext("2d")!; g.fillStyle = "#3a7"; g.fillRect(0, 0, 64, 48);
      c.toBlob((b) => void b!.arrayBuffer().then((a) => resolve([...new Uint8Array(a)])), "image/jpeg", 0.9);
    }));
    const jpeg = addExifGps(new Uint8Array(plain));
    expect(hasGps(jpeg)).toBe(true);

    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    await context.setOffline(true);
    await scanManual(page, code);
    await page.getByTestId("scan-photo-input").setInputFiles({ name: "pezzo.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpeg) });
    await expect(page.getByText(tr("scan.photoQueued")).first()).toBeVisible();
    await expect.poll(() => queued(page), { timeout: 30_000 }).toBe(1);

    // The app is closed, the network comes back, the app is opened again.
    await page.close();
    await context.setOffline(false);
    const again = await context.newPage();
    await again.goto("/");
    await expect(again.getByTestId("topbar")).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => queued(again), { timeout: 120_000, intervals: [2000] }).toBe(0);

    const itemId = await openPiece(again, code);
    await expect(again.getByTestId("item-photo")).toHaveCount(1, { timeout: 90_000 });
    await expect(again.getByTestId("item-photo").locator("img")).toHaveJSProperty("complete", true);
    const paths = (await emulatorRead(`items/${itemId}`)).photoPaths as string[];
    expect(paths).toHaveLength(1);
    const stored = await emulatorFile(paths[0]);
    expect(hasExif(stored)).toBe(false);
    expect(hasGps(stored)).toBe(false);
  });
});
