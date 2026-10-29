import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr, collectRows } from "./helpers";
import { SEED } from "./seed";

// Demo path 2 (DA_FARE P-6), DDT part: arrival of new material at the ASP warehouse with a transport document.
// The DDT is created by the warehouse worker with three serial lines; two pieces are scanned (each with a model);
// marking the DDT "checked" shows arrived / missing and raises the ddt_in_difference alert (SPEC §11.3, §11.4).
// Writes its own document and pieces (E2E- codes) as the Nord warehouse worker.
test.describe("Percorso 2 — arrivo di materiale nuovo con DDT (scrivania)", () => {
  test("DDT con tre righe, due letture, «controllato»: arrivati 2, mancanti 1, avviso", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    const codes = [uniqueCode("D"), uniqueCode("D"), uniqueCode("D")];
    const ddtNumber = uniqueCode("DDT");

    // 1. The DDT, typed next to the (absent) file: three serial lines.
    await page.goto("/documents/new");
    await expect(page.getByTestId("document-kind")).toHaveValue("ddt_in");
    await page.getByTestId("document-number").fill(ddtNumber);
    await page.getByTestId("document-location").selectOption(`loc_${SEED.nord.warehouse}`);
    await page.getByTestId("document-lines").fill(codes.join("\n"));
    await page.getByTestId("document-save-new").click();
    await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/);
    const docId = page.url().split("/").pop()!;

    // 2. Two of the three pieces arrive (burst, model chosen for each).
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    await scanManual(page, codes[0], { withModel: true });
    await scanManual(page, codes[1], { withModel: true });
    for (const c of codes.slice(0, 2)) await expect(page.getByTestId("scan-today-row").filter({ hasText: c })).toContainText(tr("scan.sent"), { timeout: 60_000 });

    // 3. On the document: the comparison follows the trigger (the pieces exist once processed), then "checked".
    await page.goto(`/documents/${docId}`);
    await expect.poll(async () => {
      await page.getByTestId("document-compare").click();
      await expect(page.getByTestId("document-arrived")).toBeVisible();
      return page.getByTestId("document-arrived").textContent();
    }, { timeout: 60_000 }).toBe("2");
    await page.getByTestId("document-mark").click();
    await expect(page.getByText(tr("documents.marked")).first()).toBeVisible();
    await expect(page.getByTestId("document-arrived")).toHaveText("2");
    await expect(page.getByTestId("document-missing")).toHaveText("1");
    await expect(page.getByTestId("document-unexpected")).toHaveText("0");
    await expect(page.getByTestId("document-mark")).toHaveCount(0); // already checked

    // 4. The alert of the DDT, linked to the document, in the inbox.
    await page.goto("/alerts");
    const rows = await collectRows(page, "alerts-table");
    const row = rows.find((r) => r.hrefs.includes(`/documents/${docId}`));
    expect(row, "ddt_in_difference alert").toBeDefined();
    expect(row!.text).toContain(tr("alerts.kinds.ddt_in_difference"));
  });
});
