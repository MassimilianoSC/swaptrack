// P-50: documents saved by a client role before P-49 have aspId null, so the ASP of their location never sees them
// (rules), the BOM check ignores them and their files sit under documents/client/. This script lists them and,
// only with --apply, gives each one the ASP of its location: the document, its expectedCodes and alerts, and a
// copy of its files under documents/{aspId}/... (the old files are left in place and listed: deleting them is a
// separate decision).
//
// Target: the emulators by default (project demo-swaptrack). The real demo project only with BOTH
//   FIX_REAL_PROJECT=kronos-caffe-sito   and the argument --yes-real-project
// (credentials: gcloud auth application-default login). Without --apply nothing is written.
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { hostOf } from "./emulatorPorts.mjs";

const REAL = process.env.FIX_REAL_PROJECT === "kronos-caffe-sito" && process.argv.includes("--yes-real-project");
const APPLY = process.argv.includes("--apply");
if (!REAL) {
  process.env.FIRESTORE_EMULATOR_HOST ??= hostOf("firestore");
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= hostOf("storage");
}
const PROJECT = REAL ? "kronos-caffe-sito" : "demo-swaptrack";
const BUCKET = REAL ? "kronos-caffe-sito.firebasestorage.app" : "demo-swaptrack.appspot.com";
initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore();
const bucket = getStorage().bucket();

console.log(`${REAL ? "!! REAL project" : "Emulators"} ${PROJECT} — ${APPLY ? "APPLY: writing" : "list only (add --apply to write)"}`);
const docs = (await db.collection("documents").where("aspId", "==", null).get()).docs;
if (!docs.length) { console.log("No document with aspId null. Nothing to do."); process.exit(0); }

let fixed = 0, skipped = 0;
const leftovers = [];
for (const d of docs) {
  const doc = d.data();
  const loc = (await db.collection("locations").doc(String(doc.locationId)).get()).data();
  const aspId = loc?.aspId ?? null;
  const files = Array.isArray(doc.files) ? doc.files : [];
  console.log(`- ${d.id}  ${doc.kind}  n. ${doc.number}  location ${loc?.code ?? doc.locationId}  -> ${aspId ?? "NO ASP (skipped)"}  files: ${files.length}`);
  if (!aspId) { skipped++; continue; }
  if (!APPLY) continue;
  const newFiles = [];
  for (const path of files) {
    const target = String(path).replace(/^documents\/client\//, `documents/${aspId}/`);
    if (target !== path) {
      await bucket.file(path).copy(bucket.file(target));
      leftovers.push(path);
    }
    newFiles.push(target);
  }
  const batch = db.batch();
  batch.update(d.ref, { aspId, files: newFiles });
  for (const e of (await db.collection("expectedCodes").where("documentId", "==", d.id).get()).docs) batch.update(e.ref, { aspId });
  for (const a of (await db.collection("alerts").where("documentId", "==", d.id).get()).docs) if (a.get("aspId") == null) batch.update(a.ref, { aspId });
  await batch.commit();
  fixed++;
}
console.log(`Documents with aspId null: ${docs.length}; ${APPLY ? `fixed ${fixed}` : `to fix ${docs.length - skipped}`}; without ASP: ${skipped}.`);
if (leftovers.length) console.log(`Old files copied and left in place (delete them separately if wanted):\n  ${leftovers.join("\n  ")}`);
