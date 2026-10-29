import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { setup, allow, deny, CLIENT, NORD, CENTRO, type Env } from "./env";

// SPEC §3.3 "Read organizations": client roles all; ASP roles own only. Writes: callables only (R3).
let t: Env;
beforeAll(async () => {
  t = await setup("organizations");
  await t.seed(async (db) => {
    await setDoc(doc(db, "organizations", CLIENT), { name: "Telco Demo", type: "client", language: "it", active: true });
    await setDoc(doc(db, "organizations", NORD), { name: "ASP Nord", type: "asp", language: "it", active: true });
    await setDoc(doc(db, "organizations", CENTRO), { name: "ASP Centro", type: "asp", language: "it", active: true });
  });
});
afterAll(() => t.env.cleanup());

describe("organizations: read", () => {
  it("client roles read every organization, also as a list (listOrganizations)", async () => {
    await allow(getDoc(doc(t.as("ca"), "organizations", NORD)));
    await allow(getDoc(doc(t.as("co"), "organizations", CENTRO)));
    await allow(getDoc(doc(t.as("cw"), "organizations", NORD)));
    const all = await allow(getDocs(collection(t.as("ca"), "organizations")));
    expect(all.size).toBe(3);
  });
  it("ASP roles read their own organization only", async () => {
    await allow(getDoc(doc(t.as("na"), "organizations", NORD)));
    await allow(getDoc(doc(t.as("nw"), "organizations", NORD)));
    await allow(getDoc(doc(t.as("nt"), "organizations", NORD)));
    await deny(getDoc(doc(t.as("na"), "organizations", CENTRO)));
    await deny(getDoc(doc(t.as("nt"), "organizations", CLIENT)));
    await deny(getDoc(doc(t.as("mt"), "organizations", NORD)));
    await deny(getDocs(collection(t.as("na"), "organizations")));
  });
  it("inactive users, users in grace and anonymous read nothing", async () => {
    await deny(getDoc(doc(t.as("inactive"), "organizations", NORD)));
    await deny(getDoc(doc(t.as("ntGrace"), "organizations", NORD)));
    await deny(getDoc(doc(t.anon, "organizations", NORD)));
  });
});

describe("organizations: write (R3: callables only)", () => {
  it("client_admin cannot create, update or delete from the client", async () => {
    await deny(setDoc(doc(t.as("ca"), "organizations", "org_new"), { name: "X", type: "asp", active: true }));
    await deny(updateDoc(doc(t.as("ca"), "organizations", NORD), { active: false }));
    await deny(deleteDoc(doc(t.as("ca"), "organizations", NORD)));
  });
  it("asp_admin cannot touch its own organization", async () => {
    await deny(updateDoc(doc(t.as("na"), "organizations", NORD), { name: "Y" }));
  });
});
