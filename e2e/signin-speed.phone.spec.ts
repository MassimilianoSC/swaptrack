import { test, expect } from "@playwright/test";
import { ACCOUNTS, PASSWORD } from "./helpers";

// P-85 (criterion 3): after the sign-in the app opens within seconds, also for the user with the biggest offline
// cache (the Nord warehouse worker, full seed). Before, the screen stayed on "Loading" for minutes: the listeners of
// the session documents (profile, settings, privacy notice) were queued behind thousands of documents of the cache.
test.describe("Accesso — la schermata principale si apre subito (telefono)", () => {
  test("magazziniere Nord: schermata principale (o informativa) entro 10 secondi dall'accesso", async ({ page }) => {
    await page.goto("/signin");
    await page.getByTestId("signin-email-input").fill(ACCOUNTS.aspWarehouseNord);
    await page.getByTestId("signin-password-input").fill(PASSWORD);
    await page.getByTestId("signin-submit-button").click();
    const privacy = page.getByTestId("privacy-accept-button");
    const topbar = page.getByTestId("topbar");
    await expect(privacy.or(topbar)).toBeVisible({ timeout: 10_000 });
    if (await privacy.isVisible()) {
      await privacy.click();
      await expect(topbar).toBeVisible({ timeout: 10_000 });
    }
    await expect(page.getByTestId("site-picker-search")).toBeVisible({ timeout: 10_000 });
  });
});
