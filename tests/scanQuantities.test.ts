import { describe, it, expect } from "vitest";
import { quantityRows, type QtyReading } from "../src/lib/scan/quantities";

// P-188: the quantity lines "Scan" shows for the BOM of a site and the DDT of an arrival, counted on the phone's own
// readings with the server's comparison (P-191, D-79): a piece counts for a line when every field the line has (model,
// material code, normalized) is the piece's; a piece whose model is unknown is not counted; a piece that is a serial
// line of the same document is not counted by a quantity line; a piece a quantity line takes is not "not expected".
const r = (type: string, codeRaw: string, model: { modelId?: string | null; materialCode?: string | null } = {}, ddtId: string | null = null): QtyReading =>
  ({ type, codeId: `cid-${codeRaw}`, codeRaw, modelId: model.modelId ?? null, materialCode: model.materialCode ?? null, ddtId });
const RX = { modelId: "mod_rx100", materialCode: "MC400100" };
const counts = (x: { rows: Array<{ expected: number; counted: number }> }) => x.rows.map((q) => [q.expected, q.counted]);

describe("quantityRows / bom", () => {
  it("a line by material code counts the pieces of that model removed here (the pieces carry model and material code)", () => {
    const lines = [{ kind: "quantity", materialCode: "MC400100", quantity: 3, direction: "remove" }];
    expect(counts(quantityRows("bom", "B1", lines, [r("remove_at_site", "A", RX), r("remove_at_site", "B", RX)], "remove"))).toEqual([[3, 2]]);
  });
  it("only the lines of the direction shown", () => {
    const lines = [
      { kind: "quantity", materialCode: "MC400100", quantity: 3, direction: "remove" },
      { kind: "quantity", materialCode: "MC400100", quantity: 5, direction: "install" },
    ];
    expect(quantityRows("bom", "B1", lines, [], "install").rows.map((q) => q.expected)).toEqual([5]);
  });
  it("a piece whose model is unknown is not counted; another model is not counted", () => {
    const lines = [{ kind: "quantity", materialCode: "MC400100", quantity: 2, direction: "remove" }];
    const out = quantityRows("bom", "B1", lines, [r("remove_at_site", "A"), r("remove_at_site", "B", { modelId: "mod_x", materialCode: "MCX" })], "remove");
    expect(out.rows[0].counted).toBe(0);
  });
  it("D-79: a serial line of the same BOM is not counted by its quantity line", () => {
    const lines = [
      { kind: "serial", codeRaw: "A", codeId: "cid-A", materialCode: "MC400100", direction: "remove" },
      { kind: "quantity", materialCode: "MC400100", quantity: 2, direction: "remove" },
    ];
    expect(counts(quantityRows("bom", "B1", lines, [r("remove_at_site", "A", RX), r("remove_at_site", "B", RX)], "remove"))).toEqual([[2, 1]]);
  });
  it("D-79: pieces a quantity line takes are not «not expected», up to its quantity", () => {
    const lines = [{ kind: "quantity", materialCode: "MC400100", quantity: 1, direction: "remove" }];
    const out = quantityRows("bom", "B1", lines, [r("remove_at_site", "A", RX), r("remove_at_site", "B", RX)], "remove");
    expect(out.unexpected).toHaveLength(1);
  });
  it("no quantity line: nothing to show, and the screen keeps its own list of pieces not expected", () => {
    expect(quantityRows("bom", "B1", [{ kind: "serial", codeRaw: "A", codeId: "cid-A", direction: "remove" }], [r("remove_at_site", "A", RX)], "remove"))
      .toEqual({ rows: [], unexpected: null });
  });
});

describe("quantityRows / ddt_in", () => {
  it("arrivals with this DDT count for its quantity lines; an arrival without the DDT does not", () => {
    const lines = [{ kind: "quantity", materialCode: "MC400100", quantity: 4 }];
    const out = quantityRows("ddt_in", "D1", lines, [
      r("arrive_at_warehouse", "A", RX, "D1"), r("arrive_at_warehouse", "B", RX, "D1"), r("arrive_at_warehouse", "C", RX, null),
    ]);
    expect(counts(out)).toEqual([[4, 2]]);
    expect(out.unexpected).toEqual([]);
  });
});
