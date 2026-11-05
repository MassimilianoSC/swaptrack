import { describe, it, expect, beforeAll } from "vitest";
import { initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { clearCollections } from "../../../scripts/clearCollections.mjs";

// P-147: fullSeed clears the seeded collections before writing; the lines of the shipments (a subcollection) must go
// with their shipment, otherwise every full seed leaves orphan lines behind. Own project: no other test counts these.
let db: Firestore;
beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8190";
  const app: App = initializeApp({ projectId: "demo-clear-tests" }, "clear-tests");
  db = getFirestore(app);
});

describe("clearCollections (full seed, P-147)", () => {
  it("deletes the documents and their subcollections, and leaves the other collections alone", async () => {
    await db.doc("shipments/s1").set({ kind: "return" });
    await db.doc("shipments/s1/lines/i1").set({ codeRaw: "SN-1" });
    await db.doc("shipments/s1/lines/i2").set({ codeRaw: "SN-2" });
    await db.doc("items/i1").set({ status: "sorted" });
    await db.doc("users/u1").set({ role: "client_admin" });

    await clearCollections(db, ["shipments", "items"]);

    expect((await db.collection("shipments").count().get()).data().count).toBe(0);
    expect((await db.collectionGroup("lines").count().get()).data().count).toBe(0);
    expect((await db.collection("items").count().get()).data().count).toBe(0);
    expect((await db.doc("users/u1").get()).exists).toBe(true);
  });
});
