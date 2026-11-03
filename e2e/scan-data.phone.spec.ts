import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr, png, emulatorPatchSetting } from "./helpers";
import { SEED } from "./seed";

// P-115 (criterion 2, censimento §11): the readings carry the right data and the user always knows what happened.
// Own pieces and documents (E2E- codes); the photo setting is turned on for one test and back off.
async function signOut(page: Page): Promise<void> {
  await page.getByTestId("user-menu-trigger").click();
  await page.getByTestId("user-menu-signout").click();
  await expect(page.getByTestId("signin-submit-button")).toBeVisible({ timeout: 30_000 });
}
const sessionLocation = (page: Page) => page.evaluate(() => (JSON.parse(sessionStorage.getItem("swaptrack.location") ?? "null") as { id?: string } | null)?.id ?? null);

test.describe("Letture con i dati giusti (telefono)", () => {
  // n.23: a reading the rules refuse (here: a place that no longer exists) says so, instead of waiting forever.
  test("lettura rifiutata dal server: la riga dice «Rifiutata» e un messaggio spiega", async ({ page }) => {
    test.setTimeout(180_000);
    const code = uniqueCode("J");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await page.evaluate(() => sessionStorage.setItem("swaptrack.location", JSON.stringify({ id: "loc_TOLTO-01", code: "TOLTO-01", name: "Magazzino tolto", type: "asp_warehouse" })));
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    await scanManual(page, code, { withModel: true });
    await expect(page.getByTestId("scan-session-refused")).toHaveText(tr("scan.refused"), { timeout: 30_000 });
    await expect(page.getByText(tr("scan.refusedToast").replace("{{code}}", code))).toBeVisible();
  });

  // n.21: after "Undo last" the photo never goes with the undone reading.
  test("dopo «Annulla l'ultima» la Foto non resta agganciata alla lettura annullata", async ({ page }) => {
    test.setTimeout(180_000);
    const code = uniqueCode("J");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    await scanManual(page, code, { withModel: true });
    await expect(page.getByTestId("scan-photo-button")).toBeEnabled();
    await page.getByTestId("scan-undo").click();
    await expect(page.getByTestId("scan-session-count")).toHaveText("0");
    await expect(page.getByTestId("scan-photo-button")).toBeDisabled();
  });

  // n.4: the BOM ticks on the phone count only the readings at that site (like the server's check).
  test("spunte BOM: una lettura fatta in un altro sito non spunta la BOM di questo", async ({ page }) => {
    test.setTimeout(240_000);
    const code = uniqueCode("J");
    await signIn(page, ACCOUNTS.aspAdminNord);
    await page.goto("/documents/new");
    await page.getByTestId("document-kind").selectOption("bom");
    await page.getByTestId("document-number").fill(uniqueCode("BOMJ"));
    await page.getByTestId("document-location").selectOption(`loc_${SEED.nord.site3}`); // a site of this test only
    await page.getByTestId("document-lines-remove").fill(code);
    await page.getByTestId("document-save-new").click();
    await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });
    await signOut(page);

    const signInAt = Date.now();
    await signIn(page, ACCOUNTS.aspTechnicianNord);
    await page.goto("/");
    await expect.poll(async () => Number(await page.getByTestId("site-picker-offline-info").getAttribute("data-updated-at") ?? 0), { timeout: 60_000 }).toBeGreaterThan(signInAt);
    // The piece is removed at another site...
    await pickLocation(page, SEED.nord.site2);
    await page.goto("/scan?mode=remove_at_site");
    await scanManual(page, code, { withModel: true });
    // ...so at the BOM's site nothing is ticked yet.
    await pickLocation(page, SEED.nord.site3);
    await page.goto("/scan?mode=remove_at_site");
    await expect(page.getByTestId("scan-bom-count")).toHaveText("0/1");
  });

  // n.28: opened from a shipment, the reading works at the shipment's place, not at the one left in the session.
  test("lettura aperta da un reso: il luogo diventa quello di partenza del reso", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, ACCOUNTS.aspAdminNord);
    await pickLocation(page, "MAG-NORD-02"); // the session is at the other Nord warehouse
    await page.goto("/shipments");
    await page.getByTestId("shipments-new-return").click();
    await page.getByTestId("shipments-from-select").selectOption(`loc_${SEED.nord.warehouse}`);
    await page.getByTestId("shipments-to-select").selectOption(`loc_${SEED.clientWarehouse}`);
    await page.getByTestId("shipments-create").click();
    await expect(page).toHaveURL(/\/shipments\/[^/]+$/, { timeout: 30_000 });
    await page.getByTestId("shipment-scan").click();
    await expect(page).toHaveURL(/mode=return_ship/);
    await expect.poll(() => sessionLocation(page), { timeout: 30_000 }).toBe(`loc_${SEED.nord.warehouse}`);
  });

  // n.5: "photo mandatory for defective pieces" (Settings) is read by the scanning screen: it asks for the photo.
  // NOTE: settings/photos is shared by every test. This test turns the setting on and always back off (finally); it is
  // safe only while no other test classifies defective pieces. A new test on defective pieces must not run alongside.
  test("foto obbligatoria per i difettosi: dopo la lettura del difettoso la schermata chiede la foto", async ({ page }) => {
    test.setTimeout(300_000);
    const code = uniqueCode("J");
    // Written in the emulator (what the Settings page saves): this test is about the scanning screen reading it.
    const setMandatory = (on: boolean) => emulatorPatchSetting("photos", { mandatoryForDefective: on });
    await setMandatory(true);
    try {
      await signIn(page, ACCOUNTS.aspWarehouseNord);
      await pickLocation(page, SEED.nord.warehouse);
      await page.goto("/scan?mode=arrive_at_warehouse");
      await page.getByTestId("scan-flow-select").selectOption("new");
      await scanManual(page, code, { withModel: true });
      await page.getByTestId("scan-mode-classify").click();
      await page.getByTestId("scan-newclass-select").selectOption("defective");
      await scanManual(page, code);
      await expect(page.getByTestId("scan-defective-photo-needed")).toBeVisible();
      await page.getByTestId("scan-photo-input").setInputFiles({ name: "difetto.png", mimeType: "image/png", buffer: png(16) });
      await expect(page.getByTestId("scan-defective-photo-needed")).toHaveCount(0);
    } finally {
      await setMandatory(false);
    }
  });
});
