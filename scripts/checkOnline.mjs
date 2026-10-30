// P-67: READ-ONLY check before publishing batch 1. Prints counts only, never data of people:
//   - events with no processedAt (never processed by the trigger), by type;
//   - documents with aspId null (saved by a client role before P-49), by kind.
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
console.log(pending.length || docs.size
  ? "\nSend these numbers to the team: something must be fixed before or right after the batch."
  : "\nNothing to fix: no unprocessed event, no document without ASP.");
