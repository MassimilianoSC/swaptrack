import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { ACCOUNTS, signIn, uniqueCode, tr, emulatorSetDoc, emulatorRead, emulatorFirstId } from "./helpers";
import { SEED } from "./seed";

// P-105 (SPEC §11.2, §12.2; D-43, D-47): a DDT or a BOM loaded from an Excel (column mapping, saved and reused) or
// from photos and PDFs (several pages, preview next to the lines). The lines read from a file wait in the same boxes
// as typed lines and are saved only with "Save". Own documents (E2E- numbers and codes).
async function xlsx(rows: string[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("DDT");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const PDF = (bytes = 0) => Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(bytes, 0x20), Buffer.from("\n%%EOF\n")]);

async function newDocument(page: Page, kind: "ddt_in" | "bom", location: string): Promise<string> {
  const number = uniqueCode(kind === "bom" ? "BOMX" : "DDTX");
  await page.goto("/documents/new");
  await page.getByTestId("document-kind").selectOption(kind);
  await page.getByTestId("document-number").fill(number);
  await page.getByTestId("document-location").selectOption(`loc_${location}`);
  return number;
}
const saveNew = async (page: Page) => {
  await page.getByTestId("document-save-new").click();
  await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });
};

test.describe("Documenti da file o foto (scrivania)", () => {
  test("DDT da Excel: scelta delle colonne, righe da confermare, colonne ricordate al file dopo", async ({ page }) => {
    test.setTimeout(180_000);
    const [a, b] = [uniqueCode("X"), uniqueCode("X")];
    const header = ["Seriale", "Materiale", "Qtà", "Note"];
    await signIn(page, ACCOUNTS.aspWarehouseNord);

    await newDocument(page, "ddt_in", SEED.nord.warehouse);
    await page.getByTestId("document-files-input").setInputFiles({ name: "ddt.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await xlsx([header, [a, "MC-A", "", ""], [b, "", "", "x"], ["", "MC-B", "3", ""], ["", "", "", "solo nota"]]) });
    await expect(page.getByTestId("excel-mapping")).toBeVisible();
    await page.getByTestId("excel-map-serial").selectOption("Seriale");
    await page.getByTestId("excel-map-materialCode").selectOption("Materiale");
    await page.getByTestId("excel-map-quantity").selectOption("Qtà");
    await expect(page.getByTestId("excel-map-count")).toHaveText(tr("documents.excelCount_other").replace("{{count}}", "3").replace("{{skipped}}", "1"));
    await page.getByTestId("excel-map-apply").click();
    // The lines are on screen, to be checked: nothing is saved yet.
    await expect(page.getByTestId("document-lines-to-confirm")).toBeVisible();
    await expect(page.getByTestId("document-lines")).toHaveValue(`${a} MC-A\n${b}\n#3 MC-B`);
    await saveNew(page);
    await expect(page.getByTestId("document-lines")).toHaveValue(`${a} MC-A\n${b}\n#3 MC-B`);
    await expect(page.getByTestId("document-file")).toHaveCount(1);
    await expect(page.getByTestId("document-lines-to-confirm")).toHaveCount(0);

    // A second Excel in the same format: the columns are already chosen.
    const c = uniqueCode("X");
    await newDocument(page, "ddt_in", SEED.nord.warehouse);
    await page.getByTestId("document-files-input").setInputFiles({ name: "ddt2.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await xlsx([header, [c, "MC-A", "", ""]]) });
    await expect(page.getByTestId("excel-map-serial")).toHaveValue("Seriale");
    await page.getByTestId("excel-map-apply").click();
    await expect(page.getByTestId("document-lines")).toHaveValue(`${c} MC-A`);
  });

  test("BOM da Excel: la colonna dice cosa smontare e cosa installare", async ({ page }) => {
    test.setTimeout(180_000);
    const [r1, r2, i1] = [uniqueCode("X"), uniqueCode("X"), uniqueCode("X")];
    await signIn(page, ACCOUNTS.aspAdminNord);
    await newDocument(page, "bom", SEED.nord.site);
    await page.getByTestId("document-files-input").setInputFiles({ name: "bom.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await xlsx([["Seriale", "Azione"], [r1, "SMONTARE"], [i1, "INSTALLARE"], [r2, "smontare"]]) });
    await page.getByTestId("excel-map-serial").selectOption("Seriale");
    await page.getByTestId("excel-map-direction").selectOption("Azione");
    await page.getByTestId("excel-map-removeValue").selectOption("SMONTARE");
    await page.getByTestId("excel-map-installValue").selectOption("INSTALLARE");
    await page.getByTestId("excel-map-apply").click();
    await expect(page.getByTestId("document-lines-remove")).toHaveValue(`${r1}\n${r2}`);
    await expect(page.getByTestId("document-lines-install")).toHaveValue(i1);
    await saveNew(page);
    await expect(page.getByTestId("document-lines-remove")).toHaveValue(`${r1}\n${r2}`);
    await expect(page.getByTestId("document-lines-install")).toHaveValue(i1);
  });

  test("DDT da foto e PDF: anteprima, righe scritte accanto, una pagina aggiunta dopo si somma alle altre", async ({ page }) => {
    test.setTimeout(180_000);
    const code = uniqueCode("X");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    const jpeg = Buffer.from(await page.evaluate(async () => {
      const c = document.createElement("canvas"); c.width = 400; c.height = 300;
      const g = c.getContext("2d")!; g.fillStyle = "#ddd"; g.fillRect(0, 0, 400, 300); g.fillStyle = "#000"; g.fillText("DDT", 20, 40);
      const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), "image/jpeg", 0.9));
      return new Promise<string>((r) => { const f = new FileReader(); f.onload = () => r(String(f.result).split(",")[1]); f.readAsDataURL(b); });
    }), "base64");

    await newDocument(page, "ddt_in", SEED.nord.warehouse);
    await page.getByTestId("document-files-input").setInputFiles([
      { name: "pagina1.jpg", mimeType: "image/jpeg", buffer: jpeg },
      { name: "pagina2.pdf", mimeType: "application/pdf", buffer: PDF() },
    ]);
    await expect(page.getByTestId("document-file")).toHaveCount(2);
    await expect(page.getByTestId("document-preview-image")).toBeVisible();
    await page.getByTestId("document-lines").fill(code);
    await saveNew(page);
    await expect(page.getByTestId("document-file")).toHaveCount(2);
    await expect(page.getByTestId("document-preview-image")).toHaveJSProperty("complete", true);

    // D-47: a page added to the saved DDT joins the others.
    await page.getByTestId("document-files-input").setInputFiles({ name: "pagina3.pdf", mimeType: "application/pdf", buffer: PDF() });
    await page.getByTestId("document-save").click();
    await expect(page.getByText(tr("common.saved")).last()).toBeVisible();
    await expect(page.getByTestId("document-file")).toHaveCount(3);
    await expect(page.getByTestId("document-lines")).toHaveValue(code);
  });

  // Censimento n.38 (P-115): the boxes do not show a line's model (modelId, from an import or the server); saving the
  // document again keeps it. The document is the test's own, written in the emulator with a model on its line.
  test("salvare di nuovo un documento non perde il modello delle righe", async ({ page }) => {
    test.setTimeout(120_000);
    const id = `e2e-${uniqueCode("DOC").toLowerCase()}`;
    const code = uniqueCode("X");
    const modelId = await emulatorFirstId("models");
    const now = new Date();
    await emulatorSetDoc(`documents/${id}`, {
      kind: "ddt_in", number: uniqueCode("DDTM"), aspId: SEED.nord.orgId, locationId: `loc_${SEED.nord.warehouse}`, files: [],
      lines: [{ kind: "serial", codeRaw: code, materialCode: null, modelId }], linesSource: "manual", version: 1, status: "open",
      createdAt: now, updatedAt: now, history: [], duplicateOf: null, shipmentId: null,
    });
    await signIn(page, ACCOUNTS.aspAdminNord);
    await page.goto(`/documents/${id}`);
    await expect(page.getByTestId("document-lines")).toHaveValue(code);
    await page.getByTestId("document-save").click();
    await expect(page.getByText(tr("common.saved")).last()).toBeVisible();
    await expect.poll(async () => ((await emulatorRead(`documents/${id}`)).version as number), { timeout: 30_000 }).toBe(2);
    const lines = (await emulatorRead(`documents/${id}`)).lines as Array<{ codeRaw: string; modelId?: string | null }>;
    expect(lines).toEqual([expect.objectContaining({ codeRaw: code, modelId })]);
  });

  test("file oltre 5 MB: messaggio chiaro, nessun file aggiunto", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await newDocument(page, "ddt_in", SEED.nord.warehouse);
    await page.getByTestId("document-files-input").setInputFiles({ name: "grande.pdf", mimeType: "application/pdf", buffer: PDF(5 * 1024 * 1024 + 10) });
    await expect(page.getByText(tr("errors.file_too_large")).first()).toBeVisible();
    await expect(page.getByTestId("document-file")).toHaveCount(0);
  });
});
