import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { setup, allow, deny, NORD, CENTRO, LOC, type Env } from "./env";

// SPEC §3.3 / §11: documents (DDT, BOM), document mappings, expected codes. Written by callables only.
let t: Env;
const D = { nordDdtIn: "d_T_nord_ddtin", nordBom: "d_T_nord_bom", nordDdtRet: "d_T_nord_ddtret", centroDdtIn: "d_T_centro_ddtin", centroBom: "d_T_centro_bom", centroDdtRet: "d_T_centro_ddtret" };

beforeAll(async () => {
  t = await setup("documents");
  await t.seed(async (db) => {
    const d = (kind: string, aspId: string, locationId: string) => ({ kind, number: `N-${kind}-${aspId}`, aspId, locationId, files: [], lines: [], linesSource: "manual", version: 1, status: "open", createdAt: new Date(), history: [] });
    await setDoc(doc(db, "documents", D.nordDdtIn), d("ddt_in", NORD, LOC.nordWh));
    await setDoc(doc(db, "documents", D.nordBom), d("bom", NORD, LOC.nordSite));
    await setDoc(doc(db, "documents", D.nordDdtRet), d("ddt_return", NORD, LOC.nordWh));
    await setDoc(doc(db, "documents", D.centroDdtIn), d("ddt_in", CENTRO, LOC.centroWh));
    await setDoc(doc(db, "documents", D.centroBom), d("bom", CENTRO, LOC.centroSite));
    await setDoc(doc(db, "documents", D.centroDdtRet), d("ddt_return", CENTRO, LOC.centroWh));
    const m = (kind: string, scope: string) => ({ kind, scope, mapping: { code: "A" } });
    await setDoc(doc(db, "documentMappings", `ddt_in_${NORD}`), m("ddt_in", NORD));
    await setDoc(doc(db, "documentMappings", `bom_${NORD}`), m("bom", NORD));
    await setDoc(doc(db, "documentMappings", `ddt_in_${CENTRO}`), m("ddt_in", CENTRO));
    await setDoc(doc(db, "documentMappings", "ddt_in_client"), m("ddt_in", "client"));
    const ec = (aspId: string, documentId: string, locationId: string) => ({ codeId: `c_${documentId}`, documentId, kind: "ddt_in", aspId, locationId, materialCode: null, modelId: null, direction: null });
    await setDoc(doc(db, "expectedCodes", `c_${D.nordDdtIn}_${D.nordDdtIn}`), ec(NORD, D.nordDdtIn, LOC.nordWh));
    await setDoc(doc(db, "expectedCodes", `c_${D.centroDdtIn}_${D.centroDdtIn}`), ec(CENTRO, D.centroDdtIn, LOC.centroWh));
  });
});
afterAll(() => t.env.cleanup());

describe("documents (§3.3 / §11)", () => {
  it("client_admin and client_office read every document and the whole list (watchDocuments)", async () => {
    await allow(getDoc(doc(t.as("ca"), "documents", D.centroBom)));
    await allow(getDoc(doc(t.as("co"), "documents", D.nordDdtRet)));
    const all = await allow(getDocs(query(collection(t.as("co"), "documents"), orderBy("createdAt", "desc"), limit(500))));
    expect(all.size).toBe(6);
  });
  it("client_warehouse: return DDTs only", async () => {
    await allow(getDoc(doc(t.as("cw"), "documents", D.nordDdtRet)));
    await allow(getDoc(doc(t.as("cw"), "documents", D.centroDdtRet)));
    await deny(getDoc(doc(t.as("cw"), "documents", D.nordDdtIn)));
    await deny(getDoc(doc(t.as("cw"), "documents", D.nordBom)));
    const returns = await allow(getDocs(query(collection(t.as("cw"), "documents"), where("kind", "==", "ddt_return"))));
    expect(returns.size).toBe(2);
    await deny(getDocs(query(collection(t.as("cw"), "documents"), orderBy("createdAt", "desc"), limit(500))));
  });
  it("Nord admin and warehouse: every document of Nord, never Centro's", async () => {
    for (const uid of ["na", "nw"] as const) {
      await allow(getDoc(doc(t.as(uid), "documents", D.nordDdtIn)));
      await allow(getDoc(doc(t.as(uid), "documents", D.nordBom)));
      await allow(getDoc(doc(t.as(uid), "documents", D.nordDdtRet)));
      await deny(getDoc(doc(t.as(uid), "documents", D.centroDdtIn)));
      await deny(getDoc(doc(t.as(uid), "documents", D.centroBom)));
      const own = await allow(getDocs(query(collection(t.as(uid), "documents"), where("aspId", "==", NORD), orderBy("createdAt", "desc"), limit(500))));
      expect(own.size).toBe(3);
      await allow(getDocs(query(collection(t.as(uid), "documents"), where("aspId", "==", NORD), where("kind", "==", "bom"))));
      await deny(getDocs(collection(t.as(uid), "documents")));
      await deny(getDocs(query(collection(t.as(uid), "documents"), where("aspId", "==", CENTRO))));
      await deny(getDocs(query(collection(t.as(uid), "documents"), where("kind", "==", "bom"))));
    }
  });
  it("technician: BOMs of own ASP sites only, with the one query of primeFieldCache", async () => {
    await allow(getDoc(doc(t.as("nt"), "documents", D.nordBom)));
    await deny(getDoc(doc(t.as("nt"), "documents", D.nordDdtIn)));
    await deny(getDoc(doc(t.as("nt"), "documents", D.nordDdtRet)));
    await deny(getDoc(doc(t.as("nt"), "documents", D.centroBom)));
    const boms = await allow(getDocs(query(collection(t.as("nt"), "documents"), where("aspId", "==", NORD), where("kind", "==", "bom"))));
    expect(boms.size).toBe(1);
    await deny(getDocs(query(collection(t.as("nt"), "documents"), where("aspId", "==", NORD))));
    await deny(getDocs(query(collection(t.as("nt"), "documents"), where("kind", "==", "bom"))));
    await deny(getDocs(query(collection(t.as("nt"), "documents"), where("kind", "==", "bom"), where("locationId", "==", LOC.nordSite))));
    await deny(getDocs(query(collection(t.as("nt"), "documents"), where("aspId", "==", CENTRO), where("kind", "==", "bom"))));
  });
  it("inactive, in grace and anonymous read nothing", async () => {
    await deny(getDoc(doc(t.as("inactive"), "documents", D.nordBom)));
    await deny(getDoc(doc(t.as("ntGrace"), "documents", D.nordBom)));
    await deny(getDoc(doc(t.anon, "documents", D.nordBom)));
  });
  it("saved, checked and closed only through callables: no client write", async () => {
    await deny(setDoc(doc(t.as("nw"), "documents", "d_T_new"), { kind: "ddt_in", aspId: NORD, locationId: LOC.nordWh, lines: [] }));
    await deny(updateDoc(doc(t.as("na"), "documents", D.nordDdtIn), { status: "checked" }));
    await deny(updateDoc(doc(t.as("ca"), "documents", D.nordDdtIn), { lines: [] }));
    await deny(deleteDoc(doc(t.as("ca"), "documents", D.nordDdtIn)));
  });
});

describe("documentMappings (§11.2)", () => {
  it("client_admin reads every mapping and lists them", async () => {
    await allow(getDoc(doc(t.as("ca"), "documentMappings", `ddt_in_${NORD}`)));
    await allow(getDoc(doc(t.as("ca"), "documentMappings", "ddt_in_client")));
    await allow(getDocs(collection(t.as("ca"), "documentMappings")));
  });
  it("client_office and client_warehouse read none", async () => {
    await deny(getDoc(doc(t.as("co"), "documentMappings", "ddt_in_client")));
    await deny(getDoc(doc(t.as("cw"), "documentMappings", `ddt_in_${NORD}`)));
  });
  it("Nord warehouse roles read their own mappings and the client defaults, never Centro's", async () => {
    for (const uid of ["na", "nw"] as const) {
      await allow(getDoc(doc(t.as(uid), "documentMappings", `ddt_in_${NORD}`)));
      await allow(getDoc(doc(t.as(uid), "documentMappings", `bom_${NORD}`)));
      await allow(getDoc(doc(t.as(uid), "documentMappings", "ddt_in_client")));
      await deny(getDoc(doc(t.as(uid), "documentMappings", `ddt_in_${CENTRO}`)));
      await deny(getDocs(collection(t.as(uid), "documentMappings")));
    }
    await deny(getDoc(doc(t.as("mw"), "documentMappings", `ddt_in_${NORD}`)));
    await deny(getDoc(doc(t.as("nt"), "documentMappings", `ddt_in_${NORD}`)));
    await deny(getDoc(doc(t.as("nt"), "documentMappings", "ddt_in_client")));
  });
  it("saved through a callable only", async () => {
    await deny(setDoc(doc(t.as("nw"), "documentMappings", `ddt_in_${NORD}`), { kind: "ddt_in", scope: NORD, mapping: {} }));
    await deny(setDoc(doc(t.as("ca"), "documentMappings", "bom_client"), { kind: "bom", scope: "client", mapping: {} }));
    await deny(deleteDoc(doc(t.as("ca"), "documentMappings", "ddt_in_client")));
  });
});

describe("expectedCodes (§11.2)", () => {
  it("client_admin and client_office read and list", async () => {
    await allow(getDoc(doc(t.as("ca"), "expectedCodes", `c_${D.centroDdtIn}_${D.centroDdtIn}`)));
    await allow(getDocs(collection(t.as("co"), "expectedCodes")));
  });
  it("Nord warehouse roles read Nord's, never Centro's; technicians and client_warehouse none", async () => {
    for (const uid of ["na", "nw"] as const) {
      await allow(getDoc(doc(t.as(uid), "expectedCodes", `c_${D.nordDdtIn}_${D.nordDdtIn}`)));
      await deny(getDoc(doc(t.as(uid), "expectedCodes", `c_${D.centroDdtIn}_${D.centroDdtIn}`)));
      await allow(getDocs(query(collection(t.as(uid), "expectedCodes"), where("aspId", "==", NORD))));
      await deny(getDocs(collection(t.as(uid), "expectedCodes")));
    }
    await deny(getDoc(doc(t.as("nt"), "expectedCodes", `c_${D.nordDdtIn}_${D.nordDdtIn}`)));
    await deny(getDoc(doc(t.as("cw"), "expectedCodes", `c_${D.nordDdtIn}_${D.nordDdtIn}`)));
  });
  it("written only by the server", async () => {
    await deny(setDoc(doc(t.as("na"), "expectedCodes", "c_new_doc"), { codeId: "c_new", documentId: "doc", kind: "bom", aspId: NORD }));
    await deny(deleteDoc(doc(t.as("ca"), "expectedCodes", `c_${D.nordDdtIn}_${D.nordDdtIn}`)));
  });
});
