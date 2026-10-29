// Fixtures for the trigger tests (SPEC §8.2, PIANO P-11 / P-16). The trigger logic runs in-process against the
// Firestore emulator: processEvent(id) is exactly what onEventCreated calls, so the same code path is exercised,
// red tests fail at once instead of waiting for a retry loop, and no build of functions/lib is needed.
// Needs the Firestore emulator (yarn firebase emulators:exec --only firestore,storage ... as in vitest.config.ts).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const firebaseJson = JSON.parse(readFileSync(`${ROOT}firebase.json`, "utf8")) as { emulators: { firestore: { host: string; port: number } } };
// Own project id: never the seeded demo-swaptrack database. Set before the Admin SDK is initialized.
process.env.FIRESTORE_EMULATOR_HOST ??= `${firebaseJson.emulators.firestore.host}:${firebaseJson.emulators.firestore.port}`;
process.env.GCLOUD_PROJECT = "demo-trigger-tests";
delete process.env.FIREBASE_CONFIG;

const { computeCodeId, NORM_VERSION } = createRequire(import.meta.url)("../../src/codeId.node.js") as {
  computeCodeId: (raw: string) => string; NORM_VERSION: number;
};
export { computeCodeId, NORM_VERSION };

export const NORD = "org_asp_nord";
export const CENTRO = "org_asp_centro";
export const LOC = { nordWh: "loc_TT-MAG-NORD", nordWh2: "loc_TT-MAG-NORD-2", nordSite: "loc_TT-SITO-NORD", clientWh: "loc_TT-MAG-CLI", centroWh: "loc_TT-MAG-CENTRO" };
export const SH = { ret: "sh_TT_return", tr: "sh_TT_transfer" };
export const UID = { nw: "tt_nw", nt: "tt_nt" };
// Every run uses its own codes, so a long-lived emulator never sees them as known.
export const RUN = Date.now().toString(36);
export const T0 = Date.UTC(2026, 9, 29, 8, 0, 0);

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Admin = typeof import("../../src/core/admin");
type Trigger = typeof import("../../src/trigger");

export interface TriggerEnv { db: Admin["db"]; processEvent: Trigger["processEvent"]; fire: (data: Doc) => Promise<string> }

// Loads the real modules (after the env above) and seeds the fixed documents of this project.
export async function setupTrigger(): Promise<TriggerEnv> {
  const { db } = await import("../../src/core/admin");
  const { processEvent } = await import("../../src/trigger");
  const loc = (code: string, type: string, aspId: string | null) => ({ code, name: code, type, aspId, active: true, region: "Test" });
  await db.collection("locations").doc(LOC.nordWh).set(loc("TT-MAG-NORD", "asp_warehouse", NORD));
  await db.collection("locations").doc(LOC.nordWh2).set(loc("TT-MAG-NORD-2", "asp_warehouse", NORD));
  await db.collection("locations").doc(LOC.nordSite).set(loc("TT-SITO-NORD", "site", NORD));
  await db.collection("locations").doc(LOC.clientWh).set(loc("TT-MAG-CLI", "client_warehouse", null));
  await db.collection("locations").doc(LOC.centroWh).set(loc("TT-MAG-CENTRO", "asp_warehouse", CENTRO));
  await db.collection("users").doc(UID.nw).set({ role: "asp_warehouse", orgId: NORD, active: true, disabledAt: null });
  await db.collection("users").doc(UID.nt).set({ role: "asp_technician", orgId: NORD, active: true, disabledAt: null });
  await db.collection("shipments").doc(SH.ret).set({ kind: "return", fromLocationId: LOC.nordWh, fromAspId: NORD, toLocationId: LOC.clientWh, toAspId: null, status: "draft", itemCount: 0 });
  await db.collection("shipments").doc(SH.tr).set({ kind: "transfer", fromLocationId: LOC.nordWh, fromAspId: NORD, toLocationId: LOC.nordWh2, toAspId: NORD, status: "draft", itemCount: 0 });
  const fire = async (data: Doc) => {
    const id = randomUUID();
    await db.collection("events").doc(id).set(data);
    await processEvent(id);
    return id;
  };
  return { db, processEvent, fire };
}

// An event as the app writes it (already with createdAt, since the tests do not go through the rules).
export function ev(type: string, codeRaw: string | null, over: Doc = {}): Doc {
  const technician = type === "remove_at_site" || type === "install_at_site" || type === "site_done";
  const at = (over.at as number | undefined) ?? T0;
  const { at: _at, ...rest } = over;
  return {
    type, codeRaw, codeId: codeRaw ? computeCodeId(codeRaw) : null, normVersion: NORM_VERSION, secondCodeRaw: null,
    locationId: technician ? LOC.nordSite : LOC.nordWh, aspId: NORD, scannedAt: Timestamp.fromMillis(at), clockOffsetMs: 0, offsetMeasuredAt: null,
    userId: technician ? UID.nt : UID.nw, orgId: NORD, source: "camera", engine: null, payload: {}, createdAt: Timestamp.fromMillis(at + 1),
    ...rest,
  };
}
