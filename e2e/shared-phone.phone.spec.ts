import { test, expect, type Page } from "@playwright/test";
import { PASSWORD, signIn, pickLocation, scanManual, uniqueCode, tr, emulatorCreateUser, emulatorSetClaims, emulatorSetDoc } from "./helpers";
import { SEED } from "./seed";

// P-87b (D-40, SPEC §4.12): another user signs in on a phone where the previous one left readings not yet sent (the
// previous user's sign-in was lost, e.g. "Sign out of all devices" from another phone). Before the device is cleared
// the app says so and offers two choices. Own accounts (created in the emulator), Nord warehouse workers; the reading is
// kept in the queue by refusing every request to Firestore.
async function ownWorker(): Promise<string> {
  const email = `e2e.${uniqueCode("P").toLowerCase()}@swaptrack-demo.test`;
  const uid = await emulatorCreateUser(email);
  await emulatorSetDoc(`users/${uid}`, { email, firstName: "Prova", lastName: "E2E", role: "asp_warehouse", orgId: SEED.nord.orgId, active: true, language: "it", privacyNoticeVersion: null, deleted: false });
  await emulatorSetClaims(uid, { role: "asp_warehouse", orgId: SEED.nord.orgId, active: true, disabledAt: null });
  return email;
}
const FIRESTORE = (url: URL) => url.pathname.includes("google.firestore");

// A reads one piece without a connection to Firestore, then loses the sign-in without the app's sign-out.
async function readingLeftBehind(page: Page, a: string): Promise<void> {
  await signIn(page, a);
  await pickLocation(page, SEED.nord.warehouse);
  await page.goto("/scan?mode=arrive_at_warehouse");
  await page.getByTestId("scan-flow-select").selectOption("new");
  await page.route(FIRESTORE, (r) => r.abort());
  await scanManual(page, uniqueCode("P"));
  await expect(page.getByTestId("topbar-pending-count")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => new Promise<void>((done) => { const r = indexedDB.deleteDatabase("firebaseLocalStorageDb"); r.onsuccess = r.onerror = r.onblocked = () => done(); }));
}
async function signInAs(page: Page, email: string): Promise<void> {
  await page.goto("/signin");
  await page.getByTestId("signin-email-input").fill(email);
  await page.getByTestId("signin-password-input").fill(PASSWORD);
  await page.getByTestId("signin-submit-button").click();
}

test.describe("Telefono condiviso — dati del precedente non inviati (telefono)", () => {
  test("entra B con una lettura di A in coda: avviso; «Esci» → A rientra e la lettura parte", async ({ page }) => {
    test.setTimeout(240_000);
    const [a, b] = [await ownWorker(), await ownWorker()];
    await readingLeftBehind(page, a);

    await signInAs(page, b);
    const screen = page.getByTestId("previous-pending-screen");
    await expect(screen).toContainText(tr("gate.previousPending.body_one").replace("{{count}}", "1"), { timeout: 30_000 });
    await expect(page.getByTestId("topbar")).toHaveCount(0);
    await page.getByTestId("previous-pending-keep").click();
    await expect(page.getByTestId("signin-previous-pending-notice")).toHaveText(tr("gate.previousPending.keptNotice"));

    // A signs in again with the network: nothing was cleared and the reading is sent.
    await page.unroute(FIRESTORE);
    await signIn(page, a);
    await expect(page.getByTestId("previous-pending-screen")).toHaveCount(0);
    await expect(page.getByTestId("topbar-pending-count")).toHaveCount(0, { timeout: 60_000 });
  });

  test("entra B con una lettura di A in coda: «Cancella e continua» → B usa l'app, i dati di A non ci sono più", async ({ page }) => {
    test.setTimeout(240_000);
    const [a, b] = [await ownWorker(), await ownWorker()];
    await readingLeftBehind(page, a);

    await signInAs(page, b);
    await expect(page.getByTestId("previous-pending-screen")).toBeVisible({ timeout: 30_000 });
    await page.unroute(FIRESTORE);
    await page.getByTestId("previous-pending-discard").click();
    const privacy = page.getByTestId("privacy-accept-button");
    await expect(privacy.or(page.getByTestId("topbar"))).toBeVisible({ timeout: 30_000 });
    if (await privacy.isVisible()) await privacy.click();
    await expect(page.getByTestId("topbar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("topbar-pending-count")).toHaveCount(0);
  });
});
