import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { setupScheduled, type ScheduledEnv } from "./env";

// SPEC §13.3, P-79, D-37. Red on f6c3a1b: the period filter (from/to) was accepted and ignored, there was no sorting
// category filter, and the rows carried internal ids (status codes, loc_…, org_…, cat_…) and no barcode.
let t: ScheduledEnv;
type Desk = typeof import("../../src/routers/desk")["desk"];
let desk: Desk;
const NORD = "org_asp_nord";
const CA = { uid: "u_ca", role: "client_admin", orgId: "org_client", ip: "test", token: {} } as Parameters<Desk["createExport"]["handler"]>[0];
const ts = (ms: number) => Timestamp.fromMillis(ms);
const OCT = (d: number) => Date.UTC(2026, 9, d, 12);

beforeAll(async () => {
  t = await setupScheduled("demo-export-tests");
  desk = (await import("../../src/routers/desk")).desk;
});
beforeEach(async () => {
  await t.clear();
  const db = t.admin.db;
  await db.doc(`organizations/${NORD}`).set({ name: "ASP Nord", type: "asp", language: "it" });
  await db.doc("locations/loc_MAG-N").set({ code: "MAG-N", name: "Magazzino Nord", type: "asp_warehouse", aspId: NORD });
  await db.doc("sortingCategories/cat_ref").set({ labels: { it: "Ricondizionamento", en: "Refurbish" }, active: true });
  const item = (id: string, day: number, over: Record<string, unknown> = {}) => db.doc(`items/${id}`).set({
    status: "sorted", flow: "removed", model: "RX-100", currentLocationId: "loc_MAG-N", currentAspId: NORD, sortingCategoryId: "cat_ref",
    lastScannedAt: ts(OCT(day)), ...over });
  await item("i_in", 10);
  await item("i_out", 25);
  await item("i_other", 12, { sortingCategoryId: "cat_scrap" });
  await db.doc("codes/c_in").set({ raw: "SN-IN-0001", itemId: "i_in", aspId: NORD, active: true });
  await db.doc("codes/c_old").set({ raw: "SN-OLD", itemId: "i_in", aspId: NORD, active: false, replacedBy: "c_in" });
});

const sheet = async (path: string) => {
  const [buf] = await t.admin.bucket().file(path).download();
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets[0].getSheetValues().slice(2).map((r) => (r as unknown[]).slice(1).map((v) => String(v ?? "")));
};

describe("createExport (§13.3)", () => {
  it("period = last scan within [from, to] and sorting category, both applied", async () => {
    const r = await desk.createExport.handler(CA, { scope: "client", from: OCT(1), to: OCT(20), sortingCategoryId: "cat_ref", language: "it" }) as { path: string; rowCount: number; truncated: boolean };
    expect([r.rowCount, r.truncated]).toEqual([1, false]); // P-114 n.36: the export says it was not cut
    const rows = await sheet(r.path);
    expect(rows.map((x) => x.at(-1))).toEqual(["i_in"]);
  });
  it("rows in the user's language: the label code first, words and names instead of ids, no person", async () => {
    const r = await desk.createExport.handler(CA, { scope: "client", from: OCT(1), to: OCT(20), sortingCategoryId: "cat_ref", language: "it" }) as { path: string };
    const [row] = await sheet(r.path);
    expect(row.slice(0, 4)).toEqual(["SN-IN-0001", "Smistato", "Smontato", "RX-100"]);
    expect(row).toEqual(expect.arrayContaining(["MAG-N Magazzino Nord", "ASP Nord", "Ricondizionamento"]));
    expect(row.join(" ")).not.toMatch(/loc_|org_|cat_|sorted|removed|u_ca/);
  });
});
