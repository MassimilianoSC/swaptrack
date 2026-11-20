import { test, expect, type Page, type Locator } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, tr, png, emulatorSetDoc, emulatorRead, emulatorPatchSetting } from "./helpers";
import { SEED } from "./seed";

// P-223 (tester, 20/11, pages 2-3): the lines of a document are a table Quantity / Article code / Serial number, with
// "Add line" and a bin per row; quantity 1 prefilled and locked by a serial; empty rows ignored; the errors under their
// row with the tester's exact messages; Excel, automatic reading and paste fill the same table; a field the automatic
// reading did not read is empty and red; a BOM has "Material to install" / "Material to remove" (and "to assign" for
// lines without direction). The cells are checked (value, red, message under the row), not only data-lines-text.
const MSG = {
  quantity: "Inserisci una quantità intera maggiore di zero.",
  codeOrSerial: "Inserisci almeno il codice articolo o il numero seriale.",
};
const CHECK = "Controlla i dati estratti confrontandoli con il documento, poi salva.";
const RED = /border-danger/;

const rowsOf = (page: Page, id: string) => page.getByTestId(id).getByTestId(`${id}-row`);
const cell = (row: Locator, id: string, c: "qty" | "code" | "serial") => row.getByTestId(`${id}-${c}`);
// The message is in the table row right under its row.
const under = (row: Locator, id: string) => row.locator("xpath=following-sibling::tr[1]").getByTestId(`${id}-error`);

async function newDdt(page: Page): Promise<void> {
  await page.goto("/documents/new");
  await page.getByTestId("document-number").fill(uniqueCode("DDTT"));
  await page.getByTestId("document-location").selectOption(`loc_${SEED.nord.warehouse}`);
}

test.describe("Tabella delle righe dei documenti (scrivania)", () => {
  test("DDT: colonne, riga pronta, seriale che blocca la quantità, errori sotto la riga, righe vuote ignorate", async ({ page }) => {
    test.setTimeout(180_000);
    const L = "document-lines";
    const serial = uniqueCode("TS");
    await signIn(page, ACCOUNTS.aspAdminNord);
    await newDdt(page);
    const table = page.getByTestId(L);
    for (const h of ["Quantità", "Codice articolo", "Numero seriale"]) await expect(table.locator("th", { hasText: h })).toHaveCount(1);
    const rows = rowsOf(page, L);
    // A new document starts with one row, quantity 1.
    await expect(rows).toHaveCount(1);
    await expect(cell(rows.nth(0), L, "qty")).toHaveValue("1");

    await cell(rows.nth(0), L, "qty").fill("3");
    await cell(rows.nth(0), L, "code").fill("MC400170");
    // A serial: quantity 1, locked.
    await page.getByTestId(`${L}-add`).click();
    await cell(rows.nth(1), L, "qty").fill("4");
    await cell(rows.nth(1), L, "serial").fill(serial);
    await expect(cell(rows.nth(1), L, "qty")).toHaveValue("1");
    await expect(cell(rows.nth(1), L, "qty")).toBeDisabled();
    // Only a quantity; a quantity 0; an empty row.
    await page.getByTestId(`${L}-add`).click();
    await cell(rows.nth(2), L, "qty").fill("3");
    await page.getByTestId(`${L}-add`).click();
    await cell(rows.nth(3), L, "qty").fill("0");
    await cell(rows.nth(3), L, "code").fill("MC400107");
    await page.getByTestId(`${L}-add`).click();
    await expect(rows).toHaveCount(5);
    // No error before "Save".
    await expect(table.getByTestId(`${L}-error`)).toHaveCount(0);

    await page.getByTestId("document-save-new").click();
    await expect(table.getByTestId(`${L}-error`)).toHaveCount(2);
    await expect(under(rows.nth(2), L)).toHaveText(MSG.codeOrSerial);
    await expect(cell(rows.nth(2), L, "code")).toHaveClass(RED);
    await expect(cell(rows.nth(2), L, "serial")).toHaveClass(RED);
    await expect(under(rows.nth(3), L)).toHaveText(MSG.quantity);
    await expect(cell(rows.nth(3), L, "qty")).toHaveClass(RED);
    await expect(cell(rows.nth(3), L, "code")).not.toHaveClass(RED);
    // The valid rows and the empty one say nothing.
    for (const i of [0, 1, 4]) await expect(under(rows.nth(i), L)).toHaveCount(0);
    await expect(page).toHaveURL(/\/documents\/new/);

    // Fixed (bin on the row with only a quantity, 2 in place of 0): saved; the empty row is not a line.
    await rows.nth(2).getByTestId(`${L}-delete`).click();
    await cell(rows.nth(2), L, "qty").fill("2");
    await expect(table.getByTestId(`${L}-error`)).toHaveCount(0);
    await page.getByTestId("document-save-new").click();
    await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });
    const id = page.url().split("/").pop()!;
    await page.reload();
    await expect(rows).toHaveCount(3, { timeout: 30_000 });
    await expect(cell(rows.nth(0), L, "qty")).toHaveValue("3");
    await expect(cell(rows.nth(0), L, "code")).toHaveValue("MC400170");
    await expect(cell(rows.nth(1), L, "serial")).toHaveValue(serial);
    await expect(cell(rows.nth(1), L, "qty")).toBeDisabled();
    await expect(cell(rows.nth(2), L, "qty")).toHaveValue("2");
    await expect(cell(rows.nth(2), L, "code")).toHaveValue("MC400107");
    const lines = (await emulatorRead(`documents/${id}`)).lines as Array<Record<string, unknown>>;
    expect(lines.map((l) => [l.kind, l.quantity ?? null, l.materialCode ?? null, l.codeRaw ?? null])).toEqual([
      ["quantity", 3, "MC400170", null], ["serial", null, null, serial], ["quantity", 2, "MC400107", null],
    ]);
  });

  test("«Incolla righe»: righe copiate da un foglio e il testo di oggi, al posto della riga vuota", async ({ page }) => {
    test.setTimeout(120_000);
    const L = "document-lines";
    await signIn(page, ACCOUNTS.aspAdminNord);
    await newDdt(page);
    await page.getByTestId(`${L}-paste`).click();
    await page.getByTestId(`${L}-paste-text`).fill("2\tMC400170\t\n5\tMC400107\tTS-PASTE-1\nTS-PASTE-2 MC400114\n#3 MC400121");
    await page.getByTestId(`${L}-paste-apply`).click();
    const rows = rowsOf(page, L);
    await expect(rows).toHaveCount(4);
    const values = async (i: number) => [await cell(rows.nth(i), L, "qty").inputValue(), await cell(rows.nth(i), L, "code").inputValue(), await cell(rows.nth(i), L, "serial").inputValue()];
    expect(await values(0)).toEqual(["2", "MC400170", ""]);
    expect(await values(1)).toEqual(["1", "MC400107", "TS-PASTE-1"]);
    await expect(cell(rows.nth(1), L, "qty")).toBeDisabled();
    expect(await values(2)).toEqual(["1", "MC400114", "TS-PASTE-2"]);
    expect(await values(3)).toEqual(["3", "MC400121", ""]);
    await expect(page.getByTestId(`${L}-summary`)).toHaveText(tr("documents.linesSummary").replace("{{serials}}", "2").replace("{{quantities}}", "2"));
  });

  test("lettura automatica: campi non letti vuoti e in rosso, «Controlla i dati estratti…», poi si completa e si salva", async ({ page }) => {
    test.setTimeout(180_000);
    const L = "document-lines";
    // The switch is shared (ai-reading): on for this test only, always back off.
    await emulatorPatchSetting("features", { aiDocumentExtraction: true });
    try {
      await signIn(page, ACCOUNTS.aspAdminNord);
      await newDdt(page);
      await page.getByTestId("document-files-input").setInputFiles({ name: "ddt.png", mimeType: "image/png", buffer: png(16) });
      await page.getByTestId("document-save-new").click();
      await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 30_000 });
      // What the server answers when the model could not read a field (o2, P-223): null, never a guess.
      await page.route((u) => u.pathname.startsWith("/__functions"), (r) => (r.request().postData() ?? "").includes("\"op\":\"extractDocument\"")
        ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { pages: 1, warnings: ["ai_fields_missing"], lines: [
          { kind: "quantity", quantity: null, materialCode: "MC400170" },
          { kind: "quantity", quantity: 4, materialCode: null },
          { kind: "serial", codeRaw: "TS-AI-1", materialCode: null },
        ] } }) })
        : r.fallback());
      await page.getByTestId("document-ai-read").click();
      await expect(page.getByTestId("document-lines-to-confirm")).toContainText(CHECK, { timeout: 30_000 });
      await expect(page.getByTestId("document-ai-warnings")).toContainText(tr("documents.aiWarn.ai_fields_missing"));
      const rows = rowsOf(page, L);
      await expect(rows).toHaveCount(3);
      // The fields not read are empty and red; the others as read.
      await expect(cell(rows.nth(0), L, "qty")).toHaveValue("");
      await expect(cell(rows.nth(0), L, "qty")).toHaveClass(RED);
      await expect(cell(rows.nth(0), L, "code")).toHaveValue("MC400170");
      await expect(cell(rows.nth(0), L, "code")).not.toHaveClass(RED);
      await expect(cell(rows.nth(1), L, "qty")).toHaveValue("4");
      await expect(cell(rows.nth(1), L, "code")).toHaveValue("");
      await expect(cell(rows.nth(1), L, "code")).toHaveClass(RED);
      await expect(cell(rows.nth(2), L, "serial")).toHaveValue("TS-AI-1");
      for (const c of ["qty", "code", "serial"] as const) await expect(cell(rows.nth(2), L, c)).not.toHaveClass(RED);

      // Saved as they are: the rules stop it, under the rows.
      await page.getByTestId("document-save").click();
      await expect(under(rows.nth(0), L)).toHaveText(MSG.quantity);
      await expect(under(rows.nth(1), L)).toHaveText(MSG.codeOrSerial);
      // Filled in looking at the document: no longer red, saved.
      await cell(rows.nth(0), L, "qty").fill("2");
      await cell(rows.nth(1), L, "code").fill("MC400107");
      await expect(cell(rows.nth(0), L, "qty")).not.toHaveClass(RED);
      await expect(cell(rows.nth(1), L, "code")).not.toHaveClass(RED);
      await expect(page.getByTestId(`${L}-error`)).toHaveCount(0);
      await page.getByTestId("document-save").click();
      await expect(page.getByText(tr("common.saved")).last()).toBeVisible({ timeout: 30_000 });
      await page.reload();
      await expect(page.getByTestId(L)).toHaveAttribute("data-lines-text", "#2 MC400170\n#4 MC400107\nTS-AI-1", { timeout: 30_000 });
    } finally {
      await emulatorPatchSetting("features", { aiDocumentExtraction: false });
    }
  });

  // P-224 (o2's review): a saved quantity line with only its model (the server accepts it) showed an empty code: with
  // quantity 1 it vanished on the next save, with more it was red and the document could not be saved again.
  test("riga a quantità salvata col solo modello: il codice dal catalogo; senza codice nel catalogo resta, in rosso", async ({ page }) => {
    test.setTimeout(180_000);
    const L = "document-lines";
    const id = `e2e-${uniqueCode("DOCM").toLowerCase()}`;
    const code = String((await emulatorRead("models/mdl_MC400170")).materialCode);
    const now = new Date();
    await emulatorSetDoc(`documents/${id}`, {
      kind: "ddt_in", number: uniqueCode("DDTM"), aspId: SEED.nord.orgId, locationId: `loc_${SEED.nord.warehouse}`, files: [],
      lines: [{ kind: "quantity", quantity: 2, materialCode: null, modelId: "mdl_MC400170" }, { kind: "quantity", quantity: 1, materialCode: null, modelId: "mdl_E2E_NONE" }],
      linesSource: "manual", version: 1, status: "open", createdAt: now, updatedAt: now, history: [], duplicateOf: null, shipmentId: null,
    });
    await signIn(page, ACCOUNTS.aspAdminNord);
    await page.goto(`/documents/${id}`);
    const rows = rowsOf(page, L);
    await expect(rows).toHaveCount(2, { timeout: 30_000 });
    await expect(cell(rows.nth(0), L, "code")).toHaveValue(code);
    await expect(cell(rows.nth(0), L, "code")).not.toHaveClass(RED);
    // The model the catalog cannot name: kept, red, and it says why before "Save".
    await expect(cell(rows.nth(1), L, "qty")).toHaveValue("1");
    await expect(cell(rows.nth(1), L, "code")).toHaveValue("");
    await expect(cell(rows.nth(1), L, "code")).toHaveClass(RED);
    await expect(under(rows.nth(1), L)).toHaveText(MSG.codeOrSerial);
    await page.getByTestId("document-save").click();
    await expect(under(rows.nth(1), L)).toHaveText(MSG.codeOrSerial);
    expect(((await emulatorRead(`documents/${id}`)).lines as unknown[]).length).toBe(2);
    await cell(rows.nth(1), L, "code").fill("MC400107");
    await page.getByTestId("document-save").click();
    await expect(page.getByText(tr("common.saved")).last()).toBeVisible({ timeout: 30_000 });
    const lines = (await emulatorRead(`documents/${id}`)).lines as Array<Record<string, unknown>>;
    expect(lines.map((l) => [l.quantity, l.materialCode])).toEqual([[2, code], [1, "MC400107"]]);
  });

  test("BOM: «Materiale da installare», «Materiale da smontare» e le righe senza direzione da assegnare", async ({ page }) => {
    test.setTimeout(180_000);
    const id = `e2e-${uniqueCode("BOMT").toLowerCase()}`;
    const [a, b, c] = [uniqueCode("TA"), uniqueCode("TB"), uniqueCode("TC")];
    const now = new Date();
    // A BOM saved before P-92: two lines without direction, one to install.
    await emulatorSetDoc(`documents/${id}`, {
      kind: "bom", number: uniqueCode("BOMT"), aspId: SEED.nord.orgId, locationId: `loc_${SEED.nord.site}`, files: [],
      lines: [{ kind: "serial", codeRaw: a, materialCode: null }, { kind: "quantity", quantity: 2, materialCode: "MC400170" }, { kind: "serial", codeRaw: c, materialCode: null, direction: "install" }],
      linesSource: "manual", version: 1, status: "open", createdAt: now, updatedAt: now, history: [], duplicateOf: null, shipmentId: null,
    });
    await signIn(page, ACCOUNTS.aspAdminNord);
    await page.goto(`/documents/${id}`);
    await expect(page.getByTestId("document-lines-install").locator("h3")).toHaveText("Materiale da installare", { timeout: 30_000 });
    await expect(page.getByTestId("document-lines-remove").locator("h3")).toHaveText("Materiale da smontare");
    await expect(cell(rowsOf(page, "document-lines-install").nth(0), "document-lines-install", "serial")).toHaveValue(c);
    await expect(rowsOf(page, "document-lines-remove")).toHaveCount(0);
    const none = rowsOf(page, "document-lines-none");
    await expect(none).toHaveCount(2);
    await expect(cell(none.nth(0), "document-lines-none", "serial")).toHaveValue(a);
    await expect(cell(none.nth(1), "document-lines-none", "qty")).toHaveValue("2");

    // Not saved while a line has no direction.
    await page.getByTestId("document-save").click();
    await expect(page.getByText(tr("errors.bom_direction_required")).last()).toBeVisible();
    // Each one assigned: it moves to its table; the "to assign" table goes away.
    await none.nth(0).locator("xpath=following-sibling::tr[1]").getByTestId("document-lines-none-to-remove").click();
    await none.nth(0).locator("xpath=following-sibling::tr[1]").getByTestId("document-lines-none-to-install").click();
    await expect(page.getByTestId("document-lines-none")).toHaveCount(0);
    await expect(cell(rowsOf(page, "document-lines-remove").nth(0), "document-lines-remove", "serial")).toHaveValue(a);
    await expect(rowsOf(page, "document-lines-install")).toHaveCount(2);
    // A new line typed in "Material to remove".
    await page.getByTestId("document-lines-remove-add").click();
    await cell(rowsOf(page, "document-lines-remove").nth(1), "document-lines-remove", "serial").fill(b);
    await page.getByTestId("document-save").click();
    await expect(page.getByText(tr("common.saved")).last()).toBeVisible({ timeout: 30_000 });
    const lines = (await emulatorRead(`documents/${id}`)).lines as Array<Record<string, unknown>>;
    expect(lines.map((l) => [l.codeRaw ?? l.materialCode, l.direction])).toEqual([[c, "install"], ["MC400170", "install"], [a, "remove"], [b, "remove"]]);
  });
});
