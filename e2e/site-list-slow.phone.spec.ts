import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, PASSWORD } from "./helpers";

// P-122 (criterion 3): on a weak signal the first screen of a field user (the site list) appears in seconds, not after
// the whole offline cache (measured before the fix: about 190 s, the same time as the cache). The app itself is loaded
// on a normal network (on a phone the installed app is cached by the service worker; the dev server would send
// hundreds of files), then the signal drops at "Sign in". Returns the milliseconds from "Sign in" (or from accepting
// the privacy notice, when it shows) to the first site of the list.
export async function siteListOnWeakSignal(page: Page, email: string): Promise<number> {
  await page.goto("/signin");
  await page.getByTestId("signin-email-input").fill(email);
  await page.getByTestId("signin-password-input").fill(PASSWORD);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  // About a weak 3G signal: 400 ms of latency, 50 KB/s down, 25 KB/s up.
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 25 * 1024 });
  let t0 = Date.now();
  await page.getByTestId("signin-submit-button").click();
  const privacy = page.getByTestId("privacy-accept-button");
  const list = page.getByTestId("site-picker-item").first();
  await expect(privacy.or(list)).toBeVisible({ timeout: 400_000 });
  if (await privacy.isVisible()) { await privacy.click(); t0 = Date.now(); }
  await expect(list).toBeVisible({ timeout: 400_000 });
  return Date.now() - t0;
}

test.describe("Elenco dei luoghi con poco segnale (telefono)", () => {
  test("tecnico, rete lenta: l'elenco dei siti compare entro 45 secondi dall'accesso", async ({ page }) => {
    test.setTimeout(900_000);
    const ms = await siteListOnWeakSignal(page, ACCOUNTS.aspTechnicianNord);
    console.log(`SITE-LIST-SLOW list=${ms}ms`);
    expect(ms).toBeLessThan(45_000);
  });
});
