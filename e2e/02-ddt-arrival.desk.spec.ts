import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr, collectRows } from "./helpers";
import { SEED } from "./seed";

// Demo path 2 (DA_FARE P-6), DDT part (SPEC §12.2, REGISTRO D-15 / P-24): arrival of new material at the ASP
// warehouse with a transport document. The warehouse worker creates the DDT with three serial lines, chooses it on
// the scanning screen (never pre-selected), scans two of its pieces and one outside it: the live box says
// 2 arrived, 1 missing, 1 unexpected; marking the DDT "checked" gives the same numbers from the server and raises
// the ddt_in_difference alert (SPEC §11.3, §11.4). Own document and pieces (E2E- codes), Nord warehouse worker.
test.describe("Percorso 2 — arrivo di materiale nuovo con DDT (scrivania)", () => {
  test("DDT scelto in lettura, tre letture di cui una fuori DDT: 2 arrivati, 1 mancante, 1 inatteso, in diretta e dal server", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    const codes = [uniqueCode("D"), uniqueCode("D"), uniqueCode("D")];
    const outside = uniqueCode("X");
    const ddtNumber = uniqueCode("DDT");

    // 1. The DDT, typed next to the (absent) file: three serial lines.
    await page.goto("/documents/new");
    await expect(page.getByTestId("document-kind")).toHaveValue("ddt_in");
    await expect(page.getByTestId("document-kind").locator('option[value="bom"]')).toHaveCount(0); // §3.3: BOM not for the warehouse (P-65)
    await page.getByTestId("document-number").fill(ddtNumber);
    await page.getByTestId("document-location").selectOption(`loc_${SEED.nord.warehouse}`);
    await page.getByTestId("document-lines").fill(codes.join("\n"));
    await page.getByTestId("document-save-new").click();
    await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/);
    const docId = page.url().split("/").pop()!;

    // 2. On the scanning screen the open DDTs of this warehouse are offered, none chosen by itself.
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    const ddtSelect = page.getByTestId("scan-ddt-select");
    await expect(ddtSelect).toHaveValue("");
    await expect(page.getByTestId("scan-ddt-section")).toHaveCount(0);
    await expect(ddtSelect.locator(`option[value="${docId}"]`)).toHaveText(new RegExp(ddtNumber));
    await ddtSelect.selectOption(docId);

    // 3. Two pieces of the DDT and one outside it (burst, a model for each): the live comparison on the device.
    await scanManual(page, codes[0], { withModel: true });
    await scanManual(page, codes[1], { withModel: true });
    await scanManual(page, outside, { withModel: true });
    await expect(page.getByTestId("scan-ddt-arrived")).toHaveText("2");
    await expect(page.getByTestId("scan-ddt-missing")).toHaveText("1");
    await expect(page.getByTestId("scan-ddt-unexpected")).toHaveText("1");
    await expect(page.getByTestId("scan-ddt-unexpected-list")).toContainText(outside);
    for (const c of [...codes.slice(0, 2), outside]) await expect(page.getByTestId("scan-today-row").filter({ hasText: c })).toContainText(tr("scan.sent"), { timeout: 60_000 });

    // 4. On the document: the server's comparison follows the trigger (the pieces exist once processed), then "checked".
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
    await expect(page.getByTestId("document-unexpected")).toHaveText("1");
    await expect(page.getByTestId("document-mark")).toHaveCount(0); // already checked

    // 4. The alert of the DDT, linked to the document, in the inbox.
    await page.goto("/alerts");
    const rows = await collectRows(page, "alerts-table");
    const row = rows.find((r) => r.hrefs.includes(`/documents/${docId}`));
    expect(row, "ddt_in_difference alert").toBeDefined();
    expect(row!.text).toContain(tr("alerts.kinds.ddt_in_difference"));
  });
});
