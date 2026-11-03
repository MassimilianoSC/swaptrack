import { test, expect, devices, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, tr } from "./helpers";

// Demo path 7 (DA_FARE P-6): installing the app (SPEC §7.4.5). Android and desktop Chrome/Edge offer installation
// through `beforeinstallprompt` (simulated here: headless Chromium never fires it): the "Install the app" button on the
// sign-in page and, inside the app, the entry at the bottom of the side menu call the browser prompt (D-59: no banner on
// the computer). iPhone has no prompt: the button and the menu entry show the Share → "Add to Home Screen" steps, and
// inside the app a reminder stays until the app is installed. Read-only.

// Fires a fake install prompt; `window.__installPrompted` tells whether the app called prompt().
async function offerInstall(page: Page): Promise<void> {
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    e.prompt = () => { (window as unknown as { __installPrompted: boolean }).__installPrompted = true; return Promise.resolve(); };
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
  });
}
const prompted = (page: Page) => page.evaluate(() => (window as unknown as { __installPrompted?: boolean }).__installPrompted === true);

test.describe("Percorso 7 — installazione dell'app", () => {
  test("computer: pulsante «Installa l'app» all'accesso e voce nel menu laterale (nessuna striscia), che aprono la richiesta del browser", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByTestId("install-app-button")).toHaveCount(0); // nothing offered yet: no button
    await offerInstall(page);
    const button = page.getByTestId("install-app-button");
    await expect(button).toContainText(tr("pwa.install"));
    await button.click();
    expect(await prompted(page)).toBe(true);
    await expect(button).toHaveCount(0); // a prompt is used once

    await signIn(page, ACCOUNTS.clientOffice);
    await expect(page.getByTestId("sidebar").getByTestId("nav-install")).toHaveCount(0); // nothing offered yet
    await offerInstall(page);
    const entry = page.getByTestId("sidebar").getByTestId("nav-install");
    await expect(entry).toContainText(tr("pwa.install"));
    await expect(page.getByTestId("install-banner")).toHaveCount(0); // D-59: never the banner on the computer
    await entry.click();
    expect(await prompted(page)).toBe(true);
    await expect(entry).toHaveCount(0);
  });

  test.describe("iPhone", () => {
    const iphone = devices["iPhone 13"];
    test.use({ userAgent: iphone.userAgent, viewport: iphone.viewport, deviceScaleFactor: iphone.deviceScaleFactor, isMobile: true, hasTouch: true });

    test("iPhone: il pulsante mostra i passi «Condividi → Aggiungi alla schermata Home»; nell'app resta il promemoria", async ({ page }) => {
      await page.goto("/signin");
      await page.getByTestId("install-app-ios-button").click();
      await expect(page.getByTestId("install-app-ios-steps")).toHaveText(tr("pwa.iosInstall"));

      await signIn(page, ACCOUNTS.aspTechnicianCentro);
      const hint = page.getByTestId("ios-install-hint");
      await expect(hint).toContainText(tr("pwa.iosInstall"));
      await page.getByTestId("ios-install-hint-close").click();
      await expect(hint).toHaveCount(0);
      // D-59: the side menu has the entry, which shows the same steps.
      await page.getByTestId("topbar-menu-button").click();
      await page.getByTestId("nav-install").click();
      await expect(page.getByTestId("nav-install-ios-steps")).toHaveText(tr("pwa.iosInstall"));
    });
  });
});
