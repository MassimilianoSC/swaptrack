import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, PASSWORD } from "./helpers";

// Diagnostic (P-122), not a pass/fail test: from "Sign in", how long until the site picker shows its list (the first
// screen of a field user) and until the ASP's offline cache is loaded ("updated", D-34), on a normal network and on a
// weak signal (Chrome's network emulation, turned on after the app is loaded: on a phone the installed app is cached).
// Only with E2E_DIAG=1, for example:
//   E2E_DIAG=1 node scripts/emulators.mjs --seed "yarn seed && yarn seed:full" --run "yarn e2e:only site-list-timing --project=diag --workers=1"
async function measure(page: Page, email: string, slow: boolean): Promise<{ list: number; cache: number }> {
  await page.goto("/signin");
  await page.getByTestId("signin-email-input").fill(email);
  await page.getByTestId("signin-password-input").fill(PASSWORD);
  if (slow) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 25 * 1024 });
  }
  let t0 = Date.now();
  await page.getByTestId("signin-submit-button").click();
  const privacy = page.getByTestId("privacy-accept-button");
  const item = page.getByTestId("site-picker-item").first();
  await expect(privacy.or(item)).toBeVisible({ timeout: 600_000 });
  if (await privacy.isVisible()) { await privacy.click(); t0 = Date.now(); }
  await expect(item).toBeVisible({ timeout: 600_000 });
  const list = Date.now() - t0;
  const info = page.getByTestId("site-picker-offline-info");
  await expect.poll(async () => Number(await info.getAttribute("data-updated-at") ?? 0), { timeout: 600_000 }).toBeGreaterThan(t0);
  return { list, cache: Number(await info.getAttribute("data-updated-at")) - t0 };
}

for (const [net, slow] of [["normale", false], ["lenta", true]] as const) {
  for (const [who, email] of [["tecnico", ACCOUNTS.aspTechnicianNord], ["magazzino", ACCOUNTS.aspWarehouseNord]] as const) {
    test(`elenco dei luoghi dopo l'accesso: ${who}, rete ${net} (diagnostica)`, async ({ page }) => {
      test.setTimeout(1_300_000);
      const { list, cache } = await measure(page, email, slow);
      const line = `SITE-LIST-TIMING ${who} rete=${net} list=${list}ms cache=${cache}ms`;
      console.log(line);
      test.info().annotations.push({ type: "timing", description: line });
    });
  }
}
