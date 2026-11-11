import { test, expect, type Page } from "@playwright/test";
import { signIn, pickLocation, scanManual, uniqueCode, png, PASSWORD, emulatorCreateUser, emulatorSetClaims, emulatorSetDoc, tr } from "./helpers";
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
    // P-87b: B is first told about the photo left behind; neither while asking nor after "delete and continue" is it sent.
    await page.goto("/signin");
    await page.getByTestId("signin-email-input").fill(b.email);
    await page.getByTestId("signin-password-input").fill(PASSWORD);
    await page.getByTestId("signin-submit-button").click();
    await expect(page.getByTestId("previous-pending-screen")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(5000);
    expect(uploads).toEqual([]);
    await page.getByTestId("previous-pending-discard").click();
    const privacy = page.getByTestId("privacy-accept-button");
    await expect(privacy.or(page.getByTestId("topbar"))).toBeVisible({ timeout: 30_000 });
    if (await privacy.isVisible()) await privacy.click();
    await expect(page.getByTestId("topbar")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(5000);
    expect(uploads).toEqual([]);
  });

  // P-167: "Sign out" right after the photo of a reading: blocked (the photo waits), and the window says so. It said
  // "0 readings, 0 photos": the photos were counted every 5 s, the click counted them at once.
  test("«Esci» subito dopo la foto di una lettura: non esce e il riquadro conta la foto", async ({ page }) => {
    test.setTimeout(180_000);
    const w = await ownWorker();
    // What the window says when it appears (it is updated every 5 s after, so a later look proves nothing).
    await page.addInitScript(() => {
      new MutationObserver(() => {
        const w = window as unknown as { __firstPendingList?: string };
        const el = document.querySelector("[data-testid='signout-pending-list']");
        if (el && w.__firstPendingList === undefined) w.__firstPendingList = el.textContent ?? "";
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await page.route(STORAGE, (r) => r.abort());
    await signIn(page, w.email);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    await scanManual(page, uniqueCode("S"), { withModel: true });
    await page.getByTestId("scan-photo-input").setInputFiles({ name: "pezzo.png", mimeType: "image/png", buffer: png(16) });
    await expect(page.getByText(tr("scan.photoQueued")).first()).toBeVisible();
    await page.getByTestId("user-menu-trigger").click();
    await page.getByTestId("user-menu-signout").click();
    const list = page.getByTestId("signout-pending-list");
    await expect(list).toBeVisible();
    const first = await page.evaluate(() => (window as unknown as { __firstPendingList?: string }).__firstPendingList ?? "");
    expect(first).toContain(tr("status.pendingPhotos").replace("{{count}}", "1"));
    await expect(page.getByTestId("signin-submit-button")).toHaveCount(0);
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
