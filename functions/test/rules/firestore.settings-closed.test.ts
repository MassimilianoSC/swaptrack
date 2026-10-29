import { describe, it, beforeAll, afterAll } from "vitest";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import { setup, allow, deny, type Env } from "./env";

// SPEC §14, §17: public reads are only settings/branding and settings/auth; adminLog is client_admin only;
// mail, rateLimits, accessLog and every unlisted collection are closed to every client.
let t: Env;
beforeAll(async () => {
  t = await setup("settings-closed");
  await t.seed(async (db) => {
    await setDoc(doc(db, "settings", "branding"), { appName: "SwapTrack", logoPath: null, primaryColor: "#FF6B00" });
    await setDoc(doc(db, "settings", "auth"), { google: false, microsoft: false, mfaAdmins: false, inactivityEnabled: false, inactivityMinutes: 30 });
    await setDoc(doc(db, "settings", "app"), { minVersion: "", emailConfigured: false });
    await setDoc(doc(db, "settings", "privacy"), { version: 1, texts: { it: "x", en: "x" }, retentionEnabled: false, retentionDays: 365 });
    await setDoc(doc(db, "settings", "thresholds"), { staleDays: 30, transferDays: 7 });
    await setDoc(doc(db, "settings", "photos"), { mandatoryForDefective: false });
    await setDoc(doc(db, "settings", "itemFields"), { fields: [] });
    await setDoc(doc(db, "settings", "fieldPolicy"), { pieceAtSiteNotInBom: "accept_and_alert" });
    await setDoc(doc(db, "settings", "features"), { aiDocumentExtraction: false });
    await setDoc(doc(db, "settings", "importMappings"), { locations: { code: "A" }, models: {} });
    await setDoc(doc(db, "adminLog", "log1"), { actor: "ca", action: "user_created", target: "nt", details: {}, at: new Date() });
    await setDoc(doc(db, "mail", "m1"), { to: "x@swaptrack-demo.test", message: { subject: "s", text: "t", html: "h" } });
    await setDoc(doc(db, "rateLimits", "r1"), { count: 1, expiresAt: new Date() });
    await setDoc(doc(db, "accessLog", "a1"), { actor: "ca", eventId: "e1", at: new Date() });
    await setDoc(doc(db, "secrets", "s1"), { value: "x" });
  });
});
afterAll(() => t.env.cleanup());

describe("settings (§14, §17)", () => {
  it("branding and auth are readable without sign-in; nothing else is", async () => {
    await allow(getDoc(doc(t.anon, "settings", "branding")));
    await allow(getDoc(doc(t.anon, "settings", "auth")));
    await deny(getDoc(doc(t.anon, "settings", "app")));
    await deny(getDoc(doc(t.anon, "settings", "privacy")));
    await deny(getDoc(doc(t.anon, "settings", "thresholds")));
    await deny(getDoc(doc(t.anon, "settings", "importMappings")));
    await deny(getDocs(collection(t.anon, "settings")));
  });
  it("active users of every role read the non-sensitive settings", async () => {
    for (const name of ["app", "privacy", "thresholds", "photos", "itemFields", "fieldPolicy", "features"]) {
      await allow(getDoc(doc(t.as("nt"), "settings", name)));
      await allow(getDoc(doc(t.as("cw"), "settings", name)));
      await allow(getDoc(doc(t.as("ma"), "settings", name)));
    }
  });
  it("importMappings: client_admin only", async () => {
    await allow(getDoc(doc(t.as("ca"), "settings", "importMappings")));
    await deny(getDoc(doc(t.as("co"), "settings", "importMappings")));
    await deny(getDoc(doc(t.as("na"), "settings", "importMappings")));
    await deny(getDoc(doc(t.as("nw"), "settings", "importMappings")));
  });
  it("inactive users keep the public reads and lose the rest", async () => {
    await allow(getDoc(doc(t.as("inactive"), "settings", "branding")));
    await deny(getDoc(doc(t.as("inactive"), "settings", "app")));
    await deny(getDoc(doc(t.as("ntGrace"), "settings", "thresholds")));
  });
  it("nobody writes settings from the client (saveSettings is a callable)", async () => {
    await deny(setDoc(doc(t.as("ca"), "settings", "branding"), { appName: "Other", logoPath: null, primaryColor: "#000000" }));
    await deny(updateDoc(doc(t.as("ca"), "settings", "thresholds"), { staleDays: 1 }));
    await deny(updateDoc(doc(t.as("nt"), "settings", "app"), { minVersion: "9.9.9" }));
    await deny(setDoc(doc(t.anon, "settings", "auth"), { google: true }));
  });
});

describe("adminLog (§4.16): client_admin reads, nobody writes", () => {
  it("client_admin reads and lists (listAdminLog)", async () => {
    await allow(getDoc(doc(t.as("ca"), "adminLog", "log1")));
    await allow(getDocs(query(collection(t.as("ca"), "adminLog"), orderBy("at", "desc"), limit(300))));
  });
  it("every other role is refused", async () => {
    await deny(getDoc(doc(t.as("co"), "adminLog", "log1")));
    await deny(getDoc(doc(t.as("cw"), "adminLog", "log1")));
    await deny(getDoc(doc(t.as("na"), "adminLog", "log1")));
    await deny(getDocs(collection(t.as("na"), "adminLog")));
    await deny(getDoc(doc(t.anon, "adminLog", "log1")));
  });
  it("client_admin cannot write it", async () => {
    await deny(setDoc(doc(t.as("ca"), "adminLog", "log2"), { actor: "ca", action: "x", target: null, details: {}, at: new Date() }));
  });
});

describe("closed collections: mail, rateLimits, accessLog, unknown", () => {
  it("client_admin can neither read nor write them", async () => {
    await deny(getDoc(doc(t.as("ca"), "mail", "m1")));
    await deny(getDocs(collection(t.as("ca"), "mail")));
    await deny(setDoc(doc(t.as("ca"), "mail", "m2"), { to: "y@swaptrack-demo.test" }));
    await deny(getDoc(doc(t.as("ca"), "rateLimits", "r1")));
    await deny(updateDoc(doc(t.as("ca"), "rateLimits", "r1"), { count: 0 }));
    await deny(getDoc(doc(t.as("ca"), "accessLog", "a1")));
    await deny(getDocs(collection(t.as("ca"), "accessLog")));
    await deny(setDoc(doc(t.as("ca"), "accessLog", "a2"), { actor: "ca" }));
    await deny(getDoc(doc(t.as("ca"), "secrets", "s1")));
    await deny(setDoc(doc(t.as("ca"), "secrets", "s2"), { value: "y" }));
  });
  it("ASP roles neither", async () => {
    await deny(getDoc(doc(t.as("na"), "accessLog", "a1")));
    await deny(getDoc(doc(t.as("nw"), "mail", "m1")));
    await deny(setDoc(doc(t.as("nt"), "anything", "x"), { a: 1 }));
  });
});
