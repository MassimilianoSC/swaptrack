import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ACCOUNTS, signIn, uniqueCode, tr, emulatorRead } from "./helpers";
import { SEED } from "./seed";

// P-124: the invented documents of scripts/demoDocs.mjs load in the app as the demo will do it, with the base seed
// only (`--seed "yarn seed"`): the Excel of DDT TD-2026-0412 and the BOM of SITO-00013, through the column choice.
// Their material codes are the seed catalog's (the model of each line is found). Own document numbers.
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const file = (name: string) => ({ name, mimeType: XLSX, buffer: readFileSync(`${ROOT}demo-docs/${name}`) });

test.beforeAll(() => {
  // Generated fresh: the test checks the script of today, not files left from another day.
  execFileSync(process.execPath, ["scripts/demoDocs.mjs"], { cwd: ROOT, stdio: "pipe", timeout: 120_000 });
});

async function newDocument(page: Page, kind: "ddt_in" | "bom", location: string) {
  await page.goto("/documents/new");
  await page.getByTestId("document-kind").selectOption(kind);
  await page.getByTestId("document-number").fill(uniqueCode(kind === "bom" ? "BOMDEMO" : "DDTDEMO"));
  await page.getByTestId("document-location").selectOption(`loc_${location}`);
}
const count = (n: number, skipped: number) => tr("documents.excelCount_other").replace("{{count}}", String(n)).replace("{{skipped}}", String(skipped));
// The column choice, as a user does it: after the saved choice has loaded (P-128: it fills only the untouched fields).
async function chooseColumns(page: Page, choices: Array<[string, string]>, ready: string) {
  await expect(page.getByTestId("excel-map-loading")).toHaveCount(0, { timeout: 30_000 });
  for (const [field, value] of choices) await page.getByTestId(`excel-map-${field}`).selectOption(value);
  await expect(page.getByTestId("excel-map-count")).toHaveText(ready);
}

test.describe("Documenti di prova della demo (scrivania)", () => {
  test("il DDT TD-2026-0412 in Excel: 10 righe con il codice materiale del catalogo", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await newDocument(page, "ddt_in", SEED.nord.warehouse);
    await page.getByTestId("document-files-input").setInputFiles(file("DDT-TD-2026-0412.xlsx"));
    await chooseColumns(page, [["serial", "N. serie"], ["materialCode", "Cod. articolo"], ["quantity", "Q.tà"]], count(10, 0));
    await page.getByTestId("excel-map-apply").click();
    await expect(page.getByTestId("document-lines")).toHaveValue([
      "TD260412001 MC400100", "TD260412002 MC400107", "TD260412003 MC400114", "TD260412004 MC400121",
      "TD260412005 MC400128", "TD260412006 MC400135", "TD260412007 MC400142", "TD260412008 MC400149", "#3 MC400170", "#2 MC400205",
    ].join("\n"));
    await page.getByTestId("document-save-new").click();
    await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });
    // Every material code of the document is a model of the seed catalog.
    for (const mc of ["MC400100", "MC400149", "MC400170", "MC400205"]) expect((await emulatorRead(`models/mdl_${mc}`)).materialCode).toBe(mc);
  });

  test("la BOM di SITO-00013 in Excel: la colonna Operazione divide smontare e installare", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, ACCOUNTS.aspAdminNord);
    await newDocument(page, "bom", "SITO-00013");
    await page.getByTestId("document-files-input").setInputFiles(file("BOM-SITO-00013.xlsx"));
    await chooseColumns(page, [["serial", "N. serie"], ["materialCode", "Cod. articolo"], ["quantity", "Q.tà"], ["direction", "Operazione"],
      ["removeValue", "SMONTARE"], ["installValue", "INSTALLARE"]], count(10, 0));
    await page.getByTestId("excel-map-apply").click();
    await expect(page.getByTestId("document-lines-remove")).toHaveValue(
      ["TD26R13001 MC400100", "TD26R13002 MC400107", "TD26R13003 MC400114", "TD26R13004 MC400121", "TD26R13005 MC400128"].join("\n"));
    await expect(page.getByTestId("document-lines-install")).toHaveValue(
      ["TD26I13001 MC400135", "TD26I13002 MC400142", "TD26I13003 MC400149", "TD26I13004 MC400156", "#2 MC400177"].join("\n"));
    await expect(page.getByTestId("document-lines-none")).toHaveCount(0);
    await page.getByTestId("document-save-new").click();
    await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });
  });
});
