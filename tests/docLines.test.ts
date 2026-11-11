import { describe, it, expect } from "vitest";
import { parseLines, countLines } from "../src/lib/documents/lines";

// P-169 (tester): in a DDT the row "#1 KRD901305/11" meant "one piece, serial KRD901305/11" and became a quantity line of
// a material code that does not exist, so the serial was never expected. "#1 CODE" is a serial when CODE is not a
// material code of the catalog; a real material code, or more than one piece, stays a quantity line.
const CATALOG: ReadonlySet<string> = new Set(["MC400100", "MC400170"]);

describe("document lines typed in a box (P-169)", () => {
  it("«#1 SERIAL» with a code that is not a material code is that serial; the slash stays", () => {
    expect(parseLines("#1 KRD901305/11\nKDU1370114/11", undefined, CATALOG)).toEqual([
      { kind: "serial", codeRaw: "KRD901305/11", direction: undefined },
      { kind: "serial", codeRaw: "KDU1370114/11", direction: undefined },
    ]);
  });

  it("a material code of the catalog stays a quantity line, also with #1", () => {
    expect(parseLines("#1 MC400100\n#3 MC400170", "remove", CATALOG)).toEqual([
      { kind: "quantity", quantity: 1, materialCode: "MC400100", direction: "remove" },
      { kind: "quantity", quantity: 3, materialCode: "MC400170", direction: "remove" },
    ]);
  });

  it("more than one piece of a code outside the catalog stays a quantity line (a serial is one piece)", () => {
    expect(parseLines("#3 MC-B", undefined, CATALOG)).toEqual([{ kind: "quantity", quantity: 3, materialCode: "MC-B", direction: undefined }]);
  });

  it("without the catalog, as before: «#N CODE» is a quantity", () => {
    expect(parseLines("#1 KRD901305/11")).toEqual([{ kind: "quantity", quantity: 1, materialCode: "KRD901305/11", direction: undefined }]);
  });

  it("serial with its material code, and the summary under the box", () => {
    const lines = parseLines("SN-1 MC400100\n#1 KRD901305/11\n#2 MC400170", undefined, CATALOG);
    expect(lines[0]).toEqual({ kind: "serial", codeRaw: "SN-1", materialCode: "MC400100", direction: undefined });
    expect(countLines(lines)).toEqual({ serials: 2, quantities: 1 });
  });
});
