import { describe, it, expect } from "vitest";
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
  it("quantity lines are counted by (materialCode|modelId) across linked arrivals", () => {
    const lines = [s("A"), q(3, "MC-A")];
    const events = [
      ev("arrive_at_warehouse", "A", "DDT1", { materialCode: "MC-A" }),
      ev("arrive_at_warehouse", "B", "DDT1", { materialCode: "MC-A" }),
      ev("arrive_at_warehouse", "C", "DDT1", { materialCode: "MC-A" }),
    ];
    const r = compareDocument("ddt_in", "DDT1", lines, events);
    expect(r.quantities[0].expected).toBe(3);
    expect(r.quantities[0].counted).toBe(3);
    expect(r.unexpected.sort()).toEqual(["cid-B", "cid-C"]);
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
    expect(r.unexpected.sort()).toEqual(["cid-C", "cid-D"]);
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
