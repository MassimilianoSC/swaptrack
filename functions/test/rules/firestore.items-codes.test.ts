import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { setup, allow, deny, NORD, CENTRO, SUD, LOC, type Env } from "./env";

// SPEC §3.3 / R7: "own ASP" for items and codes = currentAspId or pendingAspId (aspId / pendingAspId on codes).
// Items and codes are created only by the trigger (R4): no client write.
let t: Env;
const IT = { nord: "it_T_nord", centro: "it_T_centro", sud: "it_T_sud", pendingNord: "it_T_pending_nord", nordNoModel: "it_T_nord_nomodel" };
const CODE = { nord: "c_T_nord", centro: "c_T_centro", pendingNord: "c_T_pending_nord", nordOld: "c_T_nord_old" };

beforeAll(async () => {
  t = await setup("items-codes");
  await t.seed(async (db) => {
    const item = (asp: string, pending: string | null, loc: string, extra: Record<string, unknown> = {}) => ({
      status: "received_at_asp", flow: "new", currentLocationId: loc, currentLocationType: "asp_warehouse", currentAspId: asp, pendingAspId: pending,
      modelId: "mdl_T1", needsModel: false, mergedInto: null, photoPaths: [], ...extra,
    });
    await setDoc(doc(db, "items", IT.nord), item(NORD, null, LOC.nordWh));
    await setDoc(doc(db, "items", IT.nordNoModel), item(NORD, null, LOC.nordWh, { modelId: null, needsModel: true }));
    await setDoc(doc(db, "items", IT.centro), item(CENTRO, null, LOC.centroWh));
    await setDoc(doc(db, "items", IT.sud), item(SUD, null, "loc_T-MAG-SUD"));
    // In transfer from Centro to Nord: both read it while in_transfer (§9.4).
    await setDoc(doc(db, "items", IT.pendingNord), item(CENTRO, NORD, LOC.centroWh, { status: "in_transfer" }));
    const code = (itemId: string, asp: string, pending: string | null, active = true) =>
      ({ raw: itemId, norm: itemId, normVersion: 1, itemId, aspId: asp, pendingAspId: pending, active, replacedBy: null });
    await setDoc(doc(db, "codes", CODE.nord), code(IT.nord, NORD, null));
    await setDoc(doc(db, "codes", CODE.nordOld), code(IT.nord, NORD, null, false));
    await setDoc(doc(db, "codes", CODE.centro), code(IT.centro, CENTRO, null));
    await setDoc(doc(db, "codes", CODE.pendingNord), code(IT.pendingNord, CENTRO, NORD));
  });
});
afterAll(() => t.env.cleanup());

describe("items: read", () => {
  it("client roles read every item, the whole list (watchItems) and the to-complete list", async () => {
    await allow(getDoc(doc(t.as("ca"), "items", IT.centro)));
    await allow(getDoc(doc(t.as("co"), "items", IT.sud)));
    await allow(getDoc(doc(t.as("cw"), "items", IT.nord)));
    const all = await allow(getDocs(query(collection(t.as("co"), "items"), limit(500))));
    expect(all.size).toBe(5);
    await allow(getDocs(query(collection(t.as("ca"), "items"), where("needsModel", "==", true), limit(500))));
  });
  it("Nord roles read Nord items and the item in transfer towards Nord, never Centro or Sud", async () => {
    for (const uid of ["na", "nw", "nt"] as const) {
      await allow(getDoc(doc(t.as(uid), "items", IT.nord)));
      await allow(getDoc(doc(t.as(uid), "items", IT.pendingNord)));
      await deny(getDoc(doc(t.as(uid), "items", IT.centro)));
      await deny(getDoc(doc(t.as(uid), "items", IT.sud)));
    }
    // The sender still reads the piece in transfer; a third ASP never does.
    await allow(getDoc(doc(t.as("mt"), "items", IT.pendingNord)));
    await deny(getDoc(doc(t.as("mt"), "items", IT.nord)));
  });
  it("Nord queries: by currentAspId, by pendingAspId, the to-complete list; never unfiltered or on another ASP", async () => {
    const own = await allow(getDocs(query(collection(t.as("nt"), "items"), where("currentAspId", "==", NORD))));
    expect(own.size).toBe(2);
    const pending = await allow(getDocs(query(collection(t.as("nt"), "items"), where("pendingAspId", "==", NORD))));
    expect(pending.size).toBe(1);
    const toComplete = await allow(getDocs(query(collection(t.as("nw"), "items"), where("currentAspId", "==", NORD), where("needsModel", "==", true), limit(500))));
    expect(toComplete.size).toBe(1);
    await deny(getDocs(collection(t.as("nw"), "items")));
    await deny(getDocs(query(collection(t.as("na"), "items"), where("currentAspId", "==", CENTRO))));
    await deny(getDocs(query(collection(t.as("nw"), "items"), where("needsModel", "==", true))));
    await deny(getDocs(query(collection(t.as("nw"), "items"), where("currentLocationId", "==", LOC.nordWh))));
  });
  it("inactive, in grace and anonymous read nothing", async () => {
    await deny(getDoc(doc(t.as("inactive"), "items", IT.nord)));
    await deny(getDoc(doc(t.as("ntGrace"), "items", IT.nord)));
    await deny(getDocs(query(collection(t.as("ntGrace"), "items"), where("currentAspId", "==", NORD))));
    await deny(getDoc(doc(t.anon, "items", IT.nord)));
  });
});

describe("items: write (R4: only the trigger)", () => {
  it("no role writes items from the client", async () => {
    await deny(setDoc(doc(t.as("nt"), "items", "it_T_new"), { status: "removed_at_site", currentAspId: NORD }));
    await deny(updateDoc(doc(t.as("nw"), "items", IT.nord), { modelId: "mdl_T2" }));
    await deny(updateDoc(doc(t.as("na"), "items", IT.nord), { status: "returned" }));
    await deny(updateDoc(doc(t.as("ca"), "items", IT.nord), { currentAspId: CENTRO }));
    await deny(deleteDoc(doc(t.as("ca"), "items", IT.nord)));
  });
});

describe("codes: read", () => {
  it("client roles read every code; a lookup by codeId is a get (searchItemByCode)", async () => {
    await allow(getDoc(doc(t.as("ca"), "codes", CODE.centro)));
    await allow(getDoc(doc(t.as("cw"), "codes", CODE.nord)));
    await allow(getDocs(collection(t.as("co"), "codes")));
  });
  it("Nord roles read Nord codes (active or replaced) and the code in transfer towards Nord, never Centro's", async () => {
    for (const uid of ["na", "nw", "nt"] as const) {
      await allow(getDoc(doc(t.as(uid), "codes", CODE.nord)));
      await allow(getDoc(doc(t.as(uid), "codes", CODE.nordOld)));
      await allow(getDoc(doc(t.as(uid), "codes", CODE.pendingNord)));
      await deny(getDoc(doc(t.as(uid), "codes", CODE.centro)));
    }
    // A get of a code that does not exist is allowed: the field needs "unknown code" as an answer.
    const missing = await allow(getDoc(doc(t.as("nt"), "codes", "c_T_unknown")));
    expect(missing.exists()).toBe(false);
  });
  it("Nord queries: by aspId (primeFieldCache) and by itemId of an own item (listCodesOf); never unfiltered or on another ASP's item", async () => {
    const own = await allow(getDocs(query(collection(t.as("nt"), "codes"), where("aspId", "==", NORD))));
    expect(own.size).toBe(2);
    await allow(getDocs(query(collection(t.as("nw"), "codes"), where("pendingAspId", "==", NORD))));
    const ofItem = await allow(getDocs(query(collection(t.as("nw"), "codes"), where("itemId", "==", IT.nord))));
    expect(ofItem.size).toBe(2);
    await allow(getDocs(query(collection(t.as("na"), "codes"), where("itemId", "==", IT.pendingNord))));
    await deny(getDocs(query(collection(t.as("nw"), "codes"), where("itemId", "==", IT.centro))));
    await deny(getDocs(query(collection(t.as("nw"), "codes"), where("itemId", "==", "it_T_missing"))));
    await deny(getDocs(collection(t.as("nw"), "codes")));
    await deny(getDocs(query(collection(t.as("na"), "codes"), where("aspId", "==", CENTRO))));
  });
  it("inactive and anonymous read nothing", async () => {
    await deny(getDoc(doc(t.as("inactive"), "codes", CODE.nord)));
    await deny(getDoc(doc(t.anon, "codes", CODE.nord)));
  });
});

describe("codes: write (R4: only the trigger)", () => {
  it("no role writes codes from the client", async () => {
    await deny(setDoc(doc(t.as("nt"), "codes", "c_T_new"), { raw: "x", itemId: IT.nord, aspId: NORD, active: true }));
    await deny(updateDoc(doc(t.as("na"), "codes", CODE.nord), { active: false }));
    await deny(updateDoc(doc(t.as("ca"), "codes", CODE.nord), { aspId: CENTRO }));
    await deny(deleteDoc(doc(t.as("ca"), "codes", CODE.nord)));
  });
});
