import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr } from "./helpers";
import { SEED } from "./seed";

// Diagnostic, not a pass/fail test of the app (REGISTRO: probe of the offline cache after P-78). It measures, for the
// Nord warehouse worker on the phone: (1) sign-in → "updated" time of the site picker (the ASP's cache loaded, D-34);
// (2) a reading right after the sign-in → "Sent"; (3) a reading after "updated" → "Sent". Run it twice, with the
// full seed and with the small one, and compare: if (2) is far above (3) only with the full seed, the weight is the
// size of the cache, not the app's code. Only with E2E_DIAG=1, for example:
//   E2E_DIAG=1 node scripts/emulators.mjs --seed "yarn seed && yarn seed:full" --run "yarn e2e:only --project=diag"
//   E2E_DIAG=1 node scripts/emulators.mjs --seed "yarn seed" --run "yarn e2e:only --project=diag"
async function timeToSent(page: Page, code: string): Promise<number> {
  const t0 = Date.now();
  await scanManual(page, code);
  await expect(page.getByTestId("scan-today-row").filter({ hasText: code })).toContainText(tr("scan.sent"), { timeout: 180_000 });
  return Date.now() - t0;
}

test("tempi della cache offline dopo l'accesso (diagnostica)", async ({ page }) => {
  test.setTimeout(420_000);
  const signInAt = Date.now();
  await signIn(page, ACCOUNTS.aspWarehouseNord);
  await pickLocation(page, SEED.nord.warehouse);
  await page.goto("/scan?mode=arrive_at_warehouse");
  await page.getByTestId("scan-flow-select").selectOption("new");
  const beforeReady = await timeToSent(page, uniqueCode("T"));

  await page.goto("/");
  const info = page.getByTestId("site-picker-offline-info");
  await expect.poll(async () => Number(await info.getAttribute("data-updated-at") ?? 0), { timeout: 300_000 }).toBeGreaterThan(signInAt);
  const cacheLoaded = Number(await info.getAttribute("data-updated-at")) - signInAt;

  await page.goto("/scan?mode=arrive_at_warehouse");
  await page.getByTestId("scan-flow-select").selectOption("new");
  const afterReady = await timeToSent(page, uniqueCode("T"));

  const line = `CACHE-TIMING cache=${cacheLoaded}ms readingRightAfterSignIn=${beforeReady}ms readingAfterUpdated=${afterReady}ms`;
  console.log(line);
  test.info().annotations.push({ type: "timing", description: line });
});
