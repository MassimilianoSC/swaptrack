// P-148: one command to start the demo again clean, the day before. In a row, stopping at the first error:
//   1. check: an active client administrator who can sign in (otherwise nothing is done);
//   2. wipeProject --all --keep-people: the data of the work and their files go; people, organizations, settings
//      (with the logo) and the catalog stay;
//   3. seed: creates only what is missing (demo accounts, places, models, settings fields), rewrites nothing;
//   4. fullSeed: the demo data again (about two months of readings, documents, shipments, alerts);
//   5. checkOnline: what the demo script takes for granted (OK / NO per line).
//   node scripts/resetDemo.mjs            shows the plan and the numbers; nothing is written
//   node scripts/resetDemo.mjs --apply    asks once for the id of the project, then runs the five steps
// Target: the emulators by default (project demo-swaptrack). The real demo project only with BOTH
//   RESET_REAL_PROJECT=kronos-caffe-sito   and the argument --yes-real-project
// (PowerShell: $env:RESET_REAL_PROJECT="kronos-caffe-sito" then the command; Git Bash: RESET_REAL_PROJECT=kronos-caffe-sito node ...)
// (credentials: gcloud auth application-default login). The steps are the scripts in scripts/, run as they are: this
// file only puts them in a row and passes them the same target.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { askLine } from "./prompt.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REAL = process.env.RESET_REAL_PROJECT === "kronos-caffe-sito" && process.argv.includes("--yes-real-project");
const APPLY = process.argv.includes("--apply");
const PROJECT = REAL ? "kronos-caffe-sito" : "demo-swaptrack";
const realArgs = REAL ? ["--yes-real-project"] : [];
const realEnv = REAL ? { WIPE_REAL_PROJECT: PROJECT, SEED_REAL_PROJECT: PROJECT, CHECK_REAL_PROJECT: PROJECT } : {};

function step(n, title, script, args = [], extraEnv = {}) {
  console.log(`\n=== ${n}. ${title}`);
  const r = spawnSync(process.execPath, [`scripts/${script}`, ...args, ...realArgs], { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...realEnv, ...extraEnv } });
  if (r.status !== 0) {
    console.log(`\nSTOP at step ${n} (${script} ended with code ${r.status}). The steps after it were not run.`);
    process.exit(r.status || 1);
  }
}

console.log(`${REAL ? "!! REAL project" : "Emulators"} ${PROJECT} — start the demo again clean — ${APPLY ? "APPLY" : "plan only (add --apply to run it)"}`);
// Steps 1 and 2 as a plan: wipeProject without --apply checks the administrator and prints what would go.
step(1, "Administrator check and what would be deleted (nothing is deleted here)", "wipeProject.mjs", ["--all", "--keep-people"]);
if (!APPLY) {
  console.log("\nWith --apply, after the id of the project: 2. delete the above, 3. seed (only what is missing), 4. full seed (about 12,000 readings: some minutes),");
  console.log("5. checkOnline. Nothing was written.");
  process.exit(0);
}
const typed = await askLine(`\nThis deletes the data of the work and their files, and cannot be undone. Type the id of the project (${PROJECT}) to go on: `);
if (typed.trim() !== PROJECT) { console.log("Not the id of the project: nothing done."); process.exit(1); }
step(2, "Delete the data of the work (people, settings and catalog stay)", "wipeProject.mjs", ["--all", "--keep-people", "--apply"], { WIPE_CONFIRMED_PROJECT: PROJECT });
step(3, "Seed: create only what is missing", "seed.mjs");
step(4, "Full seed: the demo data", "fullSeed.mjs");
step(5, "Check: what the demo script takes for granted", "checkOnline.mjs");
console.log("\nDone. Read the lines of step 5: every NO is to be fixed before the demo (see PRIMA_DELLA_PRESENTAZIONE/LEGGIMI.md).");
