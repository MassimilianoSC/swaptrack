import { describe, it, expect } from "vitest";
import { normalizeBarcode } from "../src/lib/codeId.js";
import { seedModels } from "../scripts/seedCatalog.mjs";
import { compareDocument, alertDetail, documentAlert, type Line, type EventFact } from "../functions/src/shared/documents";

const s = (codeRaw: string, modelId?: string, direction?: "remove" | "install"): Line =>
  ({ kind: "serial", codeRaw, codeId: `cid-${codeRaw}`, materialCode: null, modelId: modelId ?? null, direction });
const q = (quantity: number, materialCode = "MC-A", direction?: "remove" | "install"): Line => ({ kind: "quantity", materialCode, modelId: null, quantity, direction });
const ev = (type: string, codeRaw: string | null, ddtId?: string | null, extra: Partial<EventFact> = {}): EventFact => ({
  type, codeId: codeRaw ? `cid-${codeRaw}` : null, materialCode: null, modelId: null, itemModelKnown: true, ddtId: ddtId ?? null, ...extra,
});

describe("compareDocument / ddt_in", () => {
  it("arrival counts only when linked by ddtId or by a serial line (§11.3)", () => {
    const lines = [s("A"), s("B"), q(10)];
    const events = [ev("arrive_at_warehouse", "A", "DDT1"), ev("arrive_at_warehouse", "B"), ev("arrive_at_warehouse", "X", "DDT1"), ev("arrive_at_warehouse", "Y")];
    const r = compareDocument("ddt_in", "DDT1", lines, events);
    expect(r.arrived.sort()).toEqual(["A", "B"]);
    expect(r.missing).toEqual([]);
    expect(r.unexpected).toEqual(["cid-X"]);
    expect(r.totals.arrived).toBe(2);
  });
  // D-79: this case expected A (a serial line) counted in the quantity line too, and B and C both counted and
  // unexpected. A piece is counted once: A is its serial line; B and C are the quantity line's, not unexpected.
  it("quantity lines count the linked arrivals that are not serial lines; those pieces are not unexpected", () => {
    const lines = [s("A"), q(3, "MC-A")];
    const events = [
      ev("arrive_at_warehouse", "A", "DDT1", { materialCode: "MC-A" }),
      ev("arrive_at_warehouse", "B", "DDT1", { materialCode: "MC-A" }),
      ev("arrive_at_warehouse", "C", "DDT1", { materialCode: "MC-A" }),
    ];
    const r = compareDocument("ddt_in", "DDT1", lines, events);
    expect(r.quantities[0].expected).toBe(3);
    expect(r.quantities[0].counted).toBe(2);
    expect(r.arrived).toEqual(["A"]);
    expect(r.unexpected).toEqual([]);
  });
  it("counts arrived_model_unknown apart from quantity lines", () => {
    const lines = [s("A")];
    const events = [ev("arrive_at_warehouse", "A", "DDT1", { itemModelKnown: false })];
    const r = compareDocument("ddt_in", "DDT1", lines, events);
    expect(r.totals.arrivedModelUnknown).toBe(1);
  });
  it("arrivals at the same warehouse but neither ddtId nor expected serial are ignored", () => {
    const lines = [s("A")];
    const events = [ev("arrive_at_warehouse", "A"), ev("arrive_at_warehouse", "Z"), ev("arrive_at_warehouse", "A", "DDT1")];
    const r = compareDocument("ddt_in", "DDT1", lines, events);
    expect(r.arrived).toEqual(["A"]);
    expect(r.unexpected).toEqual([]);
  });
});

describe("compareDocument / ddt_return", () => {
  it("compares shipment serials with client confirmations (§11.3)", () => {
    const lines = [s("A"), s("B"), s("C")];
    const events = [ev("return_confirm", "A"), ev("return_confirm", "C"), ev("return_confirm", "Z")];
    const r = compareDocument("ddt_return", "DDT-R", lines, events);
    expect(r.arrived.sort()).toEqual(["A", "C"]);
    expect(r.missing).toEqual(["B"]);
    expect(r.unexpected).toEqual(["cid-Z"]);
  });
});

describe("compareDocument / bom", () => {
  it("separates by direction: remove and install (§11.3)", () => {
    const lines = [s("A", undefined, "remove"), s("B", undefined, "install"), q(2, "MC-A", "remove")];
    const events = [
      ev("remove_at_site", "A"), ev("install_at_site", "B"),
      ev("remove_at_site", "C", null, { materialCode: "MC-A" }),
      ev("remove_at_site", "D", null, { materialCode: "MC-A" }),
    ];
    const r = compareDocument("bom", "BOM1", lines, events);
    expect(r.arrived.sort()).toEqual(["A", "B"]);
    expect(r.missing).toEqual([]);
    expect(r.quantities[0].expected).toBe(2);
    expect(r.quantities[0].counted).toBe(2);
    expect(r.unexpected).toEqual([]); // D-79: C and D are the quantity line's (this case expected them unexpected too)
  });
  it("a serial expected to be removed but found installed counts as missing on remove and unexpected on install", () => {
    const lines = [s("A", undefined, "remove")];
    const events = [ev("install_at_site", "A")];
    const r = compareDocument("bom", "BOM1", lines, events);
    expect(r.missing).toEqual(["A"]);
    expect(r.unexpected).toEqual(["cid-A"]);
  });
  it("arrived_model_unknown reports expected serials where the piece has no model", () => {
    const lines = [s("A", undefined, "remove")];
    const events = [ev("remove_at_site", "A", null, { itemModelKnown: false })];
    const r = compareDocument("bom", "BOM1", lines, events);
    expect(r.totals.arrivedModelUnknown).toBe(1);
  });
});

// P-95, SPEC §11.4 "updated with the count and the list": the people reading the alert and the comparison must see
// which serials, as printed on the label (codeRaw), never the internal codeId. Red on 50600fa: unexpected pieces
// and pieces with unknown model came out as codeIds, and the alert kept the counts only.
describe("readable codes and the alert's lists (P-95)", () => {
  const raw = (type: string, codeRaw: string, ddtId?: string | null, extra: Partial<EventFact> = {}) => ev(type, codeRaw, ddtId, { codeRaw, ...extra });
  it("unexpected and unknown-model pieces are reported with the code read, for every kind of document", () => {
    const ddt = compareDocument("ddt_in", "DDT1", [s("A")], [raw("arrive_at_warehouse", "A", "DDT1", { itemModelKnown: false }), raw("arrive_at_warehouse", "X", "DDT1")]);
    expect([ddt.unexpected, ddt.arrivedModelUnknown]).toEqual([["X"], ["A"]]);
    const ret = compareDocument("ddt_return", "R1", [s("A")], [raw("return_confirm", "A"), raw("return_confirm", "Y")]);
    expect(ret.unexpected).toEqual(["Y"]);
    const bom = compareDocument("bom", "BOM1", [s("A", undefined, "remove")], [raw("remove_at_site", "A", null, { itemModelKnown: false }), raw("install_at_site", "Z")]);
    expect([bom.unexpected, bom.arrivedModelUnknown]).toEqual([["Z"], ["A"]]);
  });
  it("the alert detail has the totals and the lists, at most 50 codes each", () => {
    const lines = Array.from({ length: 60 }, (_, i) => s(`M${i}`));
    const r = compareDocument("ddt_in", "DDT1", lines, [raw("arrive_at_warehouse", "X", "DDT1")]);
    const d = alertDetail(r);
    expect(d).toMatchObject({ missing: 60, unexpected: 1, arrived: 0, arrivedModelUnknown: 0, unexpectedCodes: ["X"], modelUnknownCodes: [] });
    expect(d.missingCodes).toEqual(lines.slice(0, 50).map((l) => (l as { codeRaw: string }).codeRaw));
  });
});

describe("documentAlert: count and detail of a document alert (P-114 n.15)", () => {
  const r = compareDocument("bom", "B", [s("A", undefined, "install"), s("B", undefined, "install")], [ev("install_at_site", "A", null, { codeRaw: "A" }), ev("install_at_site", "X", null, { codeRaw: "X" })]);
  it("by default missing and unexpected pieces both count", () => {
    expect(documentAlert(r)).toMatchObject({ count: 2, detail: { missing: 1, unexpected: 1, unexpectedCodes: ["X"] } });
  });
  it("«accept silently»: the unexpected pieces neither count nor show; the missing ones do", () => {
    expect(documentAlert(r, { silentUnexpected: true })).toMatchObject({ count: 1, detail: { missing: 1, missingCodes: ["B"], unexpected: 0, unexpectedCodes: [] } });
  });
});

// P-191 (o3, read only): a quantity line saved by the app has the material code only ("#3 MC400170": modelId null),
// while a piece read carries both the model and the material code of the catalog (compareDocument and bomCheck build
// the facts from the item). The line's key "|MC400170|" never met the piece's "mdl_MC400170|MC400170|": counted 0.
// Rule (D-79): a piece counts for a quantity line when every field the line HAS agrees with the piece: modelId equal,
// materialCode equal after normalizeBarcode; in a BOM the direction too. A line with neither counts nothing.
describe("quantity lines: the line's fields against the piece's (P-191)", () => {
  const piece = (type: string, codeRaw: string, materialCode: string, ddtId: string | null = "DDT1") =>
    ev(type, codeRaw, ddtId, { materialCode, modelId: `mdl_${materialCode}` });
  it("ddt_in: a line with the material code only counts the pieces that also have their model", () => {
    const lines = [q(3, "MC400170"), q(2, "MC400205")];
    const events = [piece("arrive_at_warehouse", "P1", "MC400170"), piece("arrive_at_warehouse", "P2", "MC400170"), piece("arrive_at_warehouse", "P3", "MC400170"),
      piece("arrive_at_warehouse", "P4", "MC400205"), piece("arrive_at_warehouse", "P5", "MC400205")];
    expect(compareDocument("ddt_in", "DDT1", lines, events).quantities.map((x) => x.counted)).toEqual([3, 2]);
  });
  it("bom: the same, each direction on its own", () => {
    const lines = [q(2, "MC400170", "install"), q(1, "MC400170", "remove")];
    const events = [piece("install_at_site", "I1", "MC400170", null), piece("install_at_site", "I2", "MC400170", null), piece("remove_at_site", "R1", "MC400170", null)];
    expect(compareDocument("bom", "BOM1", lines, events).quantities.map((x) => x.counted)).toEqual([2, 1]);
  });
  it("a line with the model only, or with both, counts the same pieces; a line of another code counts none", () => {
    const byModel: Line = { kind: "quantity", materialCode: null, modelId: "mdl_MC400170", quantity: 2 };
    const both: Line = { kind: "quantity", materialCode: "MC400170", modelId: "mdl_MC400170", quantity: 2 };
    const other: Line = { kind: "quantity", materialCode: "MC400107", modelId: null, quantity: 2 };
    const empty: Line = { kind: "quantity", materialCode: null, modelId: null, quantity: 2 };
    const events = [piece("arrive_at_warehouse", "P1", "MC400170"), piece("arrive_at_warehouse", "P2", "MC400170")];
    // Each line on its own (in one document two lines of the same model share the pieces: each piece counts once).
    expect([byModel, both, other, empty].map((l) => compareDocument("ddt_in", "DDT1", [l], events).quantities[0].counted)).toEqual([2, 2, 0, 0]);
  });
  it("the material code is compared as normalizeBarcode reads it (spaces, dashes, lower case, control characters)", () => {
    const samples = ["MC400170", " MC400170 ", "MC400170\u001d", "\u0000MC-400170\t", "mc400170", "MC 400170", "MC-400170"];
    for (const line of samples) {
      for (const item of samples) {
        const events = [ev("arrive_at_warehouse", "P1", "DDT1", { materialCode: item, modelId: null })];
        const counted = compareDocument("ddt_in", "DDT1", [q(1, line)], events).quantities[0].counted;
        expect([line, item, counted]).toEqual([line, item, normalizeBarcode(line) === normalizeBarcode(item) ? 1 : 0]);
      }
    }
  });
});

// D-79 on the documents of the demo (scripts/demoDocs.mjs, the seed's models): a piece is counted once, and a piece
// of a quantity line is not unexpected. Red before: the quantity lines counted 0 (P-191); with the key alone repaired,
// TD-2026-0413 read «6 of 4» (its serials of the same model counted again) and TD-2026-0412's five pieces without a
// serial were all unexpected.
describe("the demo DDTs: each piece counted once (D-79)", () => {
  const M = seedModels();
  const fact = (codeRaw: string, m: { materialCode: string }, ddtId: string | null = "DDT1") =>
    ev("arrive_at_warehouse", codeRaw, ddtId, { codeRaw, materialCode: m.materialCode, modelId: `mdl_${m.materialCode}` });
  const serial = (codeRaw: string, m: { materialCode: string }): Line => ({ kind: "serial", codeRaw, codeId: `cid-${codeRaw}`, materialCode: m.materialCode, modelId: null });
  const qty = (m: { materialCode: string }, quantity: number): Line => ({ kind: "quantity", materialCode: m.materialCode, modelId: null, quantity });

  it("TD-2026-0412: 8 serials, 3 + 2 pieces without a serial: nothing missing, nothing unexpected, no alert", () => {
    const serials = Array.from({ length: 8 }, (_, i) => serial(`TD260412${String(i + 1).padStart(3, "0")}`, M[i]));
    const lines = [...serials, qty(M[10], 3), qty(M[15], 2)];
    const events = [
      ...serials.map((l, i) => fact((l as { codeRaw: string }).codeRaw, M[i], null)), // linked by their serial line
      ...[1, 2, 3].map((n) => fact(`NS-A${n}`, M[10])), ...[1, 2].map((n) => fact(`NS-B${n}`, M[15])),
    ];
    const r = compareDocument("ddt_in", "DDT1", lines, events);
    expect([r.quantities.map((x) => x.counted), r.unexpected, r.missing.length]).toEqual([[3, 2], [], 0]);
    expect(documentAlert(r).count).toBe(0);
  });
  it("TD-2026-0413: the serials of a model do not count for its quantity line («4 of 4», not «6 of 4»)", () => {
    const serials = Array.from({ length: 44 }, (_, i) => serial(`TD260413${String(i + 1).padStart(3, "0")}`, M[i % 20]));
    const lines = [...serials, qty(M[12], 4), qty(M[17], 6)];
    const events = [
      ...serials.map((l, i) => fact((l as { codeRaw: string }).codeRaw, M[i % 20])),
      ...[1, 2, 3, 4].map((n) => fact(`NS-C${n}`, M[12])), ...[1, 2, 3, 4, 5, 6].map((n) => fact(`NS-D${n}`, M[17])),
    ];
    const r = compareDocument("ddt_in", "DDT1", lines, events);
    expect([r.quantities.map((x) => x.counted), r.unexpected, r.missing.length]).toEqual([[4, 6], [], 0]);
  });
  it("beyond the quantity: counted says so, and the pieces after the first ones in code order stay unexpected", () => {
    const events = ["NS-E4", "NS-E2", "NS-E1", "NS-E3"].map((c) => fact(c, M[10]));
    const r = compareDocument("ddt_in", "DDT1", [qty(M[10], 2)], events);
    expect([r.quantities[0].counted, r.unexpected.sort()]).toEqual([4, ["NS-E3", "NS-E4"]]);
    expect(documentAlert(r).count).toBe(2 + 2); // two unexpected, and the quantity line off by two
  });
  it("a piece read twice counts once", () => {
    const events = [fact("NS-F1", M[10]), fact("NS-F1", M[10])];
    expect(compareDocument("ddt_in", "DDT1", [qty(M[10], 2)], events).quantities[0].counted).toBe(1);
  });
  it("bom: the INSTALL quantity line of the demo counts the installed pieces without a serial, not the removed ones", () => {
    const lines: Line[] = [{ ...serial("TD26R13001", M[0]), direction: "remove" }, { ...qty(M[11], 2), direction: "install" }];
    const bomFact = (type: string, codeRaw: string, m: { materialCode: string }) => ({ ...fact(codeRaw, m, null), type });
    const events = [bomFact("remove_at_site", "TD26R13001", M[0]), bomFact("install_at_site", "NS-G1", M[11]), bomFact("install_at_site", "NS-G2", M[11]), bomFact("remove_at_site", "NS-G3", M[11])];
    const r = compareDocument("bom", "BOM1", lines, events);
    expect([r.quantities[0].counted, r.unexpected]).toEqual([2, ["NS-G3"]]);
  });
});
