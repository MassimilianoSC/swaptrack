import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, emulatorSetDoc } from "./helpers";
import { SEED } from "./seed";

// P-162 (modification 2b of the tester): a click anywhere on a row of the desk lists opens its page, like the "Open" link
// that stays. Not on a control of the row (buttons, links), nor at the end of a text selection. Ctrl-click and the
// middle button open a new tab; the row is reached with Tab and opened with Enter. Own data of ASP Nord, written in the
// emulator. Ids start with "0000-" so that the lists without an order of their own (to complete, anomalies: by id) show
// them on the first page; the others are ordered by date, newest first.
type Own = { doc: string; docNumber: string; shipment: string; item: string; anomaly: string; anomalyNoItem: string; alert: string; alertNoObject: string };

async function ownData(): Promise<Own> {
  const tag = uniqueCode("RC").toLowerCase();
  const id = (what: string) => `0000-${tag}-${what}`;
  const own: Own = { doc: id("doc"), docNumber: uniqueCode("DDTRC"), shipment: id("shp"), item: id("itm"), anomaly: id("anm"), anomalyNoItem: id("anm0"), alert: id("alr"), alertNoObject: id("alr0") };
  const now = new Date();
  const nord = SEED.nord.orgId, warehouse = `loc_${SEED.nord.warehouse}`;
  await emulatorSetDoc(`documents/${own.doc}`, {
    kind: "ddt_in", number: own.docNumber, aspId: nord, locationId: warehouse, files: [], lines: [], linesSource: "manual",
    version: 1, status: "open", createdAt: now, updatedAt: now, history: [], duplicateOf: null, shipmentId: null,
  });
  await emulatorSetDoc(`shipments/${own.shipment}`, {
    kind: "transfer", status: "draft", fromAspId: nord, toAspId: nord, fromLocationId: warehouse, toLocationId: warehouse,
    itemCount: 0, ddtNumber: uniqueCode("DDTRC"), createdAt: now, updatedAt: now,
  });
  await emulatorSetDoc(`items/${own.item}`, {
    status: "received_at_asp", flow: "new", currentAspId: nord, pendingAspId: null, currentLocationId: warehouse, model: null, modelId: null,
    materialCode: uniqueCode("MRC"), needsModel: true, lastEventId: `${tag}-evt`, lastScannedAt: now, createdAt: now,
  });
  for (const [anomaly, itemId] of [[own.anomaly, own.item], [own.anomalyNoItem, null]] as const) {
    await emulatorSetDoc(`anomalies/${anomaly}`, { type: "location_inactive", aspId: nord, locationId: warehouse, itemId, eventId: null, openedAt: now, resolution: null });
  }
  for (const [alert, documentId, locationId] of [[own.alert, own.doc, warehouse], [own.alertNoObject, null, null]] as const) {
    await emulatorSetDoc(`alerts/${alert}`, {
      kind: "stale_material", aspId: nord, locationId, documentId, shipmentId: null, detail: {}, count: 1, flow: "new",
      createdAt: now, updatedAt: now, seenAt: null, closedAt: null, closedNote: null,
    });
  }
  return own;
}

// The row of a table that holds the element with this test id.
const rowWith = (page: Page, table: string, inner: string) => page.getByTestId(`${table}-row`).filter({ has: page.getByTestId(inner) });
// The second cell: never the link of the row in these lists (the model of a piece is the first).
const plainCell = (page: Page, table: string, inner: string) => rowWith(page, table, inner).locator("td").nth(1);

test.describe("Riga cliccabile negli elenchi (scrivania)", () => {
  test("clic sulla riga apre il dettaglio: Documenti, Spedizioni, Pezzi, Da completare, Anomalie, Avvisi", async ({ page }) => {
    test.setTimeout(240_000);
    const own = await ownData();
    await signIn(page, ACCOUNTS.aspAdminNord);
    const cases: Array<[string, string, string, RegExp]> = [
      ["/documents", "documents-table", `documents-row-${own.doc}`, new RegExp(`/documents/${own.doc}$`)],
      ["/shipments", "shipments-table", `shipments-row-${own.shipment}`, new RegExp(`/shipments/${own.shipment}$`)],
      ["/items", "items-table", `items-row-link-${own.item}`, new RegExp(`/items/${own.item}$`)],
      ["/items/to-complete", "to-complete-table", `to-complete-row-${own.item}`, new RegExp(`/items/${own.item}$`)],
      ["/anomalies", "anomalies-table", `anomalies-row-item-${own.anomaly}`, new RegExp(`/items/${own.item}$`)],
      ["/alerts", "alerts-table", `alerts-seen-${own.alert}`, new RegExp(`/documents/${own.doc}$`)],
    ];
    for (const [list, table, inner, detail] of cases) {
      await page.goto(list);
      const cell = plainCell(page, table, inner);
      await expect(cell).toBeVisible({ timeout: 45_000 });
      expect(await cell.evaluate((el) => getComputedStyle(el.closest("tr")!).cursor), `${list}: hand pointer`).toBe("pointer");
      await cell.click();
      await expect(page, `${list}: the row opens its page`).toHaveURL(detail);
    }
  });

  test("pulsanti, link e testo selezionato non aprono la riga; una riga senza pagina resta ferma; «Apri» resta", async ({ page }) => {
    test.setTimeout(240_000);
    const own = await ownData();
    await signIn(page, ACCOUNTS.aspAdminNord);

    // A button of the row does its own thing only: "Mark seen", then "Close" (its window, cancelled).
    await page.goto("/alerts");
    const seen = page.getByTestId(`alerts-seen-${own.alert}`);
    await expect(seen).toBeVisible({ timeout: 45_000 });
    await seen.click();
    await expect(seen).toBeDisabled({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/alerts$/);
    await page.getByTestId(`alerts-close-${own.alert}`).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/alerts$/);
    // An alert with no page of its object: a plain row.
    const plainAlert = rowWith(page, "alerts-table", `alerts-seen-${own.alertNoObject}`);
    await expect(plainAlert).not.toHaveAttribute("data-href");
    await plainAlert.locator("td").nth(1).click();
    await expect(page).toHaveURL(/\/alerts$/);
    // The rest of the same row opens the document.
    await plainCell(page, "alerts-table", `alerts-seen-${own.alert}`).click();
    await expect(page).toHaveURL(new RegExp(`/documents/${own.doc}$`));

    // An anomaly without a piece: no page, a plain row (no hand, no opening).
    await page.goto("/anomalies");
    const noItem = page.getByTestId("anomalies-table-row").filter({ hasNot: page.locator("[data-testid^='anomalies-row-item-']") }).first();
    await expect(rowWith(page, "anomalies-table", `anomalies-row-item-${own.anomaly}`)).toBeVisible({ timeout: 45_000 });
    await expect(noItem).toBeVisible();
    await expect(noItem).not.toHaveAttribute("data-href");
    expect(await noItem.evaluate((el) => getComputedStyle(el).cursor)).not.toBe("pointer");
    await noItem.locator("td").nth(1).click();
    await expect(page).toHaveURL(/\/anomalies$/);

    // Selecting the number of a document with the mouse (to copy it) does not open it.
    await page.goto("/documents");
    const number = plainCell(page, "documents-table", `documents-row-${own.doc}`);
    await expect(number).toBeVisible({ timeout: 45_000 });
    const box = (await number.boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toContain(own.docNumber.slice(0, 6));
    await expect(page).toHaveURL(/\/documents$/);

    // «Apri» stays and opens the document.
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await page.getByTestId(`documents-row-${own.doc}`).click();
    await expect(page).toHaveURL(new RegExp(`/documents/${own.doc}$`));
    // And the rest of the row opens it too.
    await page.goto("/documents");
    await plainCell(page, "documents-table", `documents-row-${own.doc}`).click();
    await expect(page).toHaveURL(new RegExp(`/documents/${own.doc}$`));
  });

  test("Ctrl+clic e clic centrale aprono una scheda nuova; la pagina dell'elenco resta", async ({ page, context }) => {
    test.setTimeout(240_000);
    const own = await ownData();
    await signIn(page, ACCOUNTS.aspAdminNord);
    await page.goto("/documents");
    const cell = plainCell(page, "documents-table", `documents-row-${own.doc}`);
    await expect(cell).toBeVisible({ timeout: 45_000 });
    const clicks: Array<() => Promise<void>> = [() => cell.click({ modifiers: ["Control"] }), () => cell.click({ button: "middle" })];
    for (const click of clicks) {
      const opened = context.waitForEvent("page");
      await click();
      const tab = await opened;
      await expect(tab).toHaveURL(new RegExp(`/documents/${own.doc}$`));
      await tab.close();
      await expect(page).toHaveURL(/\/documents$/);
    }
  });

  test("Tab porta sulla riga con il bordo del focus visibile; Invio la apre", async ({ page }) => {
    test.setTimeout(240_000);
    await ownData();
    await signIn(page, ACCOUNTS.aspAdminNord);
    await page.goto("/documents");
    // The last heading of the table, then Tab: the first row (the newest document).
    const lastHeading = page.getByTestId("documents-table-sort-o");
    await expect(page.getByTestId("documents-table-row").first()).toBeVisible({ timeout: 45_000 });
    await lastHeading.focus();
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      return { row: el.dataset.testid, href: el.dataset.href ?? null, visible: el.matches(":focus-visible"), outline: getComputedStyle(el).outlineStyle };
    });
    expect(focused.row).toBe("documents-table-row");
    expect(focused.href).toMatch(/^\/documents\//);
    expect(focused.visible).toBe(true);
    expect(focused.outline).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${focused.href}$`));
  });
});
