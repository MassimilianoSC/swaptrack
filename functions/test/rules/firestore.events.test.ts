import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  Timestamp, collection, doc, getDoc, getDocs, query, where, orderBy, limit, setDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch,
} from "firebase/firestore";
import { setup, allow, deny, NORD, CENTRO, LOC, GRACE_AT, type Env, type Uid } from "./env";

// SPEC §8.1: the security rules on events/create check ONLY the listed conditions (R6);
// events are readable directly only by their author (R11); never updated or deleted by clients.
let t: Env;
const NOW = Date.UTC(2026, 9, 29, 10, 0, 0);

type Ev = Record<string, unknown>;
// A valid event of the given type, as the app writes it (createdAt = serverTimestamp).
function ev(uid: Uid, type: string, over: Ev = {}): Ev {
  const orgId = uid.startsWith("m") ? CENTRO : NORD;
  const technician = type === "remove_at_site" || type === "install_at_site" || type === "site_done";
  const locationId = orgId === NORD ? (technician ? LOC.nordSite : LOC.nordWh) : (technician ? LOC.centroSite : LOC.centroWh);
  const base: Ev = {
    type, codeRaw: "SN-T-0001", codeId: "c_SN-T-0001", normVersion: 1, secondCodeRaw: null, locationId, aspId: orgId,
    scannedAt: Timestamp.fromMillis(NOW), clockOffsetMs: 0, offsetMeasuredAt: Timestamp.fromMillis(NOW), userId: uid, orgId,
    source: "camera", engine: "fallback", payload: {}, createdAt: serverTimestamp(),
  };
  if (type === "site_done" || type === "void") { base.codeRaw = null; base.codeId = null; }
  if (type === "void") base.payload = { targetEventId: randomUUID() };
  if (type === "relabel") base.payload = { oldCodeRaw: "SN-T-0000" };
  if (type === "classify") base.payload = { categoryId: "cat_t" };
  if (type === "transfer_out" || type === "return_ship") base.payload = { shipmentId: "sh_t" };
  return { ...base, ...over };
}
const create = (uid: Uid, data: Ev, id = randomUUID()) => setDoc(doc(t.as(uid), "events", id), data);

beforeAll(async () => {
  t = await setup("events");
  await t.seed(async (db) => {
    const seeded = (uid: string, orgId: string, at: number) => ({
      type: "remove_at_site", codeRaw: "SN-S", codeId: "c_SN-S", normVersion: 1, locationId: orgId === NORD ? LOC.nordSite : LOC.centroSite,
      aspId: orgId, scannedAt: Timestamp.fromMillis(at), clockOffsetMs: 0, offsetMeasuredAt: null, userId: uid, orgId, source: "camera",
      engine: null, payload: {}, createdAt: Timestamp.fromMillis(at + 1), processedAt: Timestamp.fromMillis(at + 2), itemId: "it_x", outcome: "ok",
    });
    await setDoc(doc(db, "events", "ev-nt-1"), seeded("nt", NORD, NOW - 3600_000));
    await setDoc(doc(db, "events", "ev-nt-2"), seeded("nt", NORD, NOW - 7200_000));
    await setDoc(doc(db, "events", "ev-nt2-1"), seeded("nt2", NORD, NOW - 3600_000));
    await setDoc(doc(db, "events", "ev-mt-1"), seeded("mt", CENTRO, NOW - 3600_000));
    await setDoc(doc(db, "events", "ev-grace-1"), seeded("ntGrace", NORD, NOW - 3600_000));
    await setDoc(doc(db, "events", "ev-inactive-1"), seeded("inactive", NORD, NOW - 3600_000));
  });
});
afterAll(() => t.env.cleanup());

describe("events/create: allowed (§3.3 types by role, §8.1 checks)", () => {
  it("technician: remove_at_site, install_at_site, site_done, relabel, void at a site of the own ASP", async () => {
    await allow(create("nt", ev("nt", "remove_at_site")));
    await allow(create("nt", ev("nt", "install_at_site")));
    await allow(create("nt", ev("nt", "site_done")));
    await allow(create("nt", ev("nt", "relabel", { locationId: LOC.nordSite })));
    await allow(create("nt", ev("nt", "void", { locationId: LOC.nordSite })));
    await allow(create("mt", ev("mt", "remove_at_site")));
  });
  it("warehouse and asp_admin: arrive_at_warehouse, classify, transfer_out, return_ship, relabel, void", async () => {
    await allow(create("nw", ev("nw", "arrive_at_warehouse")));
    await allow(create("nw", ev("nw", "arrive_at_warehouse", { payload: { flow: "new", ddtId: "d1", categoryId: "cat_t", modelId: "m", shipmentId: "sh" } })));
    await allow(create("nw", ev("nw", "classify")));
    await allow(create("nw", ev("nw", "classify", { payload: { newClass: "defective", suggestedCategoryId: null } })));
    await allow(create("nw", ev("nw", "classify", { payload: { newClass: "leftover" } })));
    await allow(create("nw", ev("nw", "transfer_out")));
    await allow(create("nw", ev("nw", "return_ship")));
    await allow(create("nw", ev("nw", "relabel")));
    await allow(create("nw", ev("nw", "void")));
    await allow(create("na", ev("na", "arrive_at_warehouse")));
    await allow(create("na", ev("na", "classify")));
    await allow(create("ma", ev("ma", "return_ship")));
  });
  it("optional fields: secondCodeRaw absent, engine null, source wedge or manual, remove_at_site with modelId", async () => {
    const e = ev("nt", "remove_at_site", { engine: null, source: "wedge", payload: { modelId: "mdl_T1" } });
    delete e.secondCodeRaw;
    await allow(create("nt", e));
    await allow(create("nt", ev("nt", "remove_at_site", { source: "manual", engine: "native", secondCodeRaw: "MC-1" })));
  });
  it("a burst (batch) of valid events is accepted; one invalid event rejects the whole batch", async () => {
    const db = t.as("nw");
    const ok = writeBatch(db);
    for (let i = 0; i < 3; i++) ok.set(doc(db, "events", randomUUID()), ev("nw", "arrive_at_warehouse", { codeRaw: `SN-B-${i}`, codeId: `c_SN-B-${i}` }));
    await allow(ok.commit());
    const bad = writeBatch(db);
    bad.set(doc(db, "events", randomUUID()), ev("nw", "arrive_at_warehouse"));
    bad.set(doc(db, "events", randomUUID()), ev("nw", "remove_at_site"));
    await deny(bad.commit());
  });
  it("deactivation with grace (§4.8): a user in grace sends scans made before disabledAt, not after", async () => {
    await allow(create("ntGrace", ev("ntGrace", "remove_at_site", { scannedAt: Timestamp.fromMillis(GRACE_AT - 60_000) })));
    await allow(create("ntGrace", ev("ntGrace", "remove_at_site", { scannedAt: Timestamp.fromMillis(GRACE_AT) })));
    await allow(create("nwGrace", ev("nwGrace", "arrive_at_warehouse", { scannedAt: Timestamp.fromMillis(GRACE_AT - 1) })));
    await deny(create("ntGrace", ev("ntGrace", "remove_at_site", { scannedAt: Timestamp.fromMillis(GRACE_AT + 1) })));
    await deny(create("ntGrace", ev("ntGrace", "remove_at_site", { scannedAt: Timestamp.fromMillis(NOW) })));
  });
});

describe("events/create: denied", () => {
  it("client roles never create events (the confirmation is a callable)", async () => {
    for (const uid of ["ca", "co", "cw"] as Uid[]) {
      await deny(create(uid, ev(uid, "arrive_at_warehouse", { locationId: LOC.clientWh, aspId: "org_client", orgId: "org_client" })));
      await deny(create(uid, ev(uid, "return_confirm", { locationId: LOC.clientWh, aspId: null, orgId: "org_client", payload: { shipmentId: "sh" } })));
    }
  });
  it("a type that is not for the role", async () => {
    await deny(create("nt", ev("nt", "arrive_at_warehouse")));
    await deny(create("nt", ev("nt", "classify")));
    await deny(create("nt", ev("nt", "transfer_out")));
    await deny(create("nw", ev("nw", "remove_at_site")));
    await deny(create("nw", ev("nw", "install_at_site")));
    await deny(create("nw", ev("nw", "site_done")));
    await deny(create("na", ev("na", "remove_at_site")));
  });
  it("server-only types: return_confirm and force_state", async () => {
    await deny(create("nw", ev("nw", "return_confirm", { payload: { shipmentId: "sh" } })));
    await deny(create("na", ev("na", "force_state", { payload: { status: "returned", reason: "x" } })));
    await deny(create("nt", ev("nt", "force_state", { payload: { status: "returned", reason: "x" } })));
  });
  it("identity: userId, orgId, aspId must be the caller's", async () => {
    await deny(create("nt", ev("nt", "remove_at_site", { userId: "nt2" })));
    await deny(create("nt", ev("nt", "remove_at_site", { orgId: CENTRO })));
    await deny(create("nt", ev("nt", "remove_at_site", { aspId: CENTRO })));
    await deny(create("nw", ev("nw", "arrive_at_warehouse", { aspId: CENTRO, orgId: CENTRO, userId: "mw" })));
  });
  it("inactive user, anonymous, user in grace scanning after disabledAt", async () => {
    await deny(create("inactive", ev("inactive", "remove_at_site", { scannedAt: Timestamp.fromMillis(NOW - 10 * 86_400_000) })));
    await deny(setDoc(doc(t.anon, "events", randomUUID()), ev("nt", "remove_at_site")));
  });
  it("document id must be a UUID", async () => {
    await deny(create("nt", ev("nt", "remove_at_site"), "not-a-uuid"));
    await deny(create("nt", ev("nt", "remove_at_site"), "ev-nt-9"));
    await deny(create("nt", ev("nt", "remove_at_site"), randomUUID().toUpperCase()));
  });
  it("server-only fields and unknown keys are refused", async () => {
    for (const k of ["itemId", "processedAt", "outcome", "voided", "scannedAtEffective"]) {
      await deny(create("nt", ev("nt", "remove_at_site", { [k]: k === "voided" ? true : "x" })));
    }
    await deny(create("nt", ev("nt", "remove_at_site", { photoPaths: [] })));
    await deny(create("nt", ev("nt", "remove_at_site", { extra: 1 })));
  });
  it("required fields missing", async () => {
    for (const k of ["type", "locationId", "aspId", "scannedAt", "clockOffsetMs", "userId", "orgId", "source", "normVersion", "payload", "createdAt"]) {
      const e = ev("nt", "remove_at_site");
      delete e[k];
      await deny(create("nt", e));
    }
  });
  it("location must exist (existence never regresses, R6)", async () => {
    await deny(create("nt", ev("nt", "remove_at_site", { locationId: "loc_T-MISSING" })));
    await deny(create("nw", ev("nw", "arrive_at_warehouse", { locationId: "" })));
  });
  it("createdAt must be the server time; source server is never accepted from a client", async () => {
    await deny(create("nt", ev("nt", "remove_at_site", { createdAt: Timestamp.fromMillis(NOW) })));
    await deny(create("nt", ev("nt", "remove_at_site", { createdAt: null })));
    await deny(create("nt", ev("nt", "remove_at_site", { source: "server" })));
    await deny(create("nt", ev("nt", "remove_at_site", { source: "api" })));
  });
  it("field types: scannedAt timestamp, clockOffsetMs number, normVersion int, engine in the list, payload a map", async () => {
    await deny(create("nt", ev("nt", "remove_at_site", { scannedAt: NOW })));
    await deny(create("nt", ev("nt", "remove_at_site", { scannedAt: "2026-10-29" })));
    await deny(create("nt", ev("nt", "remove_at_site", { clockOffsetMs: "0" })));
    await deny(create("nt", ev("nt", "remove_at_site", { normVersion: 1.5 })));
    await deny(create("nt", ev("nt", "remove_at_site", { normVersion: "1" })));
    await deny(create("nt", ev("nt", "remove_at_site", { engine: "zxing" })));
    await deny(create("nt", ev("nt", "remove_at_site", { payload: null })));
    await deny(create("nt", ev("nt", "remove_at_site", { payload: "x" })));
    await deny(create("nt", ev("nt", "remove_at_site", { locationId: 12 })));
  });
  it("the code: present and sane for every type with a code", async () => {
    await deny(create("nt", ev("nt", "remove_at_site", { codeRaw: "" })));
    await deny(create("nt", ev("nt", "remove_at_site", { codeRaw: null })));
    await deny(create("nt", ev("nt", "remove_at_site", { codeRaw: "A".repeat(2001) })));
    await deny(create("nt", ev("nt", "remove_at_site", { codeId: "" })));
    await deny(create("nt", ev("nt", "remove_at_site", { codeId: null })));
    await deny(create("nw", ev("nw", "classify", { codeRaw: "" })));
    await deny(create("nw", ev("nw", "transfer_out", { codeId: null })));
    await deny(create("nt", ev("nt", "relabel", { codeRaw: "" })));
    await allow(create("nt", ev("nt", "remove_at_site", { codeRaw: "A".repeat(2000) })));
  });
  it("payload required by the type", async () => {
    await deny(create("nt", ev("nt", "relabel", { payload: {} })));
    await deny(create("nt", ev("nt", "relabel", { payload: { oldCodeRaw: 1 } })));
    await deny(create("nw", ev("nw", "classify", { payload: {} })));
    await deny(create("nw", ev("nw", "classify", { payload: { newClass: "broken" } })));
    await deny(create("nw", ev("nw", "transfer_out", { payload: {} })));
    await deny(create("nw", ev("nw", "return_ship", { payload: { shipmentId: null } })));
    await deny(create("nw", ev("nw", "void", { payload: {} })));
    await deny(create("nt", ev("nt", "void", { payload: { targetEventId: 5 } })));
  });
});

describe("events/read: only the author (R11)", () => {
  it("the author reads their own events, by id and with the app's queries", async () => {
    await allow(getDoc(doc(t.as("nt"), "events", "ev-nt-1")));
    // The seeded events plus those created above by nt: all of them are nt's.
    const mine = await allow(getDocs(query(collection(t.as("nt"), "events"), where("userId", "==", "nt"), orderBy("scannedAt", "desc"), limit(500))));
    expect(mine.size).toBeGreaterThanOrEqual(2);
    expect(mine.docs.every((d) => d.get("userId") === "nt")).toBe(true);
    const start = NOW - 5400_000;
    const today = await allow(getDocs(query(collection(t.as("nt"), "events"), where("userId", "==", "nt"),
      where("scannedAt", ">=", Timestamp.fromMillis(start)), orderBy("scannedAt", "desc"))));
    expect(today.docs.some((d) => d.id === "ev-nt-1")).toBe(true);
    expect(today.docs.some((d) => d.id === "ev-nt-2")).toBe(false);
    await allow(getDoc(doc(t.as("mt"), "events", "ev-mt-1")));
  });
  it("a colleague of the same ASP, the ASP admin, the client roles: no direct read", async () => {
    await deny(getDoc(doc(t.as("nt2"), "events", "ev-nt-1")));
    await deny(getDoc(doc(t.as("na"), "events", "ev-nt-1")));
    await deny(getDoc(doc(t.as("nw"), "events", "ev-nt-1")));
    await deny(getDoc(doc(t.as("ca"), "events", "ev-nt-1")));
    await deny(getDoc(doc(t.as("co"), "events", "ev-mt-1")));
    await deny(getDoc(doc(t.as("mt"), "events", "ev-nt-1")));
  });
  it("queries on other people's events or without the author filter are refused", async () => {
    await deny(getDocs(query(collection(t.as("nt"), "events"), where("userId", "==", "nt2"))));
    await deny(getDocs(query(collection(t.as("na"), "events"), where("aspId", "==", NORD))));
    await deny(getDocs(query(collection(t.as("ca"), "events"), where("aspId", "==", NORD))));
    await deny(getDocs(collection(t.as("ca"), "events")));
    await deny(getDocs(collection(t.as("nt"), "events")));
    await deny(getDocs(query(collection(t.as("nt"), "events"), where("locationId", "==", LOC.nordSite))));
  });
  it("inactive and in-grace users read nothing, not even their own; anonymous neither", async () => {
    await deny(getDoc(doc(t.as("inactive"), "events", "ev-inactive-1")));
    await deny(getDoc(doc(t.as("ntGrace"), "events", "ev-grace-1")));
    await deny(getDocs(query(collection(t.as("ntGrace"), "events"), where("userId", "==", "ntGrace"))));
    await deny(getDoc(doc(t.anon, "events", "ev-nt-1")));
  });
});

describe("events: never updated or deleted by clients (append-only, R3)", () => {
  it("the author cannot update or delete their own event", async () => {
    await deny(updateDoc(doc(t.as("nt"), "events", "ev-nt-1"), { codeRaw: "changed" }));
    await deny(updateDoc(doc(t.as("nt"), "events", "ev-nt-1"), { voided: true }));
    await deny(deleteDoc(doc(t.as("nt"), "events", "ev-nt-1")));
  });
  it("client_admin and asp_admin cannot either", async () => {
    await deny(updateDoc(doc(t.as("ca"), "events", "ev-nt-1"), { outcome: "ok" }));
    await deny(deleteDoc(doc(t.as("ca"), "events", "ev-nt-1")));
    await deny(updateDoc(doc(t.as("na"), "events", "ev-nt-1"), { locationId: LOC.nordWh }));
  });
});
