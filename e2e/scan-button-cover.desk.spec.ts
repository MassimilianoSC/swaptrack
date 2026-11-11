import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, emulatorSetDoc } from "./helpers";
import { SEED } from "./seed";

// P-161: the floating "Scan" button of the ASP roles sits on the bottom right of the screen; the page keeps room under
// it. On a computer (from 1024 px) that room was lost and the button covered the last "Open" of a table (seen by the
// tester in Documents). Own documents of ASP Nord (E2E- numbers), written in the emulator: enough of them for the table
// to be longer than the side bar, so that the last row is at the end of the page (with a few rows the page scrolls for
// the side bar and the last row stays high, far from the button).
async function ownDocuments(n: number): Promise<void> {
  const now = new Date();
  for (let i = 0; i < n; i++) {
    await emulatorSetDoc(`documents/e2e-${uniqueCode("FAB").toLowerCase()}`, {
      kind: "ddt_in", number: uniqueCode("DDTF"), aspId: SEED.nord.orgId, locationId: `loc_${SEED.nord.warehouse}`, files: [],
      lines: [], linesSource: "manual", version: 1, status: "open", createdAt: now, updatedAt: now, history: [], duplicateOf: null, shipmentId: null,
    });
  }
}

// With the page scrolled to its end: where the last "Open" of the table and the button are, in the window.
async function atTheEnd(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/documents");
  const opens = page.locator("[data-testid^='documents-row-']");
  await expect(opens.nth(19)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("scan-fab")).toBeVisible();
  await opens.last().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  return opens.last().evaluate((el) => {
    const row = el.closest("tr")!.getBoundingClientRect();
    const fab = document.querySelector("[data-testid='scan-fab']")!.getBoundingClientRect();
    const end = document.documentElement.scrollHeight - (row.bottom + window.scrollY);
    return { scrolls: document.documentElement.scrollHeight > window.innerHeight, rowBottom: Math.round(row.bottom), fabTop: Math.round(fab.top), belowRow: Math.round(end) };
  });
}

test.describe("Pulsante «Leggi» e ultima riga di una tabella (scrivania)", () => {
  test("al computer, a pagina in fondo, l'ultima riga dei documenti finisce sopra «Leggi»", async ({ page }) => {
    test.setTimeout(180_000);
    await ownDocuments(20);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    const m = await atTheEnd(page, 1280, 500);
    // The page really scrolls and the last row is at its end (not passing by chance on a short page).
    expect(m.scrolls).toBe(true);
    expect(m.belowRow).toBeLessThan(200);
    expect(m.rowBottom).toBeLessThanOrEqual(m.fabTop);
  });

  test("sul telefono (390 px) l'ultima riga dei documenti resta sopra «Leggi»", async ({ page }) => {
    test.setTimeout(180_000);
    await ownDocuments(20);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    const m = await atTheEnd(page, 390, 700);
    expect(m.scrolls).toBe(true);
    expect(m.rowBottom).toBeLessThanOrEqual(m.fabTop);
  });
});
