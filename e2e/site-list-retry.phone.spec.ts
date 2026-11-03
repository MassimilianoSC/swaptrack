import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn } from "./helpers";

// P-125 (criteria 3 and 2): when the server does not answer, the site list is the phone's copy and says so (the
// "updated" time does not move), and it is asked again by itself until the server answers: no screen stays stale.
// Firestore is "unreachable" by refusing its requests, then reachable again.
const firestore = (url: URL) => url.pathname.includes("google.firestore");
const updatedAt = async (page: Page) => Number(await page.getByTestId("site-picker-offline-info").getAttribute("data-updated-at") ?? 0);

test.describe("Elenco dei luoghi senza risposta del server (telefono)", () => {
  test("server irraggiungibile: «non ancora aggiornato», poi si aggiorna da solo quando torna", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, ACCOUNTS.aspTechnicianNord);
    await expect(page.getByTestId("site-picker-item").first()).toBeVisible({ timeout: 60_000 });

    await page.route(firestore, (r) => r.abort());
    await page.reload();
    await expect(page.getByTestId("site-picker-stale")).toBeVisible({ timeout: 30_000 });
    const before = await updatedAt(page);

    await page.unroute(firestore);
    await expect(page.getByTestId("site-picker-stale")).toBeHidden({ timeout: 60_000 });
    await expect(page.getByTestId("site-picker-item").first()).toBeVisible();
    expect(await updatedAt(page)).toBeGreaterThanOrEqual(before);
  });
});
