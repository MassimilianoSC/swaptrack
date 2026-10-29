import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { setup, allow, deny, NORD, CENTRO, LOC, type Env } from "./env";

// SPEC §3.3: users (R11), locations, models, sorting categories and rules. Writes: callables only (R3).
let t: Env;
beforeAll(async () => {
  t = await setup("users-locations");
  await t.seed(async (db) => {
    await setDoc(doc(db, "models", "mdl_T1"), { materialCode: "T1", model: "RX-1", manufacturer: "X", equipmentType: "Radio unit", active: true });
    await setDoc(doc(db, "sortingCategories", "cat_t"), { labels: { it: "A", en: "A" }, active: true, order: 0 });
    await setDoc(doc(db, "sortingRules", "rule_t"), { siteId: null, modelId: null, equipmentType: "Radio unit", categoryId: "cat_t", active: true });
  });
});
afterAll(() => t.env.cleanup());

describe("users (R11: field roles cannot map a uid to a name)", () => {
  it("everyone active reads their own document", async () => {
    await allow(getDoc(doc(t.as("ca"), "users", "ca")));
    await allow(getDoc(doc(t.as("cw"), "users", "cw")));
    await allow(getDoc(doc(t.as("nt"), "users", "nt")));
    await allow(getDoc(doc(t.as("mw"), "users", "mw")));
  });
  it("client_admin reads every user and lists them all (watchUsers without filter)", async () => {
    await allow(getDoc(doc(t.as("ca"), "users", "nt")));
    await allow(getDoc(doc(t.as("ca"), "users", "mt")));
    const all = await allow(getDocs(collection(t.as("ca"), "users")));
    expect(all.size).toBeGreaterThan(10);
  });
  it("client_office and client_warehouse read nobody else", async () => {
    await deny(getDoc(doc(t.as("co"), "users", "nt")));
    await deny(getDoc(doc(t.as("co"), "users", "ca")));
    await deny(getDoc(doc(t.as("cw"), "users", "na")));
    await deny(getDocs(collection(t.as("co"), "users")));
    await deny(getDocs(query(collection(t.as("co"), "users"), where("orgId", "==", NORD))));
  });
  it("asp_admin reads and lists the people of its own ASP only (watchUsers orgId = own)", async () => {
    await allow(getDoc(doc(t.as("na"), "users", "nw")));
    await allow(getDoc(doc(t.as("na"), "users", "nt")));
    await deny(getDoc(doc(t.as("na"), "users", "mw")));
    await deny(getDoc(doc(t.as("na"), "users", "ca")));
    const own = await allow(getDocs(query(collection(t.as("na"), "users"), where("orgId", "==", NORD))));
    expect(own.docs.every((d) => d.get("orgId") === NORD)).toBe(true);
    await deny(getDocs(query(collection(t.as("na"), "users"), where("orgId", "==", CENTRO))));
    await deny(getDocs(collection(t.as("na"), "users")));
  });
  it("asp_warehouse and asp_technician read only themselves", async () => {
    await deny(getDoc(doc(t.as("nw"), "users", "na")));
    await deny(getDoc(doc(t.as("nw"), "users", "nt")));
    await deny(getDoc(doc(t.as("nt"), "users", "nt2")));
    await deny(getDocs(query(collection(t.as("nt"), "users"), where("orgId", "==", NORD))));
    await deny(getDocs(query(collection(t.as("nw"), "users"), where("orgId", "==", NORD))));
  });
  it("inactive, in grace and anonymous read nothing, not even themselves", async () => {
    await deny(getDoc(doc(t.as("inactive"), "users", "inactive")));
    await deny(getDoc(doc(t.as("ntGrace"), "users", "ntGrace")));
    await deny(getDoc(doc(t.anon, "users", "nt")));
  });
  it("no client writes a user document (privacy acceptance, language, roles go through callables)", async () => {
    await deny(updateDoc(doc(t.as("nt"), "users", "nt"), { language: "en" }));
    await deny(updateDoc(doc(t.as("nt"), "users", "nt"), { role: "asp_admin" }));
    await deny(updateDoc(doc(t.as("ca"), "users", "nt"), { active: false }));
    await deny(setDoc(doc(t.as("ca"), "users", "new"), { role: "client_admin", orgId: "org_client", active: true }));
    await deny(deleteDoc(doc(t.as("ca"), "users", "nt")));
  });
});

describe("locations (§3.3)", () => {
  it("client roles read every location, also as a list (listLocations)", async () => {
    await allow(getDoc(doc(t.as("ca"), "locations", LOC.nordSite)));
    await allow(getDoc(doc(t.as("co"), "locations", LOC.centroWh)));
    await allow(getDoc(doc(t.as("cw"), "locations", LOC.nordWh)));
    const all = await allow(getDocs(collection(t.as("cw"), "locations")));
    expect(all.size).toBe(5);
  });
  it("technician: sites and warehouses of the own ASP, loaded with one query (loadFieldLocations)", async () => {
    await allow(getDoc(doc(t.as("nt"), "locations", LOC.nordSite)));
    await allow(getDoc(doc(t.as("nt"), "locations", LOC.nordWh)));
    await deny(getDoc(doc(t.as("nt"), "locations", LOC.centroSite)));
    await deny(getDoc(doc(t.as("nt"), "locations", LOC.clientWh)));
    const own = await allow(getDocs(query(collection(t.as("nt"), "locations"), where("aspId", "==", NORD))));
    expect(own.size).toBe(2);
    await deny(getDocs(query(collection(t.as("nt"), "locations"), where("aspId", "==", CENTRO))));
    await deny(getDocs(collection(t.as("nt"), "locations")));
    await deny(getDocs(query(collection(t.as("nt"), "locations"), where("type", "==", "client_warehouse"))));
  });
  it("warehouse roles: own ASP plus the client warehouses", async () => {
    await allow(getDoc(doc(t.as("nw"), "locations", LOC.clientWh)));
    await allow(getDoc(doc(t.as("na"), "locations", LOC.clientWh)));
    await allow(getDoc(doc(t.as("nw"), "locations", LOC.nordWh)));
    await deny(getDoc(doc(t.as("nw"), "locations", LOC.centroWh)));
    await deny(getDoc(doc(t.as("na"), "locations", LOC.centroSite)));
    await allow(getDocs(query(collection(t.as("nw"), "locations"), where("aspId", "==", NORD))));
    await allow(getDocs(query(collection(t.as("nw"), "locations"), where("type", "==", "client_warehouse"))));
    await deny(getDocs(collection(t.as("nw"), "locations")));
  });
  it("inactive, in grace and anonymous read nothing", async () => {
    await deny(getDoc(doc(t.as("inactive"), "locations", LOC.nordSite)));
    await deny(getDoc(doc(t.as("ntGrace"), "locations", LOC.nordSite)));
    await deny(getDoc(doc(t.anon, "locations", LOC.nordSite)));
  });
  it("nobody writes locations from the client (imports and edits are callables)", async () => {
    await deny(setDoc(doc(t.as("ca"), "locations", "loc_T-NEW"), { code: "T-NEW", name: "New", type: "site", aspId: NORD, active: true }));
    await deny(updateDoc(doc(t.as("ca"), "locations", LOC.nordSite), { aspId: CENTRO }));
    await deny(updateDoc(doc(t.as("na"), "locations", LOC.nordSite), { name: "Renamed" }));
    await deny(deleteDoc(doc(t.as("ca"), "locations", LOC.nordSite)));
  });
});

describe("models, sorting categories and rules: every active user reads, nobody writes", () => {
  it("active users of every role read and list", async () => {
    await allow(getDoc(doc(t.as("nt"), "models", "mdl_T1")));
    await allow(getDocs(collection(t.as("mt"), "models")));
    await allow(getDoc(doc(t.as("cw"), "sortingCategories", "cat_t")));
    await allow(getDocs(collection(t.as("nw"), "sortingCategories")));
    await allow(getDoc(doc(t.as("ma"), "sortingRules", "rule_t")));
    await allow(getDocs(collection(t.as("nt"), "sortingRules")));
  });
  it("inactive, in grace and anonymous read nothing", async () => {
    await deny(getDoc(doc(t.as("inactive"), "models", "mdl_T1")));
    await deny(getDoc(doc(t.as("nwGrace"), "sortingCategories", "cat_t")));
    await deny(getDoc(doc(t.anon, "models", "mdl_T1")));
    await deny(getDocs(collection(t.anon, "sortingRules")));
  });
  it("client_admin cannot write them from the client", async () => {
    await deny(setDoc(doc(t.as("ca"), "models", "mdl_T2"), { materialCode: "T2", model: "X", active: true }));
    await deny(updateDoc(doc(t.as("ca"), "sortingCategories", "cat_t"), { active: false }));
    await deny(setDoc(doc(t.as("ca"), "sortingRules", "rule_2"), { equipmentType: "Baseband", categoryId: "cat_t", active: true }));
    await deny(deleteDoc(doc(t.as("ca"), "models", "mdl_T1")));
  });
});
