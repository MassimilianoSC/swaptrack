// Demo seed, step 2 (SPEC §18): organizations, users (one per role per organization), locations, models, settings.
// Invented data only. P-148: it only creates what is missing, so it can run again on a project in use (see
// createMissing and fillMissingFields below).
import { initializeApp } from "firebase-admin/app";
import { hostOf } from "./emulatorPorts.mjs";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { askHidden } from "./prompt.mjs";
import { DEMO_DOMAIN, passwordProblem } from "./demoAccounts.mjs";
import { ORGS, CLIENT_WAREHOUSE, SITE_COUNT, aspWarehouses, site, seedModels } from "./seedCatalog.mjs";

// Target: the emulators by default. The real demo project only with BOTH
//   SEED_REAL_PROJECT=kronos-caffe-sito   and the argument --yes-real-project
// (PowerShell: $env:SEED_REAL_PROJECT="kronos-caffe-sito" then the command; Git Bash: SEED_REAL_PROJECT=kronos-caffe-sito node ...)
// (credentials: gcloud auth application-default login). See README, "Progetto Firebase della demo".
const REAL = process.env.SEED_REAL_PROJECT === "kronos-caffe-sito" && process.argv.includes("--yes-real-project");
if (!REAL) {
  process.env.FIRESTORE_EMULATOR_HOST ??= hostOf("firestore");
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= hostOf("auth");
}
const PROJECT = REAL ? "kronos-caffe-sito" : "demo-swaptrack";
if (REAL) console.log("!! Writing to the REAL project kronos-caffe-sito");
if (!REAL && (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)) throw new Error("Emulators only");

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const auth = getAuth();

// Password of the demo accounts ON THE EMULATORS ONLY (the e2e tests sign in with it). On the real project the seed
// never sets or prints a password of an existing account (P-84: the owner changes them with setDemoPassword.mjs);
// a new account gets one typed at a hidden prompt.
export const DEMO_PASSWORD = "SwapDemo2026";
let realPassword = null;
async function newAccountPassword() {
  if (!REAL) return DEMO_PASSWORD;
  while (!realPassword) {
    const p = await askHidden("Password for the NEW demo accounts on the real project (not shown): ");
    const problem = passwordProblem(p);
    if (problem) { console.log(`The password needs ${problem}.`); continue; }
    if ((await askHidden("Same password again: ")) !== p) { console.log("The two passwords differ."); continue; }
    realPassword = p;
  }
  return realPassword;
}
const DOMAIN = DEMO_DOMAIN;
const PEOPLE = [["Giulia", "Ferri"], ["Marco", "Lunardi"], ["Elena", "Corsini"], ["Paolo", "Brambati"], ["Sara", "Velluti"], ["Luca", "Rinaldetti"],
  ["Chiara", "Montesi"], ["Davide", "Orlandini"], ["Irene", "Castaldo"], ["Fabio", "Serafini"], ["Marta", "Ghidoni"], ["Tommaso", "Pellizza"]];

const locId = (code) => `loc_${encodeURIComponent(code)}`;
const mdlId = (code) => `mdl_${encodeURIComponent(code)}`;

// P-148: the seed only fills what is missing, so it can run again on a project in use: a document that exists is never
// rewritten (names, places, models, categories changed online stay), and a settings document only gets the fields it
// lacks (Google, e-mail, logo, privacy version chosen online stay). Returns how many documents were created.
async function createMissing(writes) {
  let created = 0;
  for (let i = 0; i < writes.length; i += 300) {
    const chunk = writes.slice(i, i + 300);
    const snaps = await db.getAll(...chunk.map(([ref]) => ref));
    const b = db.batch();
    snaps.forEach((s, j) => { if (!s.exists) { b.set(chunk[j][0], chunk[j][1]); created++; } });
    await b.commit();
  }
  return created;
}
async function fillMissingFields(ref, data) {
  const now = (await ref.get()).data() ?? {};
  const missing = Object.fromEntries(Object.entries(data).filter(([k]) => !(k in now)));
  if (Object.keys(missing).length) await ref.set(missing, { merge: true });
  return Object.keys(missing).length;
}

// A demo account: created when missing. One that exists keeps its profile (name, language, privacy notice accepted,
// active or not): only a missing profile or missing claims are written. On the emulators its password is set again
// (the e2e tests sign in with it); on the real project never (P-84).
async function upsertUser(email, firstName, lastName, role, orgId) {
  let uid;
  const existing = await auth.getUserByEmail(email).catch(() => null);
  if (existing) {
    uid = existing.uid;
    if (!REAL) await auth.updateUser(uid, { password: DEMO_PASSWORD });
  } else {
    uid = (await auth.createUser({ email, password: await newAccountPassword(), emailVerified: true })).uid;
  }
  const profile = db.collection("users").doc(uid);
  if (!(await profile.get()).exists) {
    if (existing?.disabled) await auth.updateUser(uid, { disabled: false });
    await auth.setCustomUserClaims(uid, { role, orgId, active: true, disabledAt: null });
    await profile.set({
      email, firstName, lastName, role, orgId, active: true, disabledAt: null, language: "it",
      privacyNoticeVersion: null, privacyAcceptedAt: null, createdAt: FieldValue.serverTimestamp(),
    });
  } else if (!existing?.customClaims?.role) {
    const p = (await profile.get()).data();
    const disabledAt = typeof p.disabledAt?.toMillis === "function" ? p.disabledAt.toMillis() : (p.disabledAt ?? null);
    await auth.setCustomUserClaims(uid, { role: p.role, orgId: p.orgId, active: p.active === true, disabledAt });
  }
  return email;
}

async function main() {
  const now = FieldValue.serverTimestamp();
  const made = {};
  made.organizations = await createMissing(ORGS.map((o) => [db.collection("organizations").doc(o.id), { name: o.name, type: o.type, language: "it", active: true, createdAt: now }]));

  const accounts = [];
  let p = 0;
  for (const o of ORGS) {
    const roles = o.type === "client" ? ["client_admin", "client_office", "client_warehouse"] : ["asp_admin", "asp_warehouse", "asp_technician"];
    for (const role of roles) {
      const [first, last] = PEOPLE[p++];
      accounts.push([await upsertUser(`${role.replace("_", ".")}.${o.slug}@${DOMAIN}`, first, last, role, o.id), role, o.name]);
    }
  }

  const places = [CLIENT_WAREHOUSE, ...aspWarehouses(), ...Array.from({ length: SITE_COUNT }, (_, i) => site(i + 1))];
  const locations = places.map((l) => [locId(l.code), l]);
  made.locations = await createMissing(locations.map(([id, d]) => [db.collection("locations").doc(id), { ...d, active: true, importId: "seed", createdAt: now, updatedAt: now }]));

  const models = seedModels().map((m) => [mdlId(m.materialCode), { ...m, active: true }]);
  made.models = await createMissing(models.map(([id, d]) => [db.collection("models").doc(id), { ...d, createdAt: now, updatedAt: now }]));

  made.settingFields = 0;
  for (const [ref, data] of [
    [db.collection("settings").doc("branding"), { appName: "SwapTrack", logoPath: null, primaryColor: "#FF6B00" }],
    [db.collection("settings").doc("auth"), { google: false, microsoft: false, mfaAdmins: false, inactivityEnabled: false, inactivityMinutes: 30 }],
    [db.collection("settings").doc("app"), { minVersion: "", emailConfigured: false }],
    [db.collection("settings").doc("privacy"), {
      version: 1, retentionEnabled: false, retentionDays: 365,
      texts: {
        it: "Informativa di esempio (dati inventati). SwapTrack registra i movimenti dei materiali, non l'attività delle persone. Non usa la posizione GPS. Se l'amministratore attiva la lettura automatica dei documenti, le foto e i PDF di DDT e BOM caricati vengono letti da un servizio Google Cloud che li elabora solo nell'Unione europea; le righe proposte si salvano solo dopo la conferma di chi carica il documento.",
        en: "Sample notice (invented data). SwapTrack records the movements of materials, not the activity of people. It does not use GPS location. If the administrator turns on automatic document reading, uploaded photos and PDFs of DDTs and BOMs are read by a Google Cloud service that processes them only in the European Union; the proposed lines are saved only after the uploader confirms them.",
      },
    }],
    [db.collection("settings").doc("importMappings"), { locations: {}, models: {} }],
  ]) made.settingFields += await fillMissingFields(ref, data);

  made.sortingCategories = await createMissing([
    ["reuse", { it: "Riutilizzo", en: "Reuse" }], ["refurbish", { it: "Ricondizionamento", en: "Refurbishment" }], ["scrap", { it: "Rottamazione", en: "Scrap" }],
  ].map(([id, labels], i) => [db.collection("sortingCategories").doc(`cat_${id}`), { labels, active: true, order: i }]));
  made.sortingRules = await createMissing([[db.collection("sortingRules").doc("rule_type_radio"), { siteId: null, modelId: null, equipmentType: "Radio unit", categoryId: "cat_refurbish", active: true }]]);

  console.log(`Seed: ${ORGS.length} organizations, ${accounts.length} demo accounts, ${locations.length} locations, ${models.length} models.`);
  console.log(`Created only what was missing (what exists is never rewritten): ${Object.entries(made).map(([k, n]) => `${k} ${n}`).join(", ")}.`);
  console.table(accounts.map(([email, role, org]) => ({ email, role, org })));
  // Never printed (it is in the README and the e2e helpers; a log can end up anywhere).
  if (!REAL) console.log("Password of every account on the emulators: see README");
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
