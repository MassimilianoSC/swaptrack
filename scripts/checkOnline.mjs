// P-67: READ-ONLY check before publishing a batch and before the demo. Prints counts only, never data of people:
//   - events with no processedAt (never processed by the trigger), by type;
//   - documents with aspId null (saved by a client role before P-49), by kind;
//   - BOMs with lines without direction (P-92), and how many lines;
//   - before the demo (P-142): documents of the AI procedure (open and closed), demo DDTs already saved, documents
//     with demo serials TD26… in their lines, BOMs of the demo site SITO-00013, demo label codes already read with the
//     state and place of their piece, shipment drafts, open alerts and anomalies, pieces to complete, the AI switch.
// Target: the emulators by default (project demo-swaptrack). The real demo project only with BOTH
//   CHECK_REAL_PROJECT=kronos-caffe-sito   and the argument --yes-real-project
// (PowerShell: $env:CHECK_REAL_PROJECT="kronos-caffe-sito" then the command; Git Bash: CHECK_REAL_PROJECT=kronos-caffe-sito node ...)
// (credentials: gcloud auth application-default login). Nothing is ever written.
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { hostOf } from "./emulatorPorts.mjs";

const REAL = process.env.CHECK_REAL_PROJECT === "kronos-caffe-sito" && process.argv.includes("--yes-real-project");
if (!REAL) process.env.FIRESTORE_EMULATOR_HOST ??= hostOf("firestore");
const PROJECT = REAL ? "kronos-caffe-sito" : "demo-swaptrack";
initializeApp({ projectId: PROJECT });
const db = getFirestore();

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
