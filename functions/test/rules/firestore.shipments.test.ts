import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { setup, allow, deny, NORD, CENTRO, SUD, LOC, type Env } from "./env";

// SPEC §3.3 "Read shipments": client_admin/office all; client_warehouse return shipments; ASP warehouse roles
// fromAspId or toAspId = own; technicians none. Lines follow the shipment. Writes: callables and the trigger only.
let t: Env;
const SH = { nordReturn: "sh_T_nord_ret", nordInner: "sh_T_nord_inner", centroToNord: "sh_T_centro_nord", centroToSud: "sh_T_centro_sud", centroReturn: "sh_T_centro_ret" };

beforeAll(async () => {
  t = await setup("shipments");
  await t.seed(async (db) => {
    const sh = (kind: "return" | "transfer", from: string, to: string | null, fromLoc: string, toLoc: string) => ({
      kind, fromLocationId: fromLoc, fromAspId: from, toLocationId: toLoc, toAspId: to, status: "sent", itemCount: 1, createdBy: "x", ddtNumber: null, createdAt: new Date(),
    });
    await setDoc(doc(db, "shipments", SH.nordReturn), sh("return", NORD, null, LOC.nordWh, LOC.clientWh));
    await setDoc(doc(db, "shipments", SH.nordInner), sh("transfer", NORD, NORD, LOC.nordWh, LOC.nordWh));
    await setDoc(doc(db, "shipments", SH.centroToNord), sh("transfer", CENTRO, NORD, LOC.centroWh, LOC.nordWh));
    await setDoc(doc(db, "shipments", SH.centroToSud), sh("transfer", CENTRO, SUD, LOC.centroWh, "loc_T-MAG-SUD"));
    await setDoc(doc(db, "shipments", SH.centroReturn), sh("return", CENTRO, null, LOC.centroWh, LOC.clientWh));
    for (const [id, s] of Object.entries(SH)) {
      const parent = (await getDoc(doc(db, "shipments", s))).data()!;
      await setDoc(doc(db, "shipments", s, "lines", `it_${id}`), { codeRaw: `SN-${id}`, model: null, addedAt: new Date(), kind: parent.kind, fromAspId: parent.fromAspId, toAspId: parent.toAspId });
    }
  });
});
afterAll(() => t.env.cleanup());

describe("shipments: read", () => {
  it("client_admin and client_office read every shipment, the whole list (watchShipments) and every line", async () => {
    await allow(getDoc(doc(t.as("ca"), "shipments", SH.centroToSud)));
    await allow(getDoc(doc(t.as("co"), "shipments", SH.nordReturn)));
    const all = await allow(getDocs(query(collection(t.as("co"), "shipments"), orderBy("createdAt", "desc"), limit(500))));
    expect(all.size).toBe(5);
    await allow(getDocs(query(collection(t.as("ca"), "shipments", SH.centroToSud, "lines"), orderBy("addedAt", "asc"))));
  });
  it("client_warehouse: return shipments and their lines only", async () => {
    await allow(getDoc(doc(t.as("cw"), "shipments", SH.nordReturn)));
    await allow(getDoc(doc(t.as("cw"), "shipments", SH.centroReturn)));
    await deny(getDoc(doc(t.as("cw"), "shipments", SH.nordInner)));
    await deny(getDoc(doc(t.as("cw"), "shipments", SH.centroToNord)));
    const returns = await allow(getDocs(query(collection(t.as("cw"), "shipments"), where("kind", "==", "return"))));
    expect(returns.size).toBe(2);
    await deny(getDocs(query(collection(t.as("cw"), "shipments"), orderBy("createdAt", "desc"), limit(500))));
    await allow(getDocs(query(collection(t.as("cw"), "shipments", SH.nordReturn, "lines"), orderBy("addedAt", "asc"))));
    await deny(getDocs(query(collection(t.as("cw"), "shipments", SH.centroToNord, "lines"), orderBy("addedAt", "asc"))));
  });
  it("Nord warehouse roles: shipments sent or received by Nord, with their lines; never Centro to Sud or Centro returns", async () => {
    for (const uid of ["na", "nw"] as const) {
      await allow(getDoc(doc(t.as(uid), "shipments", SH.nordReturn)));
      await allow(getDoc(doc(t.as(uid), "shipments", SH.nordInner)));
      await allow(getDoc(doc(t.as(uid), "shipments", SH.centroToNord)));
      await deny(getDoc(doc(t.as(uid), "shipments", SH.centroToSud)));
      await deny(getDoc(doc(t.as(uid), "shipments", SH.centroReturn)));
      await allow(getDocs(query(collection(t.as(uid), "shipments", SH.centroToNord, "lines"), orderBy("addedAt", "asc"))));
      await allow(getDocs(query(collection(t.as(uid), "shipments", SH.nordReturn, "lines"), orderBy("addedAt", "asc"))));
      await deny(getDocs(query(collection(t.as(uid), "shipments", SH.centroToSud, "lines"), orderBy("addedAt", "asc"))));
      await deny(getDocs(query(collection(t.as(uid), "shipments", SH.centroReturn, "lines"), orderBy("addedAt", "asc"))));
    }
    const sent = await allow(getDocs(query(collection(t.as("nw"), "shipments"), where("fromAspId", "==", NORD))));
    expect(sent.size).toBe(2);
    const incoming = await allow(getDocs(query(collection(t.as("nw"), "shipments"), where("toAspId", "==", NORD))));
    expect(incoming.size).toBe(2);
    await deny(getDocs(collection(t.as("nw"), "shipments")));
    await deny(getDocs(query(collection(t.as("na"), "shipments"), where("fromAspId", "==", CENTRO))));
    await deny(getDocs(query(collection(t.as("na"), "shipments"), where("kind", "==", "return"))));
  });
  it("technicians, inactive users and anonymous read no shipment", async () => {
    await deny(getDoc(doc(t.as("nt"), "shipments", SH.nordReturn)));
    await deny(getDocs(query(collection(t.as("nt"), "shipments"), where("fromAspId", "==", NORD))));
    await deny(getDocs(collection(t.as("nt"), "shipments", SH.nordInner, "lines")));
    await deny(getDoc(doc(t.as("inactive"), "shipments", SH.nordReturn)));
    await deny(getDoc(doc(t.as("nwGrace"), "shipments", SH.nordReturn)));
    await deny(getDoc(doc(t.anon, "shipments", SH.nordReturn)));
  });
});

describe("shipments: write (callables and trigger only)", () => {
  it("no role creates, sends, cancels or confirms from the client", async () => {
    await deny(setDoc(doc(t.as("nw"), "shipments", "sh_T_new"), { kind: "return", fromAspId: NORD, toAspId: null, status: "draft" }));
    await deny(updateDoc(doc(t.as("nw"), "shipments", SH.nordReturn), { status: "cancelled" }));
    await deny(updateDoc(doc(t.as("na"), "shipments", SH.nordReturn), { ddtNumber: "X" }));
    await deny(updateDoc(doc(t.as("cw"), "shipments", SH.nordReturn), { status: "confirmed" }));
    await deny(updateDoc(doc(t.as("ca"), "shipments", SH.centroToNord), { status: "received" }));
    await deny(deleteDoc(doc(t.as("ca"), "shipments", SH.nordInner)));
  });
  it("lines are written only by the server", async () => {
    await deny(setDoc(doc(t.as("nw"), "shipments", SH.nordReturn, "lines", "it_new"), { codeRaw: "X", addedAt: new Date() }));
    await deny(updateDoc(doc(t.as("cw"), "shipments", SH.nordReturn, "lines", "it_nordReturn"), { missing: true }));
    await deny(deleteDoc(doc(t.as("ca"), "shipments", SH.nordReturn, "lines", "it_nordReturn")));
  });
});
