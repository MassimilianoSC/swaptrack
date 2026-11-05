// P-67: READ-ONLY check before publishing a batch and before the demo. Prints counts only, never data of people:
//   - events with no processedAt (never processed by the trigger), by type;
//   - documents with aspId null (saved by a client role before P-49), by kind;
//   - BOMs with lines without direction (P-92), and how many lines;
//   - before the demo (P-142): documents of the AI procedure (open and closed), demo DDTs already saved, documents
//     with demo serials TD26… in their lines, BOMs of the demo site SITO-00013, demo label codes already read with the
//     state and place of their piece, shipment drafts, open alerts and anomalies, pieces to complete, the AI switch;
//   - what the demo script takes for granted (DEMO_PREREQUISITI, short version): the seven accounts (role and
//     organization only), counts of organizations, places, models, sorting categories and rule, the settings, the
//     dates of the readings and the month for «Reports», the aggregates, demo serials already expected, /guida.html.
// Target: the emulators by default (project demo-swaptrack). The real demo project only with BOTH
//   CHECK_REAL_PROJECT=kronos-caffe-sito   and the argument --yes-real-project
// (PowerShell: $env:CHECK_REAL_PROJECT="kronos-caffe-sito" then the command; Git Bash: CHECK_REAL_PROJECT=kronos-caffe-sito node ...)
// (credentials: gcloud auth application-default login). Nothing is ever written.
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { createRequire } from "node:module";
import { hostOf } from "./emulatorPorts.mjs";
import { DEMO_DOMAIN } from "./demoAccounts.mjs";
import { ORGS, seedModels } from "./seedCatalog.mjs";

const { computeCodeId, normalizeBarcode } = createRequire(import.meta.url)("../functions/src/codeId.node.js");
const REAL = process.env.CHECK_REAL_PROJECT === "kronos-caffe-sito" && process.argv.includes("--yes-real-project");
if (!REAL) {
  process.env.FIRESTORE_EMULATOR_HOST ??= hostOf("firestore");
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= hostOf("auth");
}
const PROJECT = REAL ? "kronos-caffe-sito" : "demo-swaptrack";
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const auth = getAuth();

const countBy = (docs, field) => docs.reduce((m, d) => m.set(String(d.get(field)), (m.get(String(d.get(field))) ?? 0) + 1), new Map());
const print = (title, m) => {
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  console.log(`\n${title}: ${total}`);
  for (const [k, n] of [...m.entries()].sort()) console.log(`  ${k}: ${n}`);
};

console.log(`${REAL ? "REAL project" : "Emulators"} ${PROJECT} — read only`);
// Only the two fields needed are read (no userId, no codes, no locations).
const events = await db.collection("events").select("type", "processedAt").get();
const pending = events.docs.filter((d) => !d.get("processedAt"));
console.log(`Events read: ${events.size}`);
print("Events never processed (no processedAt), by type", countBy(pending, "type"));
const docs = await db.collection("documents").where("aspId", "==", null).select("kind").get();
print("Documents with aspId null, by kind", countBy(docs.docs, "kind"));
// P-92 (§11.2): BOM lines must have a direction; lines saved without one are not shown to the technician.
const boms = await db.collection("documents").where("kind", "==", "bom").select("lines").get();
const undirected = boms.docs.map((d) => (d.get("lines") ?? []).filter((l) => !l?.direction).length).filter((n) => n > 0);
console.log(`\nBOMs read: ${boms.size}; BOMs with lines without direction: ${undirected.length} (${undirected.reduce((a, b) => a + b, 0)} lines)`);
const toFix = pending.length || docs.size || undirected.length;
console.log(toFix
  ? "\nSend these numbers to the team: something must be fixed before or right after the batch."
  : "\nNothing to fix: no unprocessed event, no document without ASP, no BOM line without direction.");

// Before the demo: what the manual checks and the AI procedure (P-124) may have left. Counts and invented demo
// numbers only (documents and codes of demo-docs), never people.
console.log("\n--- Before the demo (what the checks may have left)");
const allDocs = await db.collection("documents").select("number", "kind", "status", "version", "locationId", "lines").get();
const byNumber = (prefix) => allDocs.docs.filter((d) => String(d.get("number") ?? "").startsWith(prefix));
const place = (id) => String(id ?? "—").replace(/^loc_/, "");
const listDocs = (title, list, extra = () => "") => {
  console.log(`${title}: ${list.length}`);
  for (const d of list) console.log(`  ${d.get("number")} (${d.get("kind")}, ${d.get("status")}, v${d.get("version") ?? 1}, ${place(d.get("locationId"))})${extra(d)}`);
};
const aiDocs = byNumber("AI-PROVA");
listDocs("Documents of the AI procedure (AI-PROVA-…) still OPEN, to close before the demo", aiDocs.filter((d) => d.get("status") !== "closed"));
listDocs("Documents of the AI procedure already closed (nothing to do)", aiDocs.filter((d) => d.get("status") === "closed"));
listDocs("Demo DDTs already saved (TD-2026-…): the demo would see «already exists»", byNumber("TD-2026-"));
// P-142: any document that lists the demo serials (TD26…), whatever its number: its expected lines are already there.
const demoLines = (d) => (d.get("lines") ?? []).filter((l) => String(l?.codeRaw ?? "").startsWith("TD26")).length;
listDocs("Documents with demo serials in their lines (TD26…), any number", allDocs.docs.filter((d) => demoLines(d) > 0), (d) => `: ${demoLines(d)} lines TD26…`);
listDocs("BOMs of the demo site SITO-00013 already saved", allDocs.docs.filter((d) => d.get("kind") === "bom" && d.get("locationId") === "loc_SITO-00013"));
const demoCodes = await db.collection("codes").where("raw", ">=", "TD26").where("raw", "<", "TD27").select("raw", "itemId").get();
console.log(`Codes of the demo labels already read (TD26…): ${demoCodes.size}${demoCodes.size ? " — the demo would show «already read» or «is already at …» for them:" : ""}`);
// For each, the state and the place of its piece: what the demo scanning would meet.
const pieces = demoCodes.size ? await db.getAll(...demoCodes.docs.map((c) => db.collection("items").doc(String(c.get("itemId") || "-"))), { fieldMask: ["status", "currentLocationId"] }) : [];
const pieceOf = new Map(pieces.map((p) => [p.id, p]));
for (const c of [...demoCodes.docs].sort((a, b) => String(a.get("raw")).localeCompare(String(b.get("raw"))))) {
  const p = pieceOf.get(String(c.get("itemId")));
  console.log(`  ${c.get("raw")} → ${p?.exists ? `${p.get("status")}, ${place(p.get("currentLocationId"))}` : "no piece"}`);
}
const drafts = await db.collection("shipments").where("status", "==", "draft").select("kind").get();
print("Shipment drafts still open, by kind", countBy(drafts.docs, "kind"));
const alerts = await db.collection("alerts").where("closedAt", "==", null).select("kind").get();
print("Open alerts, by kind", countBy(alerts.docs, "kind"));
const anomalies = await db.collection("anomalies").where("resolution", "==", null).select("type").get();
print("Open anomalies, by type", countBy(anomalies.docs, "type"));
const toComplete = (await db.collection("items").where("needsModel", "==", true).count().get()).data().count;
console.log(`\nPieces «to complete» (no model): ${toComplete}`);
const features = (await db.collection("settings").doc("features").get()).data() ?? {};
console.log(`Automatic reading (AI): ${features.aiDocumentExtraction ? "ON" : "off"}, daily limit per person ${features.aiDailyLimit ?? 20}`);

// What the demo script takes for granted online (swaptrack-guida/DEMO_PREREQUISITI.md, short version agreed with the
// team). OK/NO per line; roles, organizations, codes, states and numbers only, never an e-mail.
console.log("\n--- What the demo script takes for granted");
let no = 0;
const line = (ok, text) => { if (!ok) no++; console.log(`${ok ? "OK  " : "NO  "} ${text}`); };
const settings = Object.fromEntries(await Promise.all(["app", "auth", "privacy", "branding"].map(async (id) => [id, (await db.collection("settings").doc(id).get()).data() ?? {}])));
// A) The seven accounts of the script: claims, profile, Auth on, privacy notice already accepted.
const ACCOUNTS = [["asp_warehouse", "nord"], ["asp_technician", "nord"], ["asp_admin", "nord"], ["client_warehouse", "telco"], ["client_office", "telco"], ["client_admin", "telco"], ["asp_warehouse", "centro"]];
for (const [role, slug] of ACCOUNTS) {
  const orgId = ORGS.find((o) => o.slug === slug).id;
  const user = await auth.getUserByEmail(`${role.replace("_", ".")}.${slug}@${DEMO_DOMAIN}`).catch(() => null);
  if (!user) { line(false, `account ${role} of ${orgId}: missing`); continue; }
  const profile = (await db.collection("users").doc(user.uid).get()).data() ?? {};
  const c = user.customClaims ?? {};
  const wrong = [
    !(c.role === role && c.orgId === orgId && c.active === true) && "claims",
    !(profile.role === role && profile.orgId === orgId && profile.active === true) && "profile",
    user.disabled && "Auth disabled",
  ].filter(Boolean);
  line(!wrong.length, `account ${role} of ${orgId}${wrong.length ? `: wrong ${wrong.join(", ")}` : ""}`);
  const accepted = profile.privacyNoticeVersion != null && profile.privacyNoticeVersion === settings.privacy.version;
  console.log(`       privacy notice: ${accepted ? `accepted (v${profile.privacyNoticeVersion})` : `not accepted (v${profile.privacyNoticeVersion ?? "—"} of v${settings.privacy.version ?? "—"}): shown at the first sign-in`}`);
}
// B–E) One count each.
const active = async (col) => (await db.collection(col).where("active", "==", true).count().get()).data().count;
line((await active("organizations")) >= ORGS.length, `active organizations: ${await active("organizations")} (the seed has ${ORGS.length})`);
const places = await db.getAll(...["MAG-NORD-01", "MAG-CLI-01", "SITO-00013", "MAG-CENTRO-01"].map((c) => db.collection("locations").doc(`loc_${c}`)), { fieldMask: ["active"] });
line(places.every((p) => p.exists && p.get("active") === true), `places of the script (MAG-NORD-01, MAG-CLI-01, SITO-00013, MAG-CENTRO-01) active: ${places.filter((p) => p.exists && p.get("active") === true).length} of 4`);
const models = seedModels().length;
line((await active("models")) >= models, `active models: ${await active("models")} (the seed has ${models})`);
line((await active("sortingCategories")) >= 3, `active sorting categories: ${await active("sortingCategories")} (reuse, refurbish, scrap)`);
const rule = (await db.collection("sortingRules").doc("rule_type_radio").get()).data();
line(rule?.active === true && rule?.categoryId === "cat_refurbish", `sorting rule Radio unit → cat_refurbish: ${rule ? (rule.active ? `active, ${rule.categoryId}` : "off") : "missing"}`);
// F) Settings, the values the script shows.
console.log(`       settings: app minVersion «${settings.app.minVersion ?? ""}», e-mail ${settings.app.emailConfigured ? "ON" : "off"}; Google sign-in ${settings.auth.google ? "ON" : "off"}, inactivity sign-out ${settings.auth.inactivityEnabled ? "ON" : "off"}; privacy v${settings.privacy.version ?? "—"}; app name «${settings.branding.appName ?? ""}»; AI ${features.aiDocumentExtraction ? "ON" : "off"}`);
line(!settings.app.minVersion, "no minimum app version (no phone is asked to update)");
// G) The dates of the readings: the month to pick in «Reports» → «Generate».
const months = new Map();
const monthOf = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" });
const dates = (await db.collection("events").select("scannedAt").get()).docs.map((d) => d.get("scannedAt")?.toDate?.()).filter(Boolean);
for (const d of dates) { const m = monthOf.format(d).slice(0, 7); months.set(m, (months.get(m) ?? 0) + 1); }
const day = (d) => d.toISOString().slice(0, 10);
const sorted = dates.sort((a, b) => a - b);
console.log(`       readings: ${dates.length}${dates.length ? `, from ${day(sorted[0])} to ${day(sorted.at(-1))}` : ""}; by month: ${[...months].sort().map(([m, n]) => `${m} ${n}`).join(", ") || "—"}`);
const best = [...months].sort((a, b) => b[1] - a[1])[0];
line(!!best, `month to pick in «Reports»: ${best ? `${best[0]} (${best[1]} readings)` : "none, no readings"}`);
const aggregates = (await db.collection("aggregates").count().get()).data().count;
line(aggregates > 0, `aggregates (home dashboard): ${aggregates}${aggregates ? "" : " — the dashboard is empty until the nightly recount"}`);
// H) The serials of the demo labels must not be expected by any document yet.
const DEMO_SERIALS = [
  ...Array.from({ length: 8 }, (_, i) => `TD260412${String(i + 1).padStart(3, "0")}`), ...Array.from({ length: 44 }, (_, i) => `TD260413${String(i + 1).padStart(3, "0")}`),
  "TD260499001", ...Array.from({ length: 5 }, (_, i) => `TD26R13${String(i + 1).padStart(3, "0")}`), ...Array.from({ length: 4 }, (_, i) => `TD26I13${String(i + 1).padStart(3, "0")}`),
];
const codeIds = DEMO_SERIALS.map((s) => computeCodeId(s));
const expected = [];
for (let i = 0; i < codeIds.length; i += 30) expected.push(...(await db.collection("expectedCodes").where("codeId", "in", codeIds.slice(i, i + 30)).select("codeId", "documentId", "modelId", "materialCode").get()).docs);
const serialOf = (d) => DEMO_SERIALS[codeIds.indexOf(d.get("codeId"))];
const serialsOf = (list) => [...new Set(list.map(serialOf))].sort().join(", ");
// Open (or checked) documents make the demo see «expected» lines; closed ones (the AI trials, P-142) only give the
// model of the piece (findModel), so for those the check is that each serial points to one model of the catalog.
const docIds = [...new Set(expected.map((d) => String(d.get("documentId"))))];
const docStatus = new Map((docIds.length ? await db.getAll(...docIds.map((id) => db.collection("documents").doc(id)), { fieldMask: ["status"] }) : [])
  .map((d) => [d.id, d.exists ? d.get("status") : "deleted"]));
// P-150: the BOM of the demo site. The demo's own BOM (only the serials TD26R13…/TD26I13…) may be loaded the day before
// (COPIONE «Prima della demo» 3); any other open BOM there, or two of the demo's, would be picked instead of it.
const isOpen = (d) => ["open", "checked"].includes(d.get("status"));
const demoSiteBoms = allDocs.docs.filter((d) => d.get("kind") === "bom" && d.get("locationId") === "loc_SITO-00013" && isOpen(d));
const isDemoBom = (d) => { const s = (d.get("lines") ?? []).filter((l) => l?.codeRaw); return s.length > 0 && s.every((l) => /^TD26[RI]13/.test(String(l.codeRaw))); };
const demoBoms = demoSiteBoms.filter(isDemoBom), otherBoms = demoSiteBoms.filter((d) => !isDemoBom(d));
line(!otherBoms.length && demoBoms.length <= 1, `open BOMs at the demo site SITO-00013: ${otherBoms.length ? `${otherBoms.map((d) => d.get("number")).join(", ")} not of the demo — close them in the app` : "none other than the demo's"}${demoBoms.length > 1 ? `; ${demoBoms.length} BOMs of the demo (${demoBoms.map((d) => d.get("number")).join(", ")}) — keep one, close the others` : ""}`);
if (demoBoms.length === 1) console.log(`       the BOM of the demo is loaded: ${demoBoms[0].get("number")} (tappa 4)`);
const demoBomIds = new Set(demoBoms.map((d) => d.id));
const live = expected.filter((d) => ["open", "checked"].includes(docStatus.get(String(d.get("documentId")))) && !demoBomIds.has(String(d.get("documentId"))));
line(!live.length, `demo serials expected by an open document already (expectedCodes): ${live.length}${live.length ? ` — ${serialsOf(live)}` : ""}`);
const closedHints = expected.filter((d) => !live.includes(d));
if (closedHints.length) {
  const catalog = (await db.collection("models").select("materialCode").get()).docs;
  const byCode = new Map(catalog.map((m) => [normalizeBarcode(String(m.get("materialCode") ?? "")), m.id]));
  const ids = new Set(catalog.map((m) => m.id));
  const modelOf = (h) => (h.get("modelId") && ids.has(h.get("modelId")) ? h.get("modelId") : byCode.get(normalizeBarcode(String(h.get("materialCode") ?? ""))) ?? null);
  const models = new Map();
  for (const h of closedHints) models.set(serialOf(h), [...(models.get(serialOf(h)) ?? []), modelOf(h)]);
  const bad = [...models].filter(([, m]) => m.includes(null) || new Set(m).size > 1).map(([s]) => s).sort();
  line(!bad.length, `demo serials in closed documents (only the model of the piece): ${closedHints.length} lines of ${models.size} serials${bad.length ? ` — no model of the catalog or different models for ${bad.join(", ")}` : ", each gives one model of the catalog"}`);
}
// I) The guide of the app (the published site only).
if (REAL) {
  const status = await fetch("https://swaptrack-demo.web.app/guida.html", { method: "HEAD" }).then((r) => r.status, () => "no answer");
  line(status === 200, `https://swaptrack-demo.web.app/guida.html: ${status}`);
} else console.log("       guida.html: checked only on the real project");
console.log(no ? `\n${no} line(s) NO: send them to the team before the demo.` : "\nEverything the demo script takes for granted is there.");
