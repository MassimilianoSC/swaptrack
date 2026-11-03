import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { ACCOUNTS, signIn, uniqueCode, tr } from "./helpers";
import { SEED } from "./seed";

// P-128 (criteria 2 and 3): with a slow network the saved column mapping arrives after the user has chosen the
// columns: it must never replace them (before: the choice went back to the saved one, or to "—", and the lines count
// was wrong). Own documents; the saved mapping of the warehouse is made by the test itself (column "Codice").
async function xlsx(rows: string[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("DDT");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
async function newDdt(page: Page): Promise<void> {
  await page.goto("/documents/new");
  await page.getByTestId("document-number").fill(uniqueCode("DDTS"));
  await page.getByTestId("document-location").selectOption(`loc_${SEED.nord.warehouse}`);
}
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

test.describe("Scelta delle colonne dell'Excel con la rete lenta (scrivania)", () => {
  test("le colonne scelte dall'utente restano quando la scelta salvata arriva dopo", async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    // 1. A saved mapping: serial in the column "Codice".
    await newDdt(page);
    await page.getByTestId("document-files-input").setInputFiles({ name: "a.xlsx", mimeType: XLSX, buffer: await xlsx([["Codice", "Seriale"], [uniqueCode("S"), uniqueCode("S")]]) });
    await page.getByTestId("excel-map-serial").selectOption("Codice");
    await page.getByTestId("excel-map-apply").click();
    await expect(page.getByTestId("document-lines-to-confirm")).toBeVisible();

    // 2. The server now answers 3 s late; the user chooses "Seriale" at once.
    await page.route((url) => url.pathname.includes("google.firestore"), async (r) => { await new Promise((ok) => setTimeout(ok, 3000)); await r.continue().catch(() => undefined); });
    const [s1, s2] = [uniqueCode("S"), uniqueCode("S")];
    await newDdt(page);
    await page.getByTestId("document-files-input").setInputFiles({ name: "b.xlsx", mimeType: XLSX, buffer: await xlsx([["Codice", "Seriale"], ["", s1], ["", s2]]) });
    await expect(page.getByTestId("excel-mapping")).toBeVisible();
    await page.getByTestId("excel-map-serial").selectOption("Seriale");
    await page.waitForTimeout(8000); // the saved mapping arrives meanwhile
    await expect(page.getByTestId("excel-map-serial")).toHaveValue("Seriale");
    await expect(page.getByTestId("excel-map-count")).toHaveText(tr("documents.excelCount_other").replace("{{count}}", "2").replace("{{skipped}}", "0"));
    await page.getByTestId("excel-map-apply").click();
    await expect(page.getByTestId("document-lines")).toHaveValue(`${s1}\n${s2}`);
  });
});
