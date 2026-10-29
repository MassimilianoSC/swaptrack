import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { setup, allow, deny, NORD, CENTRO, LOC, type Env } from "./env";

// SPEC §3.3: alerts, anomalies, aggregates, reports, exports. All written by the server only.
let t: Env;
const IT = { nord: "it_T_nord", centro: "it_T_centro" };

beforeAll(async () => {
  t = await setup("alerts-aggregates");
  await t.seed(async (db) => {
    const alert = (kind: string, aspId: string) => ({ kind, aspId, locationId: null, documentId: null, shipmentId: null, detail: {}, count: 1, createdAt: new Date(), updatedAt: new Date(), seenAt: null, closedAt: null, closedNote: null });
    await setDoc(doc(db, "alerts", "al_T_nord_stale"), alert("stale_material", NORD));
    await setDoc(doc(db, "alerts", "al_T_nord_return"), alert("ddt_return_difference", NORD));
    await setDoc(doc(db, "alerts", "al_T_centro_stale"), alert("stale_material", CENTRO));
    await setDoc(doc(db, "alerts", "al_T_centro_return"), alert("ddt_return_difference", CENTRO));
    await setDoc(doc(db, "items", IT.nord), { status: "received_at_asp", currentAspId: NORD, pendingAspId: null, currentLocationId: LOC.nordWh });
    await setDoc(doc(db, "items", IT.centro), { status: "received_at_asp", currentAspId: CENTRO, pendingAspId: null, currentLocationId: LOC.centroWh });
    const anomaly = (aspId: string, itemId: string | null) => ({ type: "late_event", eventId: null, codeId: null, itemId, locationId: null, aspId, detail: "late_event", openedAt: new Date(), resolution: null, resolvedAt: null, resolvedBy: null });
    await setDoc(doc(db, "anomalies", "an_T_nord"), anomaly(NORD, IT.nord));
    await setDoc(doc(db, "anomalies", "an_T_nord_noitem"), anomaly(NORD, null));
    await setDoc(doc(db, "anomalies", "an_T_centro"), anomaly(CENTRO, IT.centro));
    const agg = (scope: string) => ({ scope, dimension: "statusByFlow", shard: 0, counts: { "new|received_at_asp": 1 } });
    await setDoc(doc(db, "aggregates", "client_statusByFlow_0"), agg("client"));
    await setDoc(doc(db, "aggregates", `${NORD}_statusByFlow_0`), agg(NORD));
    await setDoc(doc(db, "aggregates", `${CENTRO}_statusByFlow_0`), agg(CENTRO));
    const report = (scope: string) => ({ scope, month: "2026-09", language: "it", pdfPath: `reports/${scope}/2026-09.pdf`, xlsxPath: `reports/${scope}/2026-09.xlsx`, createdAt: new Date() });
    await setDoc(doc(db, "reports", "rp_T_client"), report("client"));
    await setDoc(doc(db, "reports", "rp_T_nord"), report(NORD));
    await setDoc(doc(db, "reports", "rp_T_centro"), report(CENTRO));
    const exp = (scope: string, createdBy: string) => ({ scope, createdBy, path: `exports/${scope}/1.xlsx`, rowCount: 1, language: "it", createdAt: new Date() });
    await setDoc(doc(db, "exports", "ex_T_ca"), exp("client", "ca"));
    await setDoc(doc(db, "exports", "ex_T_co"), exp("client", "co"));
    await setDoc(doc(db, "exports", "ex_T_na"), exp(NORD, "na"));
    await setDoc(doc(db, "exports", "ex_T_ma"), exp(CENTRO, "ma"));
  });
});
afterAll(() => t.env.cleanup());

describe("alerts (§11.4)", () => {
  it("client_admin and client_office read every alert and the whole inbox (watchAlerts)", async () => {
    await allow(getDoc(doc(t.as("ca"), "alerts", "al_T_centro_stale")));
    await allow(getDoc(doc(t.as("co"), "alerts", "al_T_nord_return")));
    const all = await allow(getDocs(query(collection(t.as("co"), "alerts"), orderBy("updatedAt", "desc"), limit(500))));
    expect(all.size).toBe(4);
  });
  it("client_warehouse: return-shipment differences only", async () => {
    await allow(getDoc(doc(t.as("cw"), "alerts", "al_T_nord_return")));
    await allow(getDoc(doc(t.as("cw"), "alerts", "al_T_centro_return")));
    await deny(getDoc(doc(t.as("cw"), "alerts", "al_T_nord_stale")));
    const inbox = await allow(getDocs(query(collection(t.as("cw"), "alerts"), where("kind", "==", "ddt_return_difference"), orderBy("updatedAt", "desc"), limit(500))));
    expect(inbox.size).toBe(2);
    await deny(getDocs(query(collection(t.as("cw"), "alerts"), orderBy("updatedAt", "desc"))));
  });
  it("Nord admin and warehouse: own alerts only; technicians none", async () => {
    for (const uid of ["na", "nw"] as const) {
      await allow(getDoc(doc(t.as(uid), "alerts", "al_T_nord_stale")));
      await deny(getDoc(doc(t.as(uid), "alerts", "al_T_centro_stale")));
      const own = await allow(getDocs(query(collection(t.as(uid), "alerts"), where("aspId", "==", NORD), orderBy("updatedAt", "desc"), limit(500))));
      expect(own.size).toBe(2);
      await deny(getDocs(collection(t.as(uid), "alerts")));
      await deny(getDocs(query(collection(t.as(uid), "alerts"), where("aspId", "==", CENTRO))));
    }
    await deny(getDoc(doc(t.as("nt"), "alerts", "al_T_nord_stale")));
    await deny(getDocs(query(collection(t.as("nt"), "alerts"), where("aspId", "==", NORD))));
    await deny(getDoc(doc(t.anon, "alerts", "al_T_nord_stale")));
  });
  it("seen and closed go through callables: no client write", async () => {
    await deny(updateDoc(doc(t.as("ca"), "alerts", "al_T_nord_stale"), { seenAt: new Date() }));
    await deny(updateDoc(doc(t.as("na"), "alerts", "al_T_nord_stale"), { closedAt: new Date() }));
    await deny(setDoc(doc(t.as("na"), "alerts", "al_T_new"), { kind: "stale_material", aspId: NORD }));
    await deny(deleteDoc(doc(t.as("ca"), "alerts", "al_T_nord_stale")));
  });
});

describe("anomalies (§8.3)", () => {
  it("client_admin and client_office read every anomaly and the whole inbox (watchAnomalies)", async () => {
    await allow(getDoc(doc(t.as("ca"), "anomalies", "an_T_centro")));
    await allow(getDoc(doc(t.as("co"), "anomalies", "an_T_nord")));
    const all = await allow(getDocs(query(collection(t.as("co"), "anomalies"), orderBy("openedAt", "desc"), limit(500))));
    expect(all.size).toBe(3);
    await allow(getDocs(query(collection(t.as("ca"), "anomalies"), where("itemId", "==", IT.centro), orderBy("openedAt", "desc"), limit(50))));
  });
  it("client_warehouse reads no anomaly", async () => {
    await deny(getDoc(doc(t.as("cw"), "anomalies", "an_T_nord")));
    await deny(getDocs(query(collection(t.as("cw"), "anomalies"), orderBy("openedAt", "desc"))));
  });
  it("Nord admin and warehouse: own anomalies, by ASP and by own item (listAnomaliesOf); technicians none", async () => {
    for (const uid of ["na", "nw"] as const) {
      await allow(getDoc(doc(t.as(uid), "anomalies", "an_T_nord")));
      await allow(getDoc(doc(t.as(uid), "anomalies", "an_T_nord_noitem")));
      await deny(getDoc(doc(t.as(uid), "anomalies", "an_T_centro")));
      const own = await allow(getDocs(query(collection(t.as(uid), "anomalies"), where("aspId", "==", NORD), limit(500))));
      expect(own.size).toBe(2);
      const ofItem = await allow(getDocs(query(collection(t.as(uid), "anomalies"), where("itemId", "==", IT.nord), orderBy("openedAt", "desc"), limit(50))));
      expect(ofItem.size).toBe(1);
      await deny(getDocs(query(collection(t.as(uid), "anomalies"), where("itemId", "==", IT.centro), orderBy("openedAt", "desc"), limit(50))));
      await deny(getDocs(collection(t.as(uid), "anomalies")));
      await deny(getDocs(query(collection(t.as(uid), "anomalies"), where("aspId", "==", CENTRO))));
    }
    await deny(getDoc(doc(t.as("nt"), "anomalies", "an_T_nord")));
    await deny(getDocs(query(collection(t.as("nt"), "anomalies"), where("aspId", "==", NORD))));
  });
  it("resolution goes through callables: no client write", async () => {
    await deny(updateDoc(doc(t.as("ca"), "anomalies", "an_T_nord"), { resolution: "manual" }));
    await deny(updateDoc(doc(t.as("na"), "anomalies", "an_T_nord"), { resolution: "manual" }));
    await deny(deleteDoc(doc(t.as("ca"), "anomalies", "an_T_nord")));
  });
});

describe("aggregates (§13.1)", () => {
  it("client_admin and client_office read every scope", async () => {
    await allow(getDoc(doc(t.as("ca"), "aggregates", `${NORD}_statusByFlow_0`)));
    await allow(getDoc(doc(t.as("co"), "aggregates", "client_statusByFlow_0")));
    await allow(getDocs(query(collection(t.as("co"), "aggregates"), where("scope", "==", CENTRO))));
    await allow(getDocs(collection(t.as("ca"), "aggregates")));
  });
  it("asp_admin reads its own scope only; warehouse, technician and client_warehouse none", async () => {
    await allow(getDoc(doc(t.as("na"), "aggregates", `${NORD}_statusByFlow_0`)));
    await allow(getDocs(query(collection(t.as("na"), "aggregates"), where("scope", "==", NORD))));
    await deny(getDoc(doc(t.as("na"), "aggregates", `${CENTRO}_statusByFlow_0`)));
    await deny(getDoc(doc(t.as("na"), "aggregates", "client_statusByFlow_0")));
    await deny(getDocs(query(collection(t.as("na"), "aggregates"), where("scope", "==", "client"))));
    await deny(getDocs(collection(t.as("na"), "aggregates")));
    await deny(getDoc(doc(t.as("nw"), "aggregates", `${NORD}_statusByFlow_0`)));
    await deny(getDoc(doc(t.as("nt"), "aggregates", `${NORD}_statusByFlow_0`)));
    await deny(getDoc(doc(t.as("cw"), "aggregates", "client_statusByFlow_0")));
  });
  it("written only by the trigger and the nightly recount", async () => {
    await deny(updateDoc(doc(t.as("ca"), "aggregates", "client_statusByFlow_0"), { counts: {} }));
    await deny(setDoc(doc(t.as("na"), "aggregates", `${NORD}_statusByFlow_1`), { scope: NORD, counts: {} }));
  });
});

describe("reports (§13.4)", () => {
  it("client roles office/admin read every scope (listReports)", async () => {
    await allow(getDoc(doc(t.as("ca"), "reports", "rp_T_nord")));
    await allow(getDoc(doc(t.as("co"), "reports", "rp_T_centro")));
    await allow(getDocs(query(collection(t.as("co"), "reports"), where("scope", "==", NORD), orderBy("createdAt", "desc"), limit(200))));
    await allow(getDocs(query(collection(t.as("ca"), "reports"), where("scope", "==", "client"), orderBy("createdAt", "desc"), limit(200))));
  });
  it("asp_admin reads the reports of its ASP only; warehouse, technician, client_warehouse none", async () => {
    await allow(getDoc(doc(t.as("na"), "reports", "rp_T_nord")));
    await allow(getDocs(query(collection(t.as("na"), "reports"), where("scope", "==", NORD), orderBy("createdAt", "desc"), limit(200))));
    await deny(getDoc(doc(t.as("na"), "reports", "rp_T_centro")));
    await deny(getDoc(doc(t.as("na"), "reports", "rp_T_client")));
    await deny(getDocs(query(collection(t.as("na"), "reports"), where("scope", "==", "client"))));
    await deny(getDocs(collection(t.as("na"), "reports")));
    await deny(getDoc(doc(t.as("nw"), "reports", "rp_T_nord")));
    await deny(getDoc(doc(t.as("nt"), "reports", "rp_T_nord")));
    await deny(getDoc(doc(t.as("cw"), "reports", "rp_T_client")));
  });
  it("written only by the server", async () => {
    await deny(setDoc(doc(t.as("ca"), "reports", "rp_T_new"), { scope: "client", month: "2026-10" }));
    await deny(deleteDoc(doc(t.as("ca"), "reports", "rp_T_client")));
  });
});

describe("exports (§13.3): only the person who created the export", () => {
  it("client_admin and client_office read and list their own exports (listMyExports)", async () => {
    await allow(getDoc(doc(t.as("ca"), "exports", "ex_T_ca")));
    await allow(getDoc(doc(t.as("co"), "exports", "ex_T_co")));
    const mine = await allow(getDocs(query(collection(t.as("ca"), "exports"), where("createdBy", "==", "ca"), orderBy("createdAt", "desc"), limit(50))));
    expect(mine.size).toBe(1);
    await deny(getDoc(doc(t.as("ca"), "exports", "ex_T_co")));
    await deny(getDoc(doc(t.as("ca"), "exports", "ex_T_na")));
    await deny(getDocs(collection(t.as("ca"), "exports")));
    await deny(getDocs(query(collection(t.as("ca"), "exports"), where("createdBy", "==", "co"))));
  });
  it("asp_admin reads and lists its own exports; another ASP's admin and the warehouse roles none", async () => {
    await allow(getDoc(doc(t.as("na"), "exports", "ex_T_na")));
    const mine = await allow(getDocs(query(collection(t.as("na"), "exports"), where("createdBy", "==", "na"), orderBy("createdAt", "desc"), limit(50))));
    expect(mine.size).toBe(1);
    await deny(getDoc(doc(t.as("na"), "exports", "ex_T_ma")));
    await deny(getDoc(doc(t.as("na"), "exports", "ex_T_ca")));
    await deny(getDocs(query(collection(t.as("ma"), "exports"), where("createdBy", "==", "na"))));
    await deny(getDoc(doc(t.as("nw"), "exports", "ex_T_na")));
    await deny(getDoc(doc(t.as("cw"), "exports", "ex_T_ca")));
  });
  it("written only by the server", async () => {
    await deny(setDoc(doc(t.as("ca"), "exports", "ex_T_new"), { scope: "client", createdBy: "ca" }));
    await deny(deleteDoc(doc(t.as("na"), "exports", "ex_T_na")));
  });
});
