import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, tr } from "./helpers";

// P-135: the complete guide inside the app. The Guide page has "Open the complete guide", which opens /guida.html (a
// copy of GUIDA.html made at build; served by the dev server here) at the section of the role, in a new tab so that
// closing it goes back to the app. Offline opening comes from the service worker, which the dev server does not run:
// it is checked on the build (dist/sw.js precaches guida.html). Read-only.
test.describe("Guida completa nell'app (scrivania)", () => {
  test("la pagina Guida apre /guida.html alla sezione del ruolo", async ({ page, context }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.clientOffice);
    await page.goto("/guide");
    const open = page.getByTestId("guide-full");
    await expect(open).toHaveText(tr("guidePage.openFull"));
    await expect(open).toHaveAttribute("href", "/guida.html#ufficio-cliente");
    await expect(open).toHaveAttribute("target", "_blank");

    const [guide] = await Promise.all([context.waitForEvent("page"), open.click()]);
    await guide.waitForLoadState();
    await expect(guide).toHaveTitle("Guida di SwapTrack");
    await expect(guide.getByText(/App descritta: commit/).first()).toBeVisible();
    await expect(guide.locator("#ufficio-cliente")).toBeAttached();
    await expect(guide.locator("#per-tutti")).toBeAttached();
    // The app stays where it was, in its own tab.
    await expect(page.getByTestId("guide-steps")).toBeVisible();
  });
});
