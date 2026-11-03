import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, emulatorSetDoc } from "./helpers";
import { SEED } from "./seed";

// P-127: an action on one row of a table makes only that row wait (seen on the committente's phone: "Mark seen" on one
// alert disabled the buttons of all of them). Two alerts of the test itself; the call is made slow on purpose.
test.describe("Azioni per riga (scrivania)", () => {
  test("«Segna visto» su un avviso: aspetta solo quella riga, le altre restano attive", async ({ page }) => {
    test.setTimeout(120_000);
    const [a, b] = [`e2e-${uniqueCode("RA").toLowerCase()}`, `e2e-${uniqueCode("RA").toLowerCase()}`];
    const now = new Date();
    for (const id of [a, b]) {
      await emulatorSetDoc(`alerts/${id}`, {
        kind: "stale_material", aspId: SEED.nord.orgId, locationId: `loc_${SEED.nord.warehouse}`, documentId: null, shipmentId: null,
        detail: {}, count: 1, flow: "new", createdAt: now, updatedAt: now, seenAt: null, closedAt: null, closedNote: null,
      });
    }
    await signIn(page, ACCOUNTS.aspAdminNord);
    await page.goto("/alerts");
    // The alerts router answers 3 s late.
    await page.route((url) => url.pathname.endsWith("/alerts"), async (r) => {
      if (r.request().method() === "POST") await new Promise((ok) => setTimeout(ok, 3000));
      await r.continue().catch(() => undefined);
    });
    await page.getByTestId(`alerts-seen-${a}`).click();
    await expect(page.getByTestId(`alerts-seen-${a}`)).toBeDisabled();
    await expect(page.getByTestId(`alerts-seen-${b}`)).toBeEnabled();
    await expect(page.getByTestId(`alerts-close-${b}`)).toBeEnabled();
  });
});
