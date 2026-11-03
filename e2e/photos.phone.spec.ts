import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr, openPiece } from "./helpers";
import { SEED } from "./seed";
import { deflateSync, crc32 } from "node:zlib";

// Photos (SPEC §7.3, §13.2; REGISTRO P-69, P-70 / D-32): a photo taken after a reading goes through the device queue,
// is uploaded to Storage and attached to the piece, ONCE; the piece page shows it. Own piece (E2E- code), Nord
// warehouse worker on the phone. Needs P-68 (server) for a photo attached before the trigger processed the event.

// A small grey PNG built here, enough for the compressor (imageCompress.js) to decode and re-encode as JPEG.
function png(size: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const raw = Buffer.alloc(size * (1 + size * 3), 0x80);
  for (let y = 0; y < size; y++) raw[y * (1 + size * 3)] = 0; // filter byte of each row
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const PNG = png(16);

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
});
