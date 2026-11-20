import { describe, it, expect } from "vitest";
import { lineSchema, quantityOnlyLine, type InputLine } from "../functions/src/core/documentLines";

// P-223 (tester, SPEC §11.2): a line has a serial, or a material code (or model) with its quantity; never the quantity
// only. Before, the schema of saveDocument let a quantity line through without any code.
const parse = (l: unknown) => lineSchema.parse(l) as InputLine;

describe("the lines saveDocument accepts (P-223)", () => {
  it("a serial line, with or without its material code; a quantity line with a material code or a model", () => {
    const ok = [
      parse({ kind: "serial", codeRaw: "TD260412001" }),
      parse({ kind: "serial", codeRaw: "TD260412001", materialCode: "MC400170" }),
      parse({ kind: "quantity", materialCode: "MC400170", quantity: 3 }),
      parse({ kind: "quantity", modelId: "mdl_MC400170", quantity: 1 }),
    ];
    expect(quantityOnlyLine(ok)).toBe(-1);
  });
  it("a quantity line without material code and model is found (line_without_code), also with an empty or blank code", () => {
    for (const bad of [{ kind: "quantity", quantity: 3 }, { kind: "quantity", materialCode: "", quantity: 3 }, { kind: "quantity", materialCode: "   ", modelId: null, quantity: 2 }]) {
      const lines = [parse({ kind: "serial", codeRaw: "SN-1" }), parse(bad)];
      expect(quantityOnlyLine(lines)).toBe(1);
    }
  });
  it("the quantity stays a whole number from 1 to 100000; a serial is never empty", () => {
    for (const q of [0, -1, 1.5, 100001]) expect(lineSchema.safeParse({ kind: "quantity", materialCode: "MC1", quantity: q }).success).toBe(false);
    expect(lineSchema.safeParse({ kind: "serial", codeRaw: "  " }).success).toBe(false);
  });
});
