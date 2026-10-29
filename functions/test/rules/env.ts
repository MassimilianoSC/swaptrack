// Shared fixtures for the security-rules tests (SPEC §3.3, §7.3, §8.1, R7, R11).
// Every test file calls setup() with its own name: the emulator keeps one database per project id,
// so files run in parallel without touching each other's data, and never the seed of demo-swaptrack.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
  type RulesTestEnvironment, type RulesTestContext,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, setLogLevel, type Firestore } from "firebase/firestore";

// Denied requests are the point of these tests: keep the SDK from logging each one.
setLogLevel("silent");

export const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const firebaseJson = JSON.parse(readFileSync(`${ROOT}firebase.json`, "utf8")) as {
  emulators: { firestore: { host: string; port: number }; storage: { host: string; port: number } };
};

export const CLIENT = "org_client";
export const NORD = "org_asp_nord";
export const CENTRO = "org_asp_centro";
export const SUD = "org_asp_sud";

// Locations: one site and one warehouse per ASP, one client warehouse (ids distinct from the seed).
export const LOC = {
  clientWh: "loc_T-MAG-CLI", nordWh: "loc_T-MAG-NORD", nordSite: "loc_T-SITO-NORD",
  centroWh: "loc_T-MAG-CENTRO", centroSite: "loc_T-SITO-CENTRO",
};
export const LOCATIONS: Record<string, Record<string, unknown>> = {
  [LOC.clientWh]: { code: "T-MAG-CLI", name: "Client warehouse", type: "client_warehouse", aspId: null, active: true },
  [LOC.nordWh]: { code: "T-MAG-NORD", name: "Nord warehouse", type: "asp_warehouse", aspId: NORD, active: true },
  [LOC.nordSite]: { code: "T-SITO-NORD", name: "Nord site", type: "site", aspId: NORD, active: true },
  [LOC.centroWh]: { code: "T-MAG-CENTRO", name: "Centro warehouse", type: "asp_warehouse", aspId: CENTRO, active: true },
  [LOC.centroSite]: { code: "T-SITO-CENTRO", name: "Centro site", type: "site", aspId: CENTRO, active: true },
};

// disabledAt of the users in grace (ms, as the claims carry it: §4.8).
export const GRACE_AT = Date.UTC(2026, 9, 20, 12, 0, 0);

export interface Claims { role: string; orgId: string; active: boolean; disabledAt: number | null }
// uid -> claims. Client roles, ASP Nord, ASP Centro, Nord users in grace, an inactive user.
export const USERS = {
  ca: { role: "client_admin", orgId: CLIENT, active: true, disabledAt: null },
  co: { role: "client_office", orgId: CLIENT, active: true, disabledAt: null },
  cw: { role: "client_warehouse", orgId: CLIENT, active: true, disabledAt: null },
  na: { role: "asp_admin", orgId: NORD, active: true, disabledAt: null },
  nw: { role: "asp_warehouse", orgId: NORD, active: true, disabledAt: null },
  nt: { role: "asp_technician", orgId: NORD, active: true, disabledAt: null },
  nt2: { role: "asp_technician", orgId: NORD, active: true, disabledAt: null },
  ma: { role: "asp_admin", orgId: CENTRO, active: true, disabledAt: null },
  mw: { role: "asp_warehouse", orgId: CENTRO, active: true, disabledAt: null },
  mt: { role: "asp_technician", orgId: CENTRO, active: true, disabledAt: null },
  ntGrace: { role: "asp_technician", orgId: NORD, active: false, disabledAt: GRACE_AT },
  nwGrace: { role: "asp_warehouse", orgId: NORD, active: false, disabledAt: GRACE_AT },
  inactive: { role: "asp_technician", orgId: NORD, active: false, disabledAt: null },
} satisfies Record<string, Claims>;
export type Uid = keyof typeof USERS;

export interface Env {
  env: RulesTestEnvironment;
  // Firestore client authenticated as that user (claims in the token, §3.4). One instance per uid.
  as: (uid: Uid) => Firestore;
  anon: Firestore;
  ctx: (uid: Uid) => RulesTestContext;
  anonCtx: RulesTestContext;
  // Writes with the rules disabled (the Admin SDK of the tests).
  seed: (fn: (db: Firestore) => Promise<void>) => Promise<void>;
}

export async function setup(name: string, opts: { storage?: boolean } = {}): Promise<Env> {
  const env = await initializeTestEnvironment({
    projectId: `demo-rules-${name}`,
    firestore: {
      rules: readFileSync(`${ROOT}firestore.rules`, "utf8"),
      host: firebaseJson.emulators.firestore.host, port: firebaseJson.emulators.firestore.port,
    },
    ...(opts.storage ? {
      storage: {
        rules: readFileSync(`${ROOT}storage.rules`, "utf8"),
        host: firebaseJson.emulators.storage.host, port: firebaseJson.emulators.storage.port,
      },
    } : {}),
  });
  await env.clearFirestore();
  if (opts.storage) await env.clearStorage();
  const seed = (fn: (db: Firestore) => Promise<void>) => env.withSecurityRulesDisabled((c) => fn(c.firestore()));
  // Users and locations exist in every file (events need exists(locations/..), §8.1).
  await seed(async (db) => {
    for (const [uid, claims] of Object.entries(USERS)) {
      await setDoc(doc(db, "users", uid), { email: `${uid}@swaptrack-demo.test`, firstName: uid, lastName: "Test", ...claims });
    }
    for (const [id, data] of Object.entries(LOCATIONS)) await setDoc(doc(db, "locations", id), data);
  });
  const contexts = new Map<Uid, RulesTestContext>();
  const stores = new Map<Uid, Firestore>();
  const ctx = (uid: Uid) => {
    if (!contexts.has(uid)) contexts.set(uid, env.authenticatedContext(uid, USERS[uid]));
    return contexts.get(uid)!;
  };
  const anonCtx = env.unauthenticatedContext();
  const anon = anonCtx.firestore();
  const as = (uid: Uid) => {
    if (!stores.has(uid)) stores.set(uid, ctx(uid).firestore());
    return stores.get(uid)!;
  };
  return { env, as, anon, ctx, anonCtx, seed };
}

export const allow = <T>(p: Promise<T>): Promise<T> => assertSucceeds(p);
export const deny = (p: Promise<unknown>) => assertFails(p);
