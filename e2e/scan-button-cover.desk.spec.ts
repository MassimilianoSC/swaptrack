import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, emulatorSetDoc } from "./helpers";
import { SEED } from "./seed";

// P-161: the floating "Scan" button of the ASP roles sits on the bottom right of the screen; the page keeps room under
// it. On a computer (from 1024 px) that room was lost and the button covered the last "Open" of a table (seen by the
// tester in Documents). Own documents of ASP Nord (E2E- numbers), written in the emulator.
async function ownDocuments(n: number): Promise<void> {
  const now = new Date();
  for (let i = 0; i < n; i++) {
    await emulatorSetDoc(`documents/e2e-${uniqueCode("FAB").toLowerCase()}`, {
      kind: "ddt_in", number: uniqueCode("DDTF"), aspId: SEED.nord.orgId, locationId: `loc_${SEED.nord.warehouse}`, files: [],
      lines: [], linesSource: "manual", version: 1, status: "open", createdAt: now, updatedAt: now, history: [], duplicateOf: null, shipmentId: null,
    });
  }
}
async function lastOpenIsFree(page: Page, width: number): Promise<boolean> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/documents");
  const opens = page.locator("[data-testid^='documents-row-']");
  await expect(opens.first()).toBeVisible();
  await expect(page.getByTestId("scan-fab")).toBeVisible();
  // The window as tall as the page: the last row is as low as it can be, at the end of the page.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height });
  const last = opens.last();
  await last.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  return last.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && el.contains(hit);
  });
}

test.describe("Pulsante «Leggi» e ultima riga di una tabella (scrivania)", () => {
  test("al computer l'ultimo «Apri» dei documenti non è coperto da «Leggi»", async ({ page }) => {
    test.setTimeout(120_000);
    await ownDocuments(3);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    expect(await lastOpenIsFree(page, 1280)).toBe(true);
  });

  test("sul telefono (390 px) l'ultimo «Apri» dei documenti resta libero", async ({ page }) => {
    test.setTimeout(120_000);
    await ownDocuments(3);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    expect(await lastOpenIsFree(page, 390)).toBe(true);
  });
});
