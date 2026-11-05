import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth, type Auth } from "firebase-admin/auth";
import { plan, applyPlan, COLLECTIONS } from "../../../scripts/wipe.mjs";

// P-148: what wipeProject.mjs deletes and keeps, on the emulators, in a project of its own. The SwapTrack collections
// and folders go (subcollections included); the active client administrators, their organization and
// settings/privacy always stay; a collection or a folder that is not SwapTrack's stays; with no administrator,
// nothing is deleted.
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const emu = JSON.parse(readFileSync(`${ROOT}firebase.json`, "utf8")).emulators as Record<string, { host: string; port: number }>;
const host = (n: string) => `${emu[n].host}:${emu[n].port}`;
process.env.FIRESTORE_EMULATOR_HOST ??= host("firestore");
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= host("storage");
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= host("auth");
const PROJECT = "demo-wipe-tests";

let db: Firestore, auth: Auth, bucket: ReturnType<ReturnType<typeof getStorage>["bucket"]>, env: { db: Firestore; bucket: typeof bucket; auth: Auth };
let adminUid = "";
const DATA = { data: true, files: false, keepPeople: false }, FILES = { data: false, files: true, keepPeople: false }, ALL = { data: true, files: true, keepPeople: false };
const exists = async (path: string) => (await db.doc(path).get()).exists;
const fileExists = async (name: string) => (await bucket.file(name).exists())[0];
const total = async (c: string) => (await db.collection(c).count().get()).data().count;

beforeAll(async () => {
  const app = initializeApp({ projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com` }, "wipe-tests");
  db = getFirestore(app); auth = getAuth(app); bucket = getStorage(app).bucket();
  env = { db, bucket, auth };
});

// A small project: an administrator who can sign in, two other people, the work data, one file per folder, and a
// collection and a file of someone else (the old café site of the demo project).
beforeEach(async () => {
  const r = await fetch(`http://${host("firestore")}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!r.ok) throw new Error(`clear failed: ${r.status}`);
  await bucket.deleteFiles({ force: true });
  const old = await auth.getUserByEmail("wipe-admin@example.test").catch(() => null);
  if (old) await auth.deleteUser(old.uid);
  adminUid = (await auth.createUser({ email: "wipe-admin@example.test" })).uid;
  await db.doc(`users/${adminUid}`).set({ role: "client_admin", orgId: "org_client", active: true });
  await db.doc("users/u_office").set({ role: "client_office", orgId: "org_client", active: true });
  await db.doc("users/u_nord").set({ role: "asp_warehouse", orgId: "org_asp_nord", active: true });
  await db.doc("organizations/org_client").set({ type: "client", active: true });
  await db.doc("organizations/org_asp_nord").set({ type: "asp", active: true });
  await db.doc("settings/privacy").set({ version: 2 });
  await db.doc("settings/auth").set({ google: true });
  await db.doc("settings/branding").set({ logoPath: "branding/logo.png" });
  await db.doc("locations/loc_A").set({ code: "A" });
  await db.doc("items/i1").set({ status: "sorted", photoPaths: ["photos/org_asp_nord/e1/p.jpg"] });
  await db.doc("events/e1").set({ type: "classify" });
  await db.doc("documents/d1").set({ number: "TD-1", files: ["documents/org_asp_nord/ddt_in/d1/1-1.pdf"] });
  await db.doc("shipments/s1").set({ kind: "return" });
  await db.doc("shipments/s1/lines/i1").set({ codeRaw: "SN-1" });
  await db.doc("exports/x1").set({ path: "exports/client/x1.xlsx" });
  await db.doc("cafe_orders/o1").set({ table: 4 });
  for (const f of ["branding/logo.png", "photos/org_asp_nord/e1/p.jpg", "documents/org_asp_nord/ddt_in/d1/1-1.pdf", "exports/client/x1.xlsx", "reports/client/2026-10.pdf", "cafe/menu.pdf"]) {
    await bucket.file(f).save(Buffer.from("x"));
  }
});

describe("wipeProject (P-148)", () => {
  it("--data: every SwapTrack collection goes, subcollections too; the administrator, its organization and the privacy notice stay; the files and someone else's collection stay", async () => {
    const p = await plan(env, DATA);
    expect(p.admins).toBe(1);
    expect(p.left).toEqual([{ name: "cafe_orders", docs: 1 }]);
    await applyPlan(env, p);
    for (const c of ["items", "events", "documents", "shipments", "exports", "locations"]) expect(await total(c)).toBe(0);
    expect((await db.collectionGroup("lines").count().get()).data().count).toBe(0);
    expect(await exists(`users/${adminUid}`)).toBe(true);
    expect(await exists("users/u_office")).toBe(false);
    expect(await exists("organizations/org_client")).toBe(true);
    expect(await exists("organizations/org_asp_nord")).toBe(false);
    expect(await exists("settings/privacy")).toBe(true);
    expect(await exists("settings/auth")).toBe(false);
    expect(await exists("cafe_orders/o1")).toBe(true);
    expect(await fileExists("photos/org_asp_nord/e1/p.jpg")).toBe(true);
  });

  it("--all: the SwapTrack folders of Storage go too, someone else's file stays", async () => {
    await applyPlan(env, await plan(env, ALL));
    for (const f of ["branding/logo.png", "photos/org_asp_nord/e1/p.jpg", "documents/org_asp_nord/ddt_in/d1/1-1.pdf", "exports/client/x1.xlsx", "reports/client/2026-10.pdf"]) {
      expect(await fileExists(f)).toBe(false);
    }
    expect(await fileExists("cafe/menu.pdf")).toBe(true);
    expect(await exists(`users/${adminUid}`)).toBe(true);
  });

  it("--files: the files go, the data stay; the records that only point to a file go, the logo setting is emptied, and the plan counts what would point to nothing", async () => {
    const p = await plan(env, FILES);
    expect(p.dangling).toEqual({ documents: 1, items: 1 });
    await applyPlan(env, p);
    expect(await fileExists("documents/org_asp_nord/ddt_in/d1/1-1.pdf")).toBe(false);
    expect(await exists("documents/d1")).toBe(true);
    expect(await exists("items/i1")).toBe(true);
    expect(await exists("users/u_office")).toBe(true);
    expect(await total("exports")).toBe(0);
    expect((await db.doc("settings/branding").get()).get("logoPath")).toBeNull();
    expect(await fileExists("cafe/menu.pdf")).toBe(true);
  });

  it("--all --keep-people: people, organizations, settings, catalog and logo stay; the work data and its files go", async () => {
    await applyPlan(env, await plan(env, { ...ALL, keepPeople: true }));
    for (const p of ["users/u_office", "users/u_nord", "organizations/org_asp_nord", "settings/auth", "settings/branding", "locations/loc_A"]) expect(await exists(p)).toBe(true);
    for (const c of ["items", "events", "documents", "shipments", "exports"]) expect(await total(c)).toBe(0);
    expect(await fileExists("branding/logo.png")).toBe(true);
    expect(await fileExists("photos/org_asp_nord/e1/p.jpg")).toBe(false);
  });

  it("with no active administrator that can sign in, nothing is deleted", async () => {
    await auth.updateUser(adminUid, { disabled: true });
    const p = await plan(env, ALL);
    expect(p.admins).toBe(0);
    await expect(applyPlan(env, p)).rejects.toThrow(/no active client administrator/);
    expect(await total("items")).toBe(1);
    expect(await fileExists("photos/org_asp_nord/e1/p.jpg")).toBe(true);
  });

  it("knows every collection the server writes", async () => {
    const src = (await import("node:fs")).readdirSync(`${ROOT}functions/src`, { recursive: true }) as string[];
    const used = new Set<string>();
    for (const f of src.filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
      for (const m of readFileSync(`${ROOT}functions/src/${f}`, "utf8").matchAll(/db\.collection\("([A-Za-z]+)"\)/g)) used.add(m[1]);
    }
    expect([...used].filter((c) => !COLLECTIONS.includes(c))).toEqual([]);
  });
});
