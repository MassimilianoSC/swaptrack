import { describe, it, expect, beforeAll } from "vitest";
import { setupTrigger, ev, LOC, NORD, CENTRO, RUN, type TriggerEnv } from "./env";

// PIANO P-62 / P-63, criterion 1: the callables read and write with the Admin SDK, so the rules do not protect
// them: an ASP role must never reach another ASP's data by passing its ids. Red on 3f26623: desk.listEvents let
// Nord list Centro's events by aspId, by location and by piece (piece ids taken from the aspId answer);
// client_warehouse got every event; forceState resolved any anomaly and moved pieces to another ASP's location;
// correctEventLocation moved an event to another ASP's location; markAlertSeen and compareDocument ignored the
// client_warehouse limits; asp_warehouse could upload a BOM.
let t: TriggerEnv;
type R = typeof import("../../src/routers/desk")["desk"] & typeof import("../../src/routers/items")["items"]
  & typeof import("../../src/routers/alerts")["alerts"] & typeof import("../../src/routers/documents")["documents"];
let ops: R;
type Ctx = Parameters<R["listEvents"]["handler"]>[0];
const ctxOf = (role: string, orgId: string) => ({ uid: `tt_${role}_${orgId}`, role, orgId, ip: "test", token: {} }) as Ctx;
const NA = ctxOf("asp_admin", NORD), NW = ctxOf("asp_warehouse", NORD), CW = ctxOf("client_warehouse", "org_client"), CA = ctxOf("client_admin", "org_client");
const SITE_C = `loc_TT-SITO-OWN-C-${RUN}`;
const denied = { code: expect.stringMatching(/permission-denied|not-found/) };
let centroItem: string, nordItem: string, nordArrival: string;

beforeAll(async () => {
  t = await setupTrigger();
  ops = { ...(await import("../../src/routers/desk")).desk, ...(await import("../../src/routers/items")).items,
    ...(await import("../../src/routers/alerts")).alerts, ...(await import("../../src/routers/documents")).documents } as R;
  await t.db.collection("locations").doc(SITE_C).set({ code: SITE_C, name: SITE_C, type: "site", aspId: CENTRO, active: true, region: "Test" });
  const c = await t.fire(ev("arrive_at_warehouse", `SN-${RUN}-OWNC`, { locationId: LOC.centroWh, aspId: CENTRO, orgId: CENTRO, userId: "tt_mw", payload: { flow: "new" } }));
  centroItem = (await t.db.collection("events").doc(c).get()).get("itemId");
  await t.fire(ev("install_at_site", `SN-${RUN}-OWNC2`, { locationId: SITE_C, aspId: CENTRO, orgId: CENTRO, userId: "tt_mt" }));
  nordArrival = await t.fire(ev("arrive_at_warehouse", `SN-${RUN}-OWNN`, { payload: { flow: "new" } }));
  nordItem = (await t.db.collection("events").doc(nordArrival).get()).get("itemId");
});

describe("desk.listEvents: an ASP lists its own events only (P-63)", () => {
  it("another ASP's id, location or piece is refused, also a piece id taken from an aspId answer", async () => {
    await expect(ops.listEvents.handler(NW, { aspId: CENTRO, max: 200 })).rejects.toMatchObject(denied);
    await expect(ops.listEvents.handler(NA, { locationId: SITE_C, max: 200 })).rejects.toMatchObject(denied);
    await expect(ops.listEvents.handler(NA, { locationId: LOC.centroWh, max: 200 })).rejects.toMatchObject(denied);
    await expect(ops.listEvents.handler(NW, { itemId: centroItem, max: 200 })).rejects.toMatchObject(denied);
  });
  it("its own filters still work, and without filters it gets only its ASP", async () => {
    const own = await ops.listEvents.handler(NW, { itemId: nordItem, max: 200 }) as { events: Array<{ aspId: string | null }> };
    expect(own.events.length).toBeGreaterThan(0);
    const all = await ops.listEvents.handler(NA, { max: 500 }) as { events: Array<{ aspId: string | null; itemId: string | null }> };
    expect(all.events.every((e) => e.aspId === NORD)).toBe(true);
    expect(all.events.map((e) => e.itemId)).not.toContain(centroItem);
  });
  it("client_warehouse has no event list (D-31): the role is refused by the router", () => {
    expect(ops.listEvents.roles).not.toContain("client_warehouse");
    expect(ops.listEvents.roles).toEqual(expect.arrayContaining(["client_admin", "client_office", "asp_admin", "asp_warehouse"]));
  });
});

describe("items: corrections never reach another ASP (P-62)", () => {
  it("forceState: not towards another ASP's location; not on an anomaly of another ASP or of another piece", async () => {
    await expect(ops.forceState.handler(NA, { itemId: nordItem, locationId: SITE_C, reason: "test" })).rejects.toMatchObject(denied);
    await t.db.collection("anomalies").doc(`tt_anom_c_${RUN}`).set({ type: "clock_suspicious", aspId: CENTRO, itemId: centroItem, resolution: null });
    await expect(ops.forceState.handler(NA, { itemId: nordItem, reason: "test", anomalyId: `tt_anom_c_${RUN}` })).rejects.toMatchObject(denied);
    expect((await t.db.collection("anomalies").doc(`tt_anom_c_${RUN}`).get()).get("resolution")).toBeNull();
    expect(ops.forceState.schema.safeParse({ itemId: nordItem, status: "not_a_status", reason: "test" }).success).toBe(false);
  });
  it("correctEventLocation: an ASP moves its event only to its own locations", async () => {
    await expect(ops.correctEventLocation.handler(NA, { eventId: nordArrival, locationId: LOC.centroWh, reason: "test" })).rejects.toMatchObject(denied);
    expect((await t.db.collection("events").doc(nordArrival).get()).get("locationId")).toBe(LOC.nordWh);
  });
});

describe("client_warehouse and asp_warehouse limits of §3.3 (P-62)", () => {
  it("markAlertSeen: client_warehouse only on return alerts", async () => {
    await t.db.collection("alerts").doc(`tt_alert_bom_${RUN}`).set({ kind: "bom_difference", aspId: NORD, seenAt: null });
    await expect(ops.markAlertSeen.handler(CW, { alertId: `tt_alert_bom_${RUN}` })).rejects.toMatchObject(denied);
    expect((await t.db.collection("alerts").doc(`tt_alert_bom_${RUN}`).get()).get("seenAt")).toBeNull();
  });
  it("compareDocument: client_warehouse only on return DDTs", async () => {
    await t.db.collection("documents").doc(`tt_doc_ddt_${RUN}`).set({ kind: "ddt_in", aspId: NORD, locationId: LOC.nordWh, lines: [] });
    await expect(ops.compareDocument.handler(CW, { documentId: `tt_doc_ddt_${RUN}` })).rejects.toMatchObject(denied);
    await expect(ops.compareDocument.handler(CA, { documentId: `tt_doc_ddt_${RUN}` })).resolves.toBeTruthy();
  });
  it("saveDocument: asp_warehouse uploads DDTs, not BOMs", async () => {
    await expect(ops.saveDocument.handler(NW, { kind: "bom", number: `B-OWN-${RUN}`, locationId: LOC.nordSite, linesSource: "manual", lines: [] })).rejects.toMatchObject(denied);
    await expect(ops.saveDocument.handler(NA, { kind: "bom", number: `B-OWN2-${RUN}`, locationId: LOC.nordSite, linesSource: "manual", lines: [] })).resolves.toBeTruthy();
  });
});

