import { test, expect, type Page } from "@playwright/test";
import { signIn, pickLocation, scanManual, uniqueCode, png, emulatorCreateUser, emulatorSetClaims, emulatorSetDoc } from "./helpers";
import { SEED } from "./seed";

// P-87a (D-40, SPEC §4.12): on a shared phone nothing of a user is lost or sent with someone else's account.
// Own accounts (created in the emulator), Nord warehouse workers. A photo is kept in the device queue by refusing the
// uploads to Storage (the phone "without signal" for Storage only).
async function ownWorker(): Promise<{ uid: string; email: string; profile: Record<string, unknown> }> {
  const email = `e2e.${uniqueCode("S").toLowerCase()}@swaptrack-demo.test`;
  const uid = await emulatorCreateUser(email);
  const profile = { email, firstName: "Prova", lastName: "E2E", role: "asp_warehouse", orgId: SEED.nord.orgId, active: true, language: "it", privacyNoticeVersion: null, deleted: false };
  await emulatorSetDoc(`users/${uid}`, profile);
  await emulatorSetClaims(uid, { role: "asp_warehouse", orgId: SEED.nord.orgId, active: true, disabledAt: null });
  return { uid, email, profile };
}
const STORAGE = "**/v0/b/**";
async function queuePhoto(page: Page): Promise<void> {
  await pickLocation(page, SEED.nord.warehouse);
  await page.goto("/scan?mode=arrive_at_warehouse");
  await page.getByTestId("scan-flow-select").selectOption("new");
  await scanManual(page, uniqueCode("S"), { withModel: true });
  await page.getByTestId("scan-photo-input").setInputFiles({ name: "pezzo.png", mimeType: "image/png", buffer: png(16) });
  await expect(page.getByTestId("topbar-pending-count")).toBeVisible({ timeout: 30_000 });
}

test.describe("Telefono condiviso — uscite e coda delle foto (telefono)", () => {
  test("«Esci» dall'informativa nuova con una foto in coda: non esce e dice cosa manca", async ({ page }) => {
    test.setTimeout(180_000);
    const w = await ownWorker();
    await page.route(STORAGE, (r) => r.abort());
    await signIn(page, w.email);
    await queuePhoto(page);
    // A new privacy notice to accept (the profile says an older version was accepted).
    await emulatorSetDoc(`users/${w.uid}`, { ...w.profile, privacyNoticeVersion: -1 });
    await page.getByTestId("privacy-signout-button").click();
    await expect(page.getByTestId("signout-pending-list")).toBeVisible();
    await expect(page.getByTestId("signin-submit-button")).toHaveCount(0);
  });

  test("un nuovo utente sullo stesso telefono non carica le foto rimaste del precedente", async ({ page }) => {
    test.setTimeout(240_000);
    const a = await ownWorker();
    const b = await ownWorker();
    await page.route(STORAGE, (r) => r.abort());
    await signIn(page, a.email);
    await queuePhoto(page);
    // A leaves without the app's sign-out (the browser's sign-in is lost); the photo stays in the device queue.
    await page.evaluate(() => new Promise<void>((done) => { const r = indexedDB.deleteDatabase("firebaseLocalStorageDb"); r.onsuccess = r.onerror = r.onblocked = () => done(); }));
    await page.unroute(STORAGE);
    const uploads: string[] = [];
    page.on("request", (r) => { if (r.url().includes("/v0/b/") && r.method() === "POST") uploads.push(r.url()); });
    await signIn(page, b.email);
    await expect(page.getByTestId("topbar")).toBeVisible();
    await page.waitForTimeout(5000);
    expect(uploads).toEqual([]);
  });

  test("«Esci da tutti i dispositivi» con una foto in coda: non esce e dice cosa manca", async ({ page }) => {
    test.setTimeout(180_000);
    const w = await ownWorker();
    await page.route(STORAGE, (r) => r.abort());
    await signIn(page, w.email);
    await queuePhoto(page);
    await page.goto("/profile");
    await page.getByTestId("profile-signout-everywhere-button").click();
    await expect(page.getByTestId("signout-pending-list")).toBeVisible();
    await expect(page.getByTestId("signin-submit-button")).toHaveCount(0);
  });
});
