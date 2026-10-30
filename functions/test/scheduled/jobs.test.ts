import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { setupScheduled, NOW, DAY, type ScheduledEnv } from "./env";

// PIANO P-13: the scheduled jobs never start on the emulators by themselves; here each one runs by hand on known
// data and its result is checked against SPEC (§4.8 grace, R11 retention, §11.3/§11.4 daily checks, §13.1 recount,
// §13.4 monthly reports).
let t: ScheduledEnv;
type Doc = Record<string, unknown>;
const NORD = "org_asp_nord", CENTRO = "org_asp_centro";
const WH = "loc_S-MAG-NORD", SITE = "loc_S-SITO-NORD", SITE2 = "loc_S-SITO-NORD-2";
const ts = (ms: number) => Timestamp.fromMillis(ms);

beforeAll(async () => { t = await setupScheduled(); });
beforeEach(async () => { await t.clear(); });

const db = () => t.admin.db;
const set = (path: string, data: Doc) => db().doc(path).set(data);
const get = async (path: string) => (await db().doc(path).get()).data();
const item = (id: string, data: Doc) => set(`items/${id}`, {
  status: "received_at_asp", flow: "new", previousFlow: null, currentLocationId: WH, currentLocationType: "asp_warehouse",
  currentAspId: NORD, modelId: "mdl_A", equipmentType: "radio", manufacturer: "Acme", sortingCategoryId: null, currentRegion: null,
  lastScannedAt: ts(NOW - DAY), ...data,
});
const event = (id: string, data: Doc) => set(`events/${id}`, {
  type: "arrive_at_warehouse", locationId: WH, aspId: NORD, userId: "u1", scannedAt: ts(NOW - DAY), codeId: null, payload: {}, ...data,
});

describe("graceExpiry (§4.8)", () => {
  it("after 7 days the Auth account of a deactivated user is disabled; inside the grace period or deleted: untouched", async () => {
    const auth = t.admin.auth;
    for (const uid of ["g_old", "g_recent", "g_deleted"]) {
      await auth.deleteUser(uid).catch(() => undefined);
      await auth.createUser({ uid, email: `${uid}@swaptrack-demo.test` });
    }
    await set("users/g_old", { active: false, disabledAt: ts(NOW - 8 * DAY), authDisabled: false });
    await set("users/g_recent", { active: false, disabledAt: ts(NOW - 6 * DAY), authDisabled: false });
    await set("users/g_deleted", { active: false, disabledAt: ts(NOW - 30 * DAY), authDisabled: false, deleted: true });
    await t.jobs.runGraceExpiry(NOW);
    expect((await auth.getUser("g_old")).disabled).toBe(true);
    expect((await get("users/g_old"))!.authDisabled).toBe(true);
    expect((await auth.getUser("g_recent")).disabled).toBe(false);
    expect((await get("users/g_recent"))!.authDisabled).toBe(false);
    expect((await auth.getUser("g_deleted")).disabled).toBe(false);
  });
  it("P-55: when Auth fails the user is not marked, so the next run tries again; a missing Auth account is marked", async () => {
    await t.admin.auth.deleteUser("g_fail").catch(() => undefined);
    await t.admin.auth.createUser({ uid: "g_fail", email: "g_fail@swaptrack-demo.test" });
    await set("users/g_fail", { active: false, disabledAt: ts(NOW - 8 * DAY), authDisabled: false });
    const failing = { updateUser: async () => { throw Object.assign(new Error("unavailable"), { code: "auth/internal-error" }); } };
    await t.jobs.runGraceExpiry(NOW, failing as never);
    expect((await get("users/g_fail"))!.authDisabled).toBe(false);
    await set("users/g_none", { active: false, disabledAt: ts(NOW - 8 * DAY), authDisabled: false });
    await t.jobs.runGraceExpiry(NOW);
    expect((await get("users/g_none"))!.authDisabled).toBe(true);
    expect((await get("users/g_fail"))!.authDisabled).toBe(true);
    expect((await t.admin.auth.getUser("g_fail")).disabled).toBe(true);
  });
});

describe("retention (R11)", () => {
  it("off by default: nothing changes", async () => {
    await event("e_old", { scannedAt: ts(NOW - 400 * DAY) });
    await t.jobs.runRetention(NOW);
    expect((await get("events/e_old"))!.userId).toBe("u1");
  });
  it("when enabled, removes userId from events older than retentionDays only", async () => {
    await set("settings/privacy", { retentionEnabled: true, retentionDays: 30 });
    await event("e_old", { scannedAt: ts(NOW - 31 * DAY) });
    await event("e_new", { scannedAt: ts(NOW - 29 * DAY) });
    await t.jobs.runRetention(NOW);
    expect((await get("events/e_old"))!).not.toHaveProperty("userId");
    expect((await get("events/e_old"))!.type).toBe("arrive_at_warehouse");
    expect((await get("events/e_new"))!.userId).toBe("u1");
  });
});

describe("dailyChecks (§11.4 stale material and transfers, §11.3 BOM check without site_done)", () => {
  it("stale_material: one alert per warehouse and flow, counting only pieces older than staleDays (30)", async () => {
    await item("i_new_old", { lastScannedAt: ts(NOW - 31 * DAY) });
    await item("i_new_old2", { lastScannedAt: ts(NOW - 40 * DAY) });
    await item("i_new_fresh", { lastScannedAt: ts(NOW - 10 * DAY) });
    await item("i_sorted_old", { status: "sorted", flow: "removed", lastScannedAt: ts(NOW - 31 * DAY) });
    await item("i_defective_old", { status: "defective", lastScannedAt: ts(NOW - 35 * DAY) });
    await item("i_installed_old", { status: "installed", currentLocationId: SITE, currentLocationType: "site", lastScannedAt: ts(NOW - 90 * DAY) });
    await t.jobs.runDailyChecks(NOW);
    expect(await get(`alerts/stale-${WH}-new`)).toMatchObject({ kind: "stale_material", aspId: NORD, locationId: WH, flow: "new", count: 2 });
    expect(await get(`alerts/stale-${WH}-removed`)).toMatchObject({ kind: "stale_material", aspId: NORD, flow: "removed", count: 2 });
    expect(await get(`alerts/stale-${SITE}-new`)).toBeUndefined();
  });
  it("D-29: when the stale pieces are gone, the open alert goes to count 0 and stays open", async () => {
    await item("i_stale", { lastScannedAt: ts(NOW - 31 * DAY) });
    await t.jobs.runDailyChecks(NOW);
    expect((await get(`alerts/stale-${WH}-new`))!.count).toBe(1);
    await db().doc("items/i_stale").update({ status: "installed", currentLocationId: SITE, currentLocationType: "site" });
    await t.jobs.runDailyChecks(NOW + DAY);
    expect(await get(`alerts/stale-${WH}-new`)).toMatchObject({ count: 0, closedAt: null });
  });
  it("an alert found again keeps the date it was first created (every alert kind goes through upsertAlert)", async () => {
    await item("i_keep", { lastScannedAt: ts(NOW - 31 * DAY) });
    await t.jobs.runDailyChecks(NOW);
    const created = (await get(`alerts/stale-${WH}-new`))!.createdAt as Timestamp;
    await new Promise((r) => setTimeout(r, 1100));
    await t.jobs.runDailyChecks(NOW + DAY);
    const again = (await get(`alerts/stale-${WH}-new`))!;
    expect((again.createdAt as Timestamp).toMillis()).toBe(created.toMillis());
    expect((again.updatedAt as Timestamp).toMillis()).toBeGreaterThan(created.toMillis());
  });
  it("D-29: a transfer alert whose missing lines arrived later (shipment received) goes to count 0", async () => {
    await set("shipments/sh_t", { kind: "transfer", status: "sent", fromAspId: NORD, toAspId: CENTRO, toLocationId: "loc_S-MAG-CENTRO", sentAt: ts(NOW - 8 * DAY) });
    await set("shipments/sh_t/lines/i1", { codeRaw: "A" });
    await t.jobs.runDailyChecks(NOW);
    expect((await get("alerts/transfer-sh_t"))!.count).toBe(1);
    await db().doc("shipments/sh_t/lines/i1").update({ arrivedAt: ts(NOW) });
    await db().doc("shipments/sh_t").update({ status: "received" });
    await t.jobs.runDailyChecks(NOW + DAY);
    expect(await get("alerts/transfer-sh_t")).toMatchObject({ count: 0, closedAt: null, detail: { missing: 0 } });
  });
  it("transfer_difference: a transfer sent more than 7 days ago with lines not arrived", async () => {
    await set("shipments/sh_late", { kind: "transfer", status: "sent", fromAspId: NORD, toAspId: CENTRO, toLocationId: "loc_S-MAG-CENTRO", sentAt: ts(NOW - 8 * DAY) });
    await set("shipments/sh_late/lines/i1", { codeRaw: "A" });
    await set("shipments/sh_late/lines/i2", { codeRaw: "B", arrivedAt: ts(NOW - 2 * DAY) });
    await set("shipments/sh_recent", { kind: "transfer", status: "sent", fromAspId: NORD, toAspId: CENTRO, toLocationId: "loc_S-MAG-CENTRO", sentAt: ts(NOW - 3 * DAY) });
    await set("shipments/sh_recent/lines/i3", { codeRaw: "C" });
    await set("shipments/sh_done", { kind: "transfer", status: "sent", fromAspId: NORD, toAspId: CENTRO, toLocationId: "loc_S-MAG-CENTRO", sentAt: ts(NOW - 9 * DAY) });
    await set("shipments/sh_done/lines/i4", { codeRaw: "D", arrivedAt: ts(NOW - 5 * DAY) });
    await t.jobs.runDailyChecks(NOW);
    expect(await get("alerts/transfer-sh_late")).toMatchObject({ kind: "transfer_difference", aspId: NORD, shipmentId: "sh_late", count: 1 });
    expect(await get("alerts/transfer-sh_recent")).toBeUndefined();
    expect(await get("alerts/transfer-sh_done")).toBeUndefined();
  });
  it("BOM check of a site scanned 24-48 h ago with no site_done; a site closed with site_done is skipped", async () => {
    const bom = (id: string, site: string) => set(`documents/${id}`, { kind: "bom", aspId: NORD, locationId: site, status: "open", version: 1,
      createdAt: ts(NOW - 10 * DAY), lines: [{ kind: "serial", codeRaw: "X1", codeId: "cid_X1", direction: "install" }] });
    await bom("bom1", SITE);
    await bom("bom2", SITE2);
    await event("e_s1", { type: "install_at_site", locationId: SITE, codeId: "cid_OTHER", scannedAt: ts(NOW - 30 * 3600 * 1000) });
    await event("e_s2", { type: "install_at_site", locationId: SITE2, codeId: "cid_OTHER2", scannedAt: ts(NOW - 30 * 3600 * 1000) });
    await event("e_s2_done", { type: "site_done", locationId: SITE2, scannedAt: ts(NOW - 20 * 3600 * 1000) });
    await t.jobs.runDailyChecks(NOW);
    expect(await get("alerts/bom-bom1")).toMatchObject({ kind: "bom_difference", aspId: NORD, locationId: SITE, detail: { missing: 1, unexpected: 1 } });
    expect(await get("alerts/bom-bom2")).toBeUndefined();
  });
});

describe("nightlyRecount (§13.1)", () => {
  const counts = async (scope: string, dim: string) => {
    const out: Record<string, number> = {};
    for (let s = 0; s < 10; s++) {
      const c = ((await get(`aggregates/${scope}_${dim}_${s}`))?.counts ?? {}) as Record<string, number>;
      for (const [k, v] of Object.entries(c)) out[k] = (out[k] ?? 0) + v;
    }
    return out;
  };
  it("rewrites the aggregates from items, for the client and for each ASP, whatever the shards held", async () => {
    await item("a1", {});
    await item("a2", {});
    await item("a3", { status: "sorted", flow: "removed", currentAspId: CENTRO, currentLocationId: "loc_S-MAG-CENTRO" });
    await set(`aggregates/client_statusByFlow_4`, { scope: "client", dimension: "statusByFlow", shard: 4, counts: { "new|received_at_asp": 7 } });
    await t.jobs.runNightlyRecount();
    expect(await counts("client", "statusByFlow")).toEqual({ "new|received_at_asp": 2, "removed|sorted": 1 });
    expect(await counts(NORD, "statusByFlow")).toEqual({ "new|received_at_asp": 2 });
    expect(await counts(CENTRO, "statusByWarehouse")).toEqual({ "loc_S-MAG-CENTRO|sorted": 1 });
  });
  it("a dimension that has no piece any more is cleared, not left with its old counts", async () => {
    await item("b1", {});
    await set(`aggregates/${CENTRO}_statusByFlow_2`, { scope: CENTRO, dimension: "statusByFlow", shard: 2, counts: { "removed|sorted": 5 } });
    await set("aggregates/client_sortingCategory_0", { scope: "client", dimension: "sortingCategory", shard: 0, counts: { "cat_x|sorted": 3 } });
    await t.jobs.runNightlyRecount();
    expect(await counts(CENTRO, "statusByFlow")).toEqual({});
    expect(await counts("client", "sortingCategory")).toEqual({});
    expect(await counts("client", "statusByFlow")).toEqual({ "new|received_at_asp": 1 });
  });
  it("works with many ASPs (more than 400 aggregate documents to write)", async () => {
    const asps = Array.from({ length: 8 }, (_, i) => `org_asp_${i}`);
    for (const [i, asp] of asps.entries()) await item(`m${i}`, { currentAspId: asp, sortingCategoryId: "cat_r", currentRegion: "Nord" });
    await t.jobs.runNightlyRecount();
    for (const asp of asps) expect(await counts(asp, "statusByFlow")).toEqual({ "new|received_at_asp": 1 });
    expect(await counts("client", "statusByFlow")).toEqual({ "new|received_at_asp": 8 });
  });
});

describe("monthlyReports (§13.4)", () => {
  it("on 1 November: one PDF and one Excel of October per scope, an ASP counting only its own events", async () => {
    await set(`organizations/${NORD}`, { name: "ASP Nord", type: "asp", language: "en" });
    await set(`organizations/${CENTRO}`, { name: "ASP Centro", type: "asp", language: "it" });
    const oct = Date.UTC(2026, 9, 15);
    await event("r1", { type: "arrive_at_warehouse", scannedAt: ts(oct) });
    await event("r2", { type: "install_at_site", scannedAt: ts(oct) });
    await event("r3", { type: "arrive_at_warehouse", aspId: CENTRO, scannedAt: ts(oct) });
    await event("r_sep", { type: "arrive_at_warehouse", scannedAt: ts(Date.UTC(2026, 8, 30, 12)) });
    await event("r_nov", { type: "arrive_at_warehouse", scannedAt: ts(Date.UTC(2026, 10, 1, 1)) });
    await t.jobs.runMonthlyReports(new Date(NOW));
    const reports = (await db().collection("reports").get()).docs.map((d) => d.data());
    const of = (scope: string) => reports.find((r) => r.scope === scope)!;
    expect(reports.map((r) => r.scope).sort()).toEqual([CENTRO, NORD, "client"].sort());
    expect(of("client")).toMatchObject({ month: "2026-10", summary: { received: 2, installed: 1 } });
    expect(of(NORD)).toMatchObject({ month: "2026-10", language: "en", summary: { received: 1, installed: 1 } });
    expect(of(CENTRO)).toMatchObject({ month: "2026-10", summary: { received: 1, installed: 0 } });
    const bucket = t.admin.bucket();
    const [pdf] = await bucket.file(`reports/${NORD}/2026-10.pdf`).download();
    const [xlsx] = await bucket.file(`reports/${NORD}/2026-10.xlsx`).download();
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
  });
});
