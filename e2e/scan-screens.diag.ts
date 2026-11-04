import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode } from "./helpers";
import { SEED } from "./seed";

// Diagnostic, not a pass/fail test of the app: pictures and measured positions of the scanning screen on a 390×844
// phone, for the talk with the committente about a crowded screen (REGISTRO, 04/11). Three cases: Remove (technician,
// site with a BOM), Arrival with a DDT, Arrival of removed material sorted in the same pass. For each: the first
// screen as the worker sees it, the whole page, and a JSON with the box of every control. Written to
// swaptrack-guida/scan-oggi/ (ignored by git) or to E2E_SHOTS. Only with E2E_DIAG=1 and the full seed:
//   E2E_DIAG=1 node scripts/emulators.mjs --seed "yarn seed && yarn seed:full" --run "yarn e2e:only scan-screens --project=diag"
const OUT = process.env.E2E_SHOTS ?? join(process.cwd(), "swaptrack-guida", "scan-oggi");

test.use({ viewport: { width: 390, height: 844 } });

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(1500); // toasts and the camera label settle
  await page.screenshot({ path: join(OUT, `${name}-schermo.png`) });
  await page.screenshot({ path: join(OUT, `${name}-pagina-intera.png`), fullPage: true });
  const boxes = await page.evaluate(() => {
    const out: Array<{ testid: string; top: number; bottom: number; height: number; inFirstScreen: boolean }> = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-testid]"))) {
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.width === 0) continue;
      const top = Math.round(r.top + window.scrollY);
      out.push({ testid: el.dataset.testid!, top, bottom: Math.round(top + r.height), height: Math.round(r.height), inFirstScreen: top + r.height <= window.innerHeight });
    }
    return { viewport: { width: window.innerWidth, height: window.innerHeight }, pageHeight: document.documentElement.scrollHeight, boxes: out };
  });
  writeFileSync(join(OUT, `${name}-misure.json`), JSON.stringify(boxes, null, 2));
}

test("schermata di lettura su 390×844: Smonta, Arrivo con DDT, Arrivo smontato con smistamento (diagnostica)", async ({ browser }) => {
  test.setTimeout(420_000);
  const { baseURL, locale } = test.info().project.use;
  const fresh = async () => (await browser.newContext({ baseURL, locale, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();

  // 1. Remove at a site with a BOM, after one reading (single reading: "Read next" is shown).
  const tech = await fresh();
  await signIn(tech, ACCOUNTS.aspTechnicianNord);
  await pickLocation(tech, SEED.nord.site);
  await tech.goto("/scan?mode=remove_at_site");
  await expect(tech.getByTestId("scan-video")).toBeVisible();
  await scanManual(tech, uniqueCode("V"));
  await tech.evaluate(() => window.scrollTo(0, 0));
  await shoot(tech, "1-smonta");
  await tech.context().close();

  // 2. Arrival of new material with the first open DDT of the warehouse, after one reading.
  const wh = await fresh();
  await signIn(wh, ACCOUNTS.aspWarehouseNord);
  await pickLocation(wh, SEED.nord.warehouse);
  await wh.goto("/scan?mode=arrive_at_warehouse");
  const ddt = wh.getByTestId("scan-ddt-select");
  await expect(ddt.locator("option").nth(1)).toBeAttached({ timeout: 60_000 });
  await ddt.selectOption({ index: 1 });
  await expect(wh.getByTestId("scan-ddt-section")).toBeVisible();
  await scanManual(wh, uniqueCode("V"));
  await wh.evaluate(() => window.scrollTo(0, 0));
  await shoot(wh, "2-arrivo-con-ddt");

  // 3. Arrival of removed material with "Sort in the same pass" ticked, before the first reading.
  await wh.goto("/scan?mode=arrive_at_warehouse");
  await wh.getByTestId("scan-flow-select").selectOption("removed");
  await wh.getByTestId("scan-sort-now").check();
  await wh.evaluate(() => window.scrollTo(0, 0));
  await shoot(wh, "3-arrivo-smontato-smista");
  await wh.context().close();
});
