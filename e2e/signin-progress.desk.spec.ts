import { test, expect } from "@playwright/test";
import { ACCOUNTS, PASSWORD, tr } from "./helpers";

// P-152: after «Accedi» the sign-in shows that it is going on («Accesso in corso…», a spinning wheel) until the app's
// first page, also while profile and settings are still on their way; after 4 s a line asks to wait. Before, the button
// was only greyed out and, after the sign-in, a plain "Loading" replaced it: with a slow server it looked stuck.
// The server is made slow (3 s per request) once the sign-in page is open. Read-only.
test.describe("Accesso: «Accesso in corso…» fino alla prima pagina (scrivania)", () => {
  test("con il server lento il segnale resta fino alla Home e dopo 4 s chiede di attendere", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/signin");
    await page.getByTestId("signin-email-input").fill(ACCOUNTS.clientOffice);
    await page.getByTestId("signin-password-input").fill(PASSWORD);
    await page.route((url) => url.pathname.includes("google.firestore"), async (r) => {
      await new Promise((ok) => setTimeout(ok, 3000));
      await r.continue().catch(() => undefined);
    });
    await page.getByTestId("signin-submit-button").click();
    const signal = page.getByText(tr("auth.signingIn"));
    await expect(signal).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("signing-in-slow")).toHaveText(tr("auth.signingInSlow"), { timeout: 10_000 });
    // Until the app's first page shows, the signal never goes away (no plain "Loading" in between).
    await expect.poll(async () => (await page.getByTestId("topbar").count()) > 0 || (await signal.count()) > 0, { timeout: 2_000 }).toBe(true);
    await expect(page.getByTestId("state-loading")).toHaveCount(0);
    // The first page is the app, or its privacy notice when it has not been accepted yet: the signal ends there.
    const privacy = page.getByTestId("privacy-accept-button");
    await expect(privacy.or(page.getByTestId("topbar"))).toBeVisible({ timeout: 60_000 });
    await expect(signal).toHaveCount(0);
    if (await privacy.isVisible()) await privacy.click();
    await expect(page.getByTestId("topbar")).toBeVisible({ timeout: 60_000 });
  });
});
