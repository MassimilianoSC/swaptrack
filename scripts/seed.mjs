// Demo seed, step 2 (SPEC §18): organizations, users (one per role per organization), locations, models, settings.
// Invented data only. Runs ONLY against the emulators of project demo-swaptrack.
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8180";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
const PROJECT = "demo-swaptrack";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Emulators only");

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const auth = getAuth();

export const DEMO_PASSWORD = "SwapDemo2026";
const DOMAIN = "swaptrack-demo.test";
const ORGS = [
  { id: "org_client", name: "Telco Demo", type: "client", slug: "telco" },
  { id: "org_asp_nord", name: "ASP Nord", type: "asp", slug: "nord" },
  { id: "org_asp_centro", name: "ASP Centro", type: "asp", slug: "centro" },
  { id: "org_asp_sud", name: "ASP Sud", type: "asp", slug: "sud" },
];
const PEOPLE = [["Giulia", "Ferri"], ["Marco", "Lunardi"], ["Elena", "Corsini"], ["Paolo", "Brambati"], ["Sara", "Velluti"], ["Luca", "Rinaldetti"],
  ["Chiara", "Montesi"], ["Davide", "Orlandini"], ["Irene", "Castaldo"], ["Fabio", "Serafini"], ["Marta", "Ghidoni"], ["Tommaso", "Pellizza"]];
const REGIONS = { nord: ["Lombardia", "Piemonte", "Veneto"], centro: ["Toscana", "Lazio", "Marche"], sud: ["Campania", "Puglia", "Sicilia"] };
const MANUFACTURERS = ["Nordwave", "Altira Systems", "Kestrel Networks", "Volta Telecom"];
const TYPES = ["Radio unit", "Baseband", "Power supply", "Transmission card", "Antenna module"];

const locId = (code) => `loc_${encodeURIComponent(code)}`;
const mdlId = (code) => `mdl_${encodeURIComponent(code)}`;

async function commitAll(writes) {
  for (let i = 0; i < writes.length; i += 450) {
    const b = db.batch();
    writes.slice(i, i + 450).forEach(([ref, data]) => b.set(ref, data, { merge: true }));
    await b.commit();
  }
}

async function upsertUser(email, firstName, lastName, role, orgId) {
  let uid;
  try { uid = (await auth.getUserByEmail(email)).uid; await auth.updateUser(uid, { password: DEMO_PASSWORD, disabled: false }); }
  catch { uid = (await auth.createUser({ email, password: DEMO_PASSWORD, emailVerified: true })).uid; }
  await auth.setCustomUserClaims(uid, { role, orgId, active: true, disabledAt: null });
  await db.collection("users").doc(uid).set({
    email, firstName, lastName, role, orgId, active: true, disabledAt: null, language: "it",
    privacyNoticeVersion: null, privacyAcceptedAt: null, createdAt: FieldValue.serverTimestamp(),
  });
  return email;
}

async function main() {
  const now = FieldValue.serverTimestamp();
  await commitAll(ORGS.map((o) => [db.collection("organizations").doc(o.id), { name: o.name, type: o.type, language: "it", active: true, createdAt: now }]));

  const accounts = [];
  let p = 0;
  for (const o of ORGS) {
    const roles = o.type === "client" ? ["client_admin", "client_office", "client_warehouse"] : ["asp_admin", "asp_warehouse", "asp_technician"];
    for (const role of roles) {
      const [first, last] = PEOPLE[p++];
      accounts.push([await upsertUser(`${role.replace("_", ".")}.${o.slug}@${DOMAIN}`, first, last, role, o.id), role, o.name]);
    }
  }

  const locations = [[locId("MAG-CLI-01"), { code: "MAG-CLI-01", name: "Magazzino centrale Telco Demo", type: "client_warehouse", aspId: null, address: "Via dei Ricambi 1, Bologna", region: "Emilia-Romagna" }]];
  const asps = ORGS.filter((o) => o.type === "asp");
  asps.forEach((a) => [1, 2].forEach((n) => {
    const code = `MAG-${a.slug.toUpperCase()}-0${n}`;
    locations.push([locId(code), { code, name: `Magazzino ${a.name} ${n}`, type: "asp_warehouse", aspId: a.id, address: `Via Logistica ${n}`, region: REGIONS[a.slug][n - 1] }]);
  }));
  for (let i = 1; i <= 1500; i++) {
    const a = asps[(i - 1) % 3];
    const code = `SITO-${String(i).padStart(5, "0")}`;
    const region = REGIONS[a.slug][i % 3];
    locations.push([locId(code), { code, name: `Stazione ${region} ${i}`, type: "site", aspId: a.id, address: `Località ${i}`, region }]);
  }
  await commitAll(locations.map(([id, d]) => [db.collection("locations").doc(id), { ...d, active: true, importId: "seed", createdAt: now, updatedAt: now }]));

  const models = [];
  for (let i = 0; i < 20; i++) {
    const code = `MC${String(400100 + i * 7)}`;
    models.push([mdlId(code), { materialCode: code, model: `${["RX", "BB", "PSU", "TRX", "AM"][i % 5]}-${100 + i}`, manufacturer: MANUFACTURERS[i % 4], equipmentType: TYPES[i % 5], active: true }]);
  }
  await commitAll(models.map(([id, d]) => [db.collection("models").doc(id), { ...d, createdAt: now, updatedAt: now }]));

  await commitAll([
    [db.collection("settings").doc("branding"), { appName: "SwapTrack", logoPath: null, primaryColor: "#FF6B00" }],
    [db.collection("settings").doc("auth"), { google: false, microsoft: false, mfaAdmins: false, inactivityEnabled: false, inactivityMinutes: 30 }],
    [db.collection("settings").doc("app"), { minVersion: "", emailConfigured: false }],
    [db.collection("settings").doc("privacy"), {
      version: 1, retentionEnabled: false, retentionDays: 365,
      texts: {
        it: "Informativa di esempio (dati inventati). SwapTrack registra i movimenti dei materiali, non l'attività delle persone. Non usa la posizione GPS.",
        en: "Sample notice (invented data). SwapTrack records the movements of materials, not the activity of people. It does not use GPS location.",
      },
    }],
    [db.collection("settings").doc("importMappings"), { locations: {}, models: {} }],
  ]);

  await commitAll([
    ["reuse", { it: "Riutilizzo", en: "Reuse" }], ["refurbish", { it: "Ricondizionamento", en: "Refurbishment" }], ["scrap", { it: "Rottamazione", en: "Scrap" }],
  ].map(([id, labels], i) => [db.collection("sortingCategories").doc(`cat_${id}`), { labels, active: true, order: i }]));
  await commitAll([[db.collection("sortingRules").doc("rule_type_radio"), { siteId: null, modelId: null, equipmentType: "Radio unit", categoryId: "cat_refurbish", active: true }]]);

  console.log(`Seeded ${ORGS.length} organizations, ${accounts.length} users, ${locations.length} locations, ${models.length} models.`);
  console.table(accounts.map(([email, role, org]) => ({ email, role, org, password: DEMO_PASSWORD })));
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
