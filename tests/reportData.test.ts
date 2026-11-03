import { describe, it, expect } from "vitest";
import { computeReport, exportRow, inPeriod, capRows, type ReportEvent, type ReportInput } from "../functions/src/shared/reportData";

// SPEC §13.4 (D-38) and §13.3 (P-79, D-37). Expectations from the specification: received, installed, removed,
// sorted per category, returned, waiting beyond the threshold, alerts opened and closed, top models and sites,
// each ASP only with its own data; export filters and readable values in the user's language.
const NORD = "org_asp_nord", CENTRO = "org_asp_centro";
let n = 0;
const ev = (type: string, itemId: string | null, over: Partial<ReportEvent> = {}): ReportEvent =>
  ({ id: `e${++n}`, type, at: Date.UTC(2026, 9, 10) + n * 60_000, itemId, aspId: NORD, locationId: "loc_WH", codeRaw: `SN-${itemId}`, voided: false, payload: {}, ...over });
const base = (events: ReportEvent[], scope = NORD): ReportInput => ({
  scope, events, returnShipmentAsp: { sh_ret: NORD },
  itemModels: { a: "RX-100", b: "RX-100", c: "TX-200", d: "TX-200", e: "AN-5" },
  places: { loc_WH: { code: "MAG-N", name: "Magazzino Nord", type: "asp_warehouse" }, loc_S1: { code: "S-001", name: "Sito Uno", type: "site" } },
  categories: { cat_ref: "Ricondizionamento", cat_scrap: "Rottamazione" },
  orgNames: { [NORD]: "ASP Nord", [CENTRO]: "ASP Centro" },
  waiting: { newPieces: 3, removedPieces: 2, thresholdDays: 30 }, alerts: { opened: 4, closed: 1 },
});

describe("computeReport (§13.4)", () => {
  it("counts distinct pieces, not scans, and leaves out voided scans and void events", () => {
    const voided = ev("arrive_at_warehouse", "c", { voided: true });
    const r = computeReport(base([ev("arrive_at_warehouse", "a"), ev("arrive_at_warehouse", "a"), ev("arrive_at_warehouse", "b"), voided,
      ev("void", null, { payload: {} })]), "it");
    expect(r.summary.received).toBe(2);
    expect(r.byType).toEqual([["Arrivo in magazzino", 3]]);
  });
  it("sorted per category includes the arrivals sorted in the same pass and the new material classified", () => {
    const r = computeReport(base([
      ev("classify", "a", { payload: { categoryId: "cat_ref" } }), ev("arrive_at_warehouse", "b", { payload: { categoryId: "cat_ref" } }),
      ev("classify", "c", { payload: { categoryId: "cat_scrap" } }), ev("classify", "d", { payload: { newClass: "defective" } }),
      ev("classify", "a", { payload: { categoryId: "cat_ref" } }),
    ]), "it");
    expect(r.summary.sorted).toBe(4);
    expect(r.sortedByCategory).toEqual([["Ricondizionamento", 2], ["Difettoso", 1], ["Rottamazione", 1]]);
  });
  it("an ASP counts its returns (confirmed by the client with no aspId) and never another ASP's events", () => {
    const events = [ev("return_confirm", "a", { aspId: null, payload: { shipmentId: "sh_ret" } }),
      ev("return_confirm", "e", { aspId: null, payload: { shipmentId: "sh_other" } }), ev("install_at_site", "b", { aspId: CENTRO, locationId: "loc_S1" })];
    const nord = computeReport(base(events), "it");
    expect(nord.summary.returned).toBe(1);
    expect(nord.summary.installed).toBe(0);
    expect(nord.movements.map((m) => m.code)).toEqual(["SN-a"]);
    const client = computeReport(base(events, "client"), "it");
    expect(client.summary).toMatchObject({ returned: 2, installed: 1 });
  });
  it("waiting beyond the threshold and alerts come from the input; top models and sites by distinct pieces, at most 5", () => {
    const r = computeReport(base([ev("install_at_site", "a", { locationId: "loc_S1" }), ev("install_at_site", "b", { locationId: "loc_S1" }),
      ev("remove_at_site", "c", { locationId: "loc_S1" }), ev("arrive_at_warehouse", "d"), ev("arrive_at_warehouse", "e")]), "en");
    expect(r.summary).toMatchObject({ installed: 2, removed: 1, waitingNew: 3, waitingRemoved: 2, alertsOpened: 4, alertsClosed: 1 });
    expect(r.thresholdDays).toBe(30);
    expect(r.topModels).toEqual([["RX-100", 2], ["TX-200", 2], ["AN-5", 1]]);
    expect(r.topSites).toEqual([["S-001 Sito Uno", 3]]);
  });
  it("movements in words, with code, model, location and ASP names, never a person", () => {
    const r = computeReport(base([ev("arrive_at_warehouse", "a")]), "en");
    expect(r.movements[0]).toMatchObject({ type: "Arrival at warehouse", code: "SN-a", model: "RX-100", location: "MAG-N Magazzino Nord", asp: "ASP Nord" });
    expect(Object.keys(r.movements[0])).not.toContain("userId");
  });
});

describe("export (§13.3)", () => {
  it("period = last scan of the piece within [from, to] (D-37)", () => {
    expect(inPeriod(100, 50, 150)).toBe(true);
    expect(inPeriod(100, 101)).toBe(false);
    expect(inPeriod(null, 1)).toBe(false);
    expect(inPeriod(null)).toBe(true);
  });
  // P-114 n.36: the export stops at a maximum of rows and says so. Red before: no capRows, the cut was silent.
  it("at most `max` rows, and truncated says whether some were left out", () => {
    expect(capRows([1, 2, 3], 3)).toEqual({ rows: [1, 2, 3], truncated: false });
    expect(capRows([1, 2, 3, 4], 3)).toEqual({ rows: [1, 2, 3], truncated: true });
  });
  it("a row in the user's language: code, status and flow in words, place, ASP and category by name", () => {
    const row = exportRow({ id: "it1", status: "received_at_asp", flow: "new", model: "RX-100", currentLocationId: "loc_WH", currentAspId: NORD,
      sortingCategoryId: "cat_ref", lastScannedAt: Date.UTC(2026, 9, 10, 8, 30) }, "it", {
      codes: { it1: "SN-0001" }, places: { loc_WH: { code: "MAG-N", name: "Magazzino Nord", type: "asp_warehouse" } },
      orgNames: { [NORD]: "ASP Nord" }, categories: { cat_ref: "Ricondizionamento" },
    });
    expect(row).toMatchObject({ code: "SN-0001", status: "In magazzino ASP", flow: "Nuovo", location: "MAG-N Magazzino Nord", asp: "ASP Nord",
      sortingCategory: "Ricondizionamento", lastScanned: "2026-10-10 08:30", id: "it1" });
  });
});
