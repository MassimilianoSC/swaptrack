import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, tr, rawKeysIn, emulatorDoc, emulatorFile, uniqueCode } from "./helpers";
import { SEED } from "./seed";
import { addExifGps, hasExif, hasGps } from "../tests/fixtures/exifGps";

// P-96: every text the user reads comes from i18n (never a raw key), and a photo attached as a DDT is uploaded the
// way the scan photos are (SPEC §7.3): compressed, without EXIF and GPS, so a phone photo over 5 MB is accepted.
test.describe("Testi e file (scrivania)", () => {
  test("ufficio cliente: Home, Anomalie ed Esportazioni senza testi grezzi", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, ACCOUNTS.clientOffice);

    await page.goto("/");
    await expect(page.getByTestId("home-card-items")).toBeVisible();
    expect(await rawKeysIn(page)).toEqual([]);

    await page.goto("/anomalies");
    await expect(page.getByTestId("anomalies-toggle")).toBeVisible();
    expect(await rawKeysIn(page)).toEqual([]);
    const toggleText = (await page.getByTestId("anomalies-toggle").textContent()) ?? "";
    await page.getByTestId("anomalies-toggle").click();
    await expect(page.getByTestId("anomalies-toggle")).not.toHaveText(toggleText);
    expect(await rawKeysIn(page)).toEqual([]);

    await page.goto("/exports");
    await page.getByTestId("exports-create").click();
    await expect(page.getByTestId("exports-table-row").first().locator("[data-testid^='exports-download-']")).toBeVisible({ timeout: 120_000 });
    expect(await rawKeysIn(page)).toEqual([]);
  });

  test("foto del DDT di un reso oltre 5 MB e con GPS: allegata, salvata compressa e senza EXIF", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);

    // A real phone-sized JPEG (noise does not compress), then an EXIF segment with a GPS position.
    const b64 = await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 2600; c.height = 2000;
      const g = c.getContext("2d")!;
      const img = g.createImageData(c.width, c.height);
      for (let i = 0; i < img.data.length; i++) img.data[i] = (i & 3) === 3 ? 255 : Math.floor(Math.random() * 256);
      g.putImageData(img, 0, 0);
      const blob = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), "image/jpeg", 0.95));
      return new Promise<string>((r) => { const f = new FileReader(); f.onload = () => r(String(f.result).split(",")[1]); f.readAsDataURL(blob); });
    });
    const photo = addExifGps(Uint8Array.from(Buffer.from(b64, "base64")));
    expect(photo.length).toBeGreaterThan(5 * 1024 * 1024);
    expect(hasGps(photo)).toBe(true);

    await page.goto("/shipments");
    await page.getByTestId("shipments-new-return").click();
    await page.getByTestId("shipments-from-select").selectOption(`loc_${SEED.nord.warehouse}`);
    await page.getByTestId("shipments-to-select").selectOption(`loc_${SEED.clientWarehouse}`);
    await page.getByTestId("shipments-create").click();
    await expect(page).toHaveURL(/\/shipments\/[^/]+$/, { timeout: 30_000 });
    const shipmentId = page.url().split("/").pop()!;

    await page.getByTestId("shipment-attach-ddt").setInputFiles({ name: "ddt.jpg", mimeType: "image/jpeg", buffer: Buffer.from(photo) });
    // P-200: a return without a DDT number asks for it before its first file.
    await page.getByTestId("shipment-attach-number").fill(uniqueCode("DDTF"));
    await page.getByTestId("shipment-attach-save").click();
    await expect(page.getByText(tr("documents.attached")).first()).toBeVisible({ timeout: 60_000 });

    const documentId = (await emulatorDoc(`shipments/${shipmentId}`)).documentId?.stringValue;
    expect(documentId).toBeTruthy();
    const path = (await emulatorDoc(`documents/${documentId}`)).files?.arrayValue?.values?.[0]?.stringValue;
    expect(path).toMatch(/\.jpg$/);
    const stored = await emulatorFile(path!);
    expect(stored.length).toBeLessThan(5 * 1024 * 1024);
    expect(hasExif(stored)).toBe(false);
    expect(hasGps(stored)).toBe(false);
  });
});
