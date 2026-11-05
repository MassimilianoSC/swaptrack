// P-148: empties the project of the demo, to start again clean (then seed.mjs and fullSeed.mjs fill it again).
//   node scripts/wipeProject.mjs --data                Firestore: every collection of SwapTrack
//   node scripts/wipeProject.mjs --files               Storage: every folder of SwapTrack (the data stay)
//   node scripts/wipeProject.mjs --all                 both
//   ... --keep-people    keeps users, organizations, settings (with the logo) and the catalog (places, models,
//                        categories, rules): only the data of the work go. The normal choice the day before the demo.
//   ... --even-if-referenced   with --files only: go on although documents or pieces point to the files.
//   ... --apply          deletes, after typing the id of the project; without it the plan is only printed.
// Always kept: the active client administrators (users/{uid} and their organization) and settings/privacy, so that
// someone can sign in and invite the others; with none, the script refuses. Only the collections and folders of
// SwapTrack are touched (scripts/wipe.mjs); anything else in the project is listed as "left". Firebase Authentication
// is never touched. Never prints an e-mail or a uid. Run again, it finishes an interrupted wipe.
//
// Target: the emulators by default (project demo-swaptrack). The real demo project only with BOTH
//   WIPE_REAL_PROJECT=kronos-caffe-sito   and the argument --yes-real-project
// (PowerShell: $env:WIPE_REAL_PROJECT="kronos-caffe-sito" then the command; Git Bash: WIPE_REAL_PROJECT=kronos-caffe-sito node ...)
// (credentials: gcloud auth application-default login).
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";
import { hostOf } from "./emulatorPorts.mjs";
import { askLine } from "./prompt.mjs";
import { plan, applyPlan, describe } from "./wipe.mjs";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const REAL = process.env.WIPE_REAL_PROJECT === "kronos-caffe-sito" && has("--yes-real-project");
const mode = { data: has("--data") || has("--all"), files: has("--files") || has("--all"), keepPeople: has("--keep-people") };
if (!mode.data && !mode.files) {
  console.log("Say what to empty: --data (Firestore), --files (Storage) or --all (both). Add --keep-people to keep people and settings.");
  process.exit(2);
}
if (!REAL) {
  process.env.FIRESTORE_EMULATOR_HOST ??= hostOf("firestore");
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= hostOf("storage");
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= hostOf("auth");
}
const PROJECT = REAL ? "kronos-caffe-sito" : "demo-swaptrack";
const BUCKET = REAL ? "kronos-caffe-sito.firebasestorage.app" : "demo-swaptrack.appspot.com";
initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const env = { db: getFirestore(), bucket: getStorage().bucket(), auth: getAuth() };

const what = [mode.data && "data", mode.files && "files"].filter(Boolean).join(" and ");
console.log(`${REAL ? "!! REAL project" : "Emulators"} ${PROJECT} — empty the ${what}${mode.keepPeople ? ", keeping people and settings" : ""} — ${has("--apply") ? "APPLY" : "plan only (add --apply to delete)"}`);
const p = await plan(env, mode);
for (const line of describe(p)) console.log(line);

if (!p.admins) {
  console.log("\nSTOP: no active client administrator with an account that can sign in. Nothing would be left to sign in with: nothing deleted.");
  process.exit(2);
}
if (p.dangling && (p.dangling.documents || p.dangling.items) && !has("--even-if-referenced")) {
  console.log("\nSTOP: with the files gone, those documents would show no preview, the pieces would lose their photos and the automatic reading of those documents would fail. To go on anyway add --even-if-referenced. Nothing deleted.");
  process.exit(2);
}
const toDelete = p.collections.reduce((n, c) => n + c.delete, 0) + p.folders.filter((f) => p.deleteFolders.includes(f.name)).reduce((n, f) => n + f.files, 0);
if (!has("--apply")) {
  console.log(`\nPlan only: ${toDelete} documents and files would be deleted. Nothing was deleted.`);
  process.exit(0);
}
if (!toDelete) { console.log("\nNothing to delete."); process.exit(0); }
// resetDemo.mjs asks once and passes the id it was given; otherwise the id is typed here.
const typed = process.env.WIPE_CONFIRMED_PROJECT || await askLine(`\nThis deletes ${toDelete} documents and files and cannot be undone. Type the id of the project (${PROJECT}) to go on: `);
if (typed.trim() !== PROJECT) { console.log("Not the id of the project: nothing deleted."); process.exit(1); }
await applyPlan(env, p);
const after = await plan(env, mode);
const leftover = after.collections.reduce((n, c) => n + c.delete, 0) + after.folders.filter((f) => after.deleteFolders.includes(f.name)).reduce((n, f) => n + f.files, 0);
console.log(leftover ? `\nDeleted, but ${leftover} are still there: run the same command again.` : "\nDone: deleted everything in the plan.");
process.exit(leftover ? 1 : 0);
