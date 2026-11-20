import { describe, it, expect } from "vitest";
import { newRow, rowError, rowIsEmpty, rowFromLine, linesFromRows, rowsFromPaste, rowsToText, type LineRow } from "../src/lib/documents/lines";

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
  it("a saved line comes back as the same row (the model it carries kept)", () => {
    const r = rowFromLine({ kind: "serial", codeRaw: "S1", materialCode: null, modelId: "mod_x", direction: "remove" });
    expect(linesFromRows([r])).toEqual([{ kind: "serial", codeRaw: "S1", materialCode: null, modelId: "mod_x", direction: "remove" }]);
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
