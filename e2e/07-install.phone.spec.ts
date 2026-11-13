import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, tr } from "./helpers";

// D-59 (P-129): on the phone the install banner stays while the app is not installed, with "Later", which hides it for
// 7 days on this device; the entry in the side menu stays. The browser prompt is simulated (headless Chromium never
// fires `beforeinstallprompt`) and fired again after the reload, as the browser does. Read-only.
async function offerInstall(page: Page): Promise<void> {
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    e.prompt = () => Promise.resolve();
    e.userChoice = Promise.resolve({ outcome: "dismissed" });
    window.dispatchEvent(e);
  });
}

test.describe("Installazione dell'app (telefono)", () => {
  test("striscia con «Più tardi»: dopo il ricaricamento la striscia non c'è più, la voce nel menu sì", async ({ page }) => {
    await signIn(page, ACCOUNTS.aspTechnicianCentro);
    await offerInstall(page);
    const banner = page.getByTestId("install-banner");
    // P-209: the app's name comes from Settings › Brand ("SwapTrack" in the seed).
    await expect(banner).toContainText(tr("pwa.installHint").replace("{{name}}", "SwapTrack"));
    await banner.getByTestId("install-banner-later").click();
    await expect(banner).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("topbar")).toBeVisible({ timeout: 30_000 });
    await offerInstall(page);
    await page.getByTestId("topbar-menu-button").click();
    await expect(page.getByRole("dialog").getByTestId("nav-install")).toContainText(tr("pwa.install"));
    await expect(banner).toHaveCount(0);
  });
});
