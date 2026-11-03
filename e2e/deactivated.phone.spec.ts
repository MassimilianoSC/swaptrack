import { test, expect } from "@playwright/test";
import { signIn, scanManual, uniqueCode, tr, emulatorCreateUser, emulatorSetClaims, emulatorSetDoc } from "./helpers";
import { SEED } from "./seed";

// Censimento n.33 (P-115, SPEC §4.8): after a deactivation the sign-in page says "the remaining readings were sent"
// only when it is true. Here one reading was refused by the server, so it must say that something was not sent.
// The account is the test's own (created in the emulator), never a seeded one.
test.describe("Disattivazione — il messaggio finale dice la verità (telefono)", () => {
  test("una lettura rifiutata prima della disattivazione: il messaggio dice che qualcosa non è partito", async ({ page }) => {
    test.setTimeout(180_000);
    const email = `e2e.${uniqueCode("U").toLowerCase()}@swaptrack-demo.test`;
    const uid = await emulatorCreateUser(email);
    const profile = { email, firstName: "Prova", lastName: "E2E", role: "asp_warehouse", orgId: SEED.nord.orgId, active: true, language: "it", privacyNoticeVersion: null, deleted: false };
    await emulatorSetDoc(`users/${uid}`, profile);
    await emulatorSetClaims(uid, { role: "asp_warehouse", orgId: SEED.nord.orgId, active: true, disabledAt: null });

    await signIn(page, email);
    // A reading at a place that no longer exists: the rules refuse it.
    await page.evaluate(() => sessionStorage.setItem("swaptrack.location", JSON.stringify({ id: "loc_TOLTO-02", code: "TOLTO-02", name: "Magazzino tolto", type: "asp_warehouse" })));
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    await scanManual(page, uniqueCode("U"), { withModel: true });
    await expect(page.getByTestId("scan-session-refused")).toBeVisible({ timeout: 30_000 });

    // Deactivated by the office (as users.ts deactivate writes it); the app reads its claims again.
    const now = Date.now();
    await emulatorSetClaims(uid, { role: "asp_warehouse", orgId: SEED.nord.orgId, active: false, disabledAt: now });
    await emulatorSetDoc(`users/${uid}`, { ...profile, active: false, disabledAt: new Date(now) });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByTestId("signin-deactivated-notice")).toHaveText(tr("gate.deactivated.partial"), { timeout: 60_000 });
  });
});
