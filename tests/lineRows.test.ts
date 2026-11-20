import { describe, it, expect } from "vitest";
import * as L from "../src/lib/documents/lines";
import { newRow, rowError, rowIsEmpty, rowFromLine, linesFromRows, linesFromSheet, carryModels, rowsFromPaste, rowsToText, type LineRow, type DocLine } from "../src/lib/documents/lines";
// P-224: new in the fix (a function, so the red run before it fails on the assertion, not on the import).
const fillCodesFromModels: (rows: LineRow[], codeOf: (modelId: string) => string | undefined) => LineRow[] =
  (L as unknown as { fillCodesFromModels?: typeof fillCodesFromModels }).fillCodesFromModels ?? ((rows) => rows);

// P-223 (tester, 20/11): the rows of the lines table of a document. Rules: quantity a whole number above zero; at least
// the article code or the serial; a piece with a serial has quantity 1. Empty rows are ignored. The automatic reading
// leaves a field it did not recognise empty (null) and the row is flagged. Paste: rows copied from a sheet (tabs) or
// today's text.
const row = (p: Partial<LineRow>): LineRow => ({ ...newRow(), ...p });
const CATALOG = new Set(["MC400170"]);

describe("lineRows / rules", () => {
  it("the tester's valid examples", () => {
    expect(rowError(row({ quantity: "3", materialCode: "MC400170" }))).toBeNull();
    expect(rowError(row({ quantity: "1", serial: "TD260412001" }))).toBeNull();
    expect(rowError(row({ quantity: "1", materialCode: "MC400170", serial: "TD260412001" }))).toBeNull();
  });
  it("quantity: a whole number above zero", () => {
    expect(rowError(row({ quantity: "0", materialCode: "MC400170" }))).toBe("quantity");
    expect(rowError(row({ quantity: "2.5", materialCode: "MC400170" }))).toBe("quantity");
    expect(rowError(row({ quantity: "", materialCode: "MC400170" }))).toBe("quantity");
  });
  it("only a quantity: at least the article code or the serial", () => {
    expect(rowError(row({ quantity: "3" }))).toBe("codeOrSerial");
  });
  it("a serial with a quantity other than 1", () => {
    expect(rowError(row({ quantity: "2", serial: "TD260412001" }))).toBe("serialQuantity");
  });
  it("an empty row (quantity 1 as prefilled, nothing else) is ignored, not an error", () => {
    const empty = newRow();
    expect(rowIsEmpty(empty)).toBe(true);
    expect(rowError(empty)).toBeNull();
    expect(linesFromRows([empty, row({ quantity: "3", materialCode: "MC400170" })])).toHaveLength(1);
  });
});

describe("lineRows / lines", () => {
  it("rows -> lines in today's shape, with the direction of the BOM table", () => {
    expect(linesFromRows([row({ serial: "TD260412001", materialCode: "MC400170" }), row({ quantity: "3", materialCode: "MC400170" })], "install")).toEqual([
      { kind: "serial", codeRaw: "TD260412001", materialCode: "MC400170", direction: "install" },
      { kind: "quantity", quantity: 3, materialCode: "MC400170", direction: "install" },
    ]);
  });
  it("a field the automatic reading did not recognise stays empty and is flagged, never guessed", () => {
    const r = rowFromLine({ kind: "quantity", quantity: null, materialCode: null });
    expect(r.quantity).toBe("");
    expect(r.materialCode).toBe("");
    expect(r.missing).toEqual(["quantity", "materialCode"]);
    expect(rowError(r)).toBe("quantity");
  });
  it("a saved line comes back as the same row (the model it carries kept by carryModels)", () => {
    const saved: DocLine = { kind: "serial", codeRaw: "S1", materialCode: null, modelId: "mod_x", direction: "remove" };
    expect(carryModels(linesFromRows([rowFromLine(saved)]), [saved])).toEqual([saved]);
  });
});

// P-224 (o2's review of P-223).
describe("lineRows / P-224", () => {
  it("1. the spaces inside a serial are kept (the same codeId as the scanner), typed or from an Excel", () => {
    expect(linesFromRows([row({ serial: "  KRD 901305/11 " })])).toEqual([{ kind: "serial", codeRaw: "KRD 901305/11", materialCode: null }]);
    const sheet = { headers: ["S", "M"], rows: [[" KRD 901305/11 ", "MC400170"]] };
    expect(linesFromSheet(sheet, { serial: "S", materialCode: "M" }, false).lines[0]).toMatchObject({ kind: "serial", codeRaw: "KRD 901305/11" });
  });
  it("2. a corrected row does not keep the model of the line it was", () => {
    const saved: DocLine = { kind: "serial", codeRaw: "S1", materialCode: null, modelId: "mod_x" };
    const edited = { ...rowFromLine(saved), serial: "S2" };
    expect(linesFromRows([edited])[0]).not.toHaveProperty("modelId");
    expect(carryModels(linesFromRows([edited]), [saved])[0]).not.toHaveProperty("modelId");
  });
  it("3. a quantity line with a model and no code: the code from the catalog, otherwise flagged, never dropped", () => {
    const r = rowFromLine({ kind: "quantity", quantity: 1, materialCode: null, modelId: "mod_x" });
    expect(r.missing).toEqual(["materialCode"]);
    expect(rowIsEmpty(r)).toBe(false);
    expect(rowError(r)).toBe("codeOrSerial");
    const [filled] = fillCodesFromModels([r], (id) => (id === "mod_x" ? "MC400170" : undefined));
    expect(filled.materialCode).toBe("MC400170");
    expect(filled.missing).toBeUndefined();
    expect(rowError(filled)).toBeNull();
    expect(fillCodesFromModels([r], () => undefined)[0].missing).toEqual(["materialCode"]);
  });
  it("4. a quantity above 100000 is refused on the row, as the server does", () => {
    expect(rowError(row({ quantity: "100000", materialCode: "MC400170" }))).toBeNull();
    expect(rowError(row({ quantity: "100001", materialCode: "MC400170" }))).toBe("quantityMax");
  });
  it("5. a pasted line with only «[install]» or «[remove]» is ignored", () => {
    expect(rowsFromPaste("[install]\n#3 MC400170\n [remove] ").map((r) => [r.quantity, r.materialCode])).toEqual([["3", "MC400170"]]);
  });
});

describe("lineRows / paste", () => {
  it("rows copied from a sheet: quantity, article code, serial (a serial forces quantity 1)", () => {
    const rows = rowsFromPaste("3\tMC400170\t\n5\tMC400170\tTD1\n");
    expect(rows.map((r) => [r.quantity, r.materialCode, r.serial])).toEqual([["3", "MC400170", ""], ["1", "MC400170", "TD1"]]);
  });
  it("today's text, with P-169 for «#1»", () => {
    const rows = rowsFromPaste("#1 KRD901305/11\nS2 MC400170\n#3 MC400170", "remove", CATALOG);
    expect(rowsToText(rows)).toBe("KRD901305/11\nS2 MC400170\n#3 MC400170");
    expect(rows.every((r) => r.direction === "remove")).toBe(true);
  });
});
