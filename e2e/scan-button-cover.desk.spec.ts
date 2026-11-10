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
// What is under the middle of the last "Open" at the end of the page: "free", or the element that covers it.
async function underLastOpen(page: Page, width: number): Promise<string> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/documents");
  const opens = page.locator("[data-testid^='documents-row-']");
  await expect(opens.nth(2)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("scan-fab")).toBeVisible();
  // The window as tall as the page (measured in a low window: the page fills at least the window), so the last row is
  // as low as it can be, at the end of the page, where the button is.
  await page.setViewportSize({ width, height: 300 });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height });
  const last = opens.last();
  await last.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  return last.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit && el.contains(hit)) return "free";
    return hit ? `${hit.tagName} ${hit.getAttribute("data-testid") ?? ""} ${(hit.textContent ?? "").trim().slice(0, 40)}` : "nothing (off screen)";
  });
}

test.describe("Pulsante «Leggi» e ultima riga di una tabella (scrivania)", () => {
  test("al computer l'ultimo «Apri» dei documenti non è coperto da «Leggi»", async ({ page }) => {
    test.setTimeout(120_000);
    await ownDocuments(3);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    expect(await underLastOpen(page, 1280)).toBe("free");
  });

  test("sul telefono (390 px) l'ultimo «Apri» dei documenti resta libero", async ({ page }) => {
    test.setTimeout(120_000);
    await ownDocuments(3);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    expect(await underLastOpen(page, 390)).toBe("free");
  });
});
