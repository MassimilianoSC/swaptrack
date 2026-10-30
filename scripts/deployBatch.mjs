// P-30: publishes a batch ("lotto") of what is on main to the demo project, step by step, stopping at the first
// error. Run by the project owner only, from the main checkout, after pushing main:
//   node scripts/deployBatch.mjs            checks and the full test round only: nothing goes online
//   node scripts/deployBatch.mjs --yes      the same, then the deploy (rules, indexes, Storage, functions, hosting)
//                                           and the check of the routers' invoker permission
// Prerequisites: firebase login (firebase login:use for this folder), gcloud auth login, the emulator ports free.
import { spawnSync } from "node:child_process";
import { ROOT, FIREBASE, portsOf, busyPorts } from "./emulatorPorts.mjs";

const PROJECT_ALIAS = "demo";
const PROJECT_ID = "kronos-caffe-sito";
const REGION = "europe-west1";
const ROUTERS = ["users", "catalog", "settings", "items", "shipments", "documents", "alerts", "desk"];
const DEPLOY = process.argv.includes("--yes");
let stepNo = 0;

function fail(message) {
  console.error(`\nSTOP at step ${stepNo}: ${message}\nNothing after this step was done.`);
  process.exit(1);
}
function step(title) { stepNo++; console.log(`\n=== ${stepNo}. ${title}`); }
// Runs a command in the repository root, output on screen; stops the script if it fails.
function run(cmd, args, { capture = false } = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit", encoding: "utf8", shell: process.platform === "win32" && cmd !== process.execPath });
  if (r.status !== 0) fail(`"${[cmd, ...args].join(" ")}" ended with code ${r.status}`);
  return (r.stdout ?? "").trim();
}
const firebase = (...args) => run(process.execPath, [FIREBASE, ...args, "--project", PROJECT_ALIAS]);

console.log(`SwapTrack batch publication to ${PROJECT_ID} — ${DEPLOY ? "WITH deploy (--yes)" : "checks only (add --yes to deploy)"}`);

step("Git: branch main, nothing uncommitted, same commit as GitHub");
if (run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { capture: true }) !== "main") fail("this folder is not on the main branch");
if (run("git", ["status", "--porcelain"], { capture: true })) fail("there are uncommitted changes: only what is in git goes online");
run("git", ["fetch", "origin", "main"]);
const head = run("git", ["rev-parse", "HEAD"], { capture: true });
if (head !== run("git", ["rev-parse", "origin/main"], { capture: true })) fail("main is not the same as GitHub: push (or pull) first");
console.log(`commit ${head.slice(0, 7)}`);

step("Emulator ports free (the tests start their own emulators)");
const busy = await busyPorts(portsOf(["auth", "firestore", "functions", "storage", "pubsub"]));
if (busy.length) fail(`port(s) ${busy.join(", ")} in use: close the emulators first`);

step("Full test round: functions build, unit tests, translations, rules and trigger, end-to-end");
run("yarn", ["build:functions"]);
run("yarn", ["test"]);
run("yarn", ["check:i18n"]);
run("node", ["scripts/test-rules.mjs"]);
run("yarn", ["e2e"]);

step("App build for the demo (.env.demo, with type check)");
run("yarn", ["build:demo"]);

if (!DEPLOY) {
  console.log(`\nAll checks passed on commit ${head.slice(0, 7)}. Nothing was published. To publish: node scripts/deployBatch.mjs --yes`);
  process.exit(0);
}

step("Deploy Firestore rules, Firestore indexes, Storage rules");
firebase("deploy", "--only", "firestore:rules,firestore:indexes,storage");

step("Deploy functions (--force: the event trigger has retries on)");
firebase("deploy", "--only", "functions", "--force");

step("Deploy the app (hosting target app = swaptrack-demo.web.app)");
firebase("deploy", "--only", "hosting:app");

step("Invoker permission of the callable routers (allUsers → roles/run.invoker)");
const missing = [];
for (const name of ROUTERS) {
  const policy = JSON.parse(run("gcloud", ["run", "services", "get-iam-policy", name, "--region", REGION, "--project", PROJECT_ID, "--format=json"], { capture: true }) || "{}");
  const ok = (policy.bindings ?? []).some((b) => b.role === "roles/run.invoker" && (b.members ?? []).includes("allUsers"));
  console.log(`${ok ? "OK  " : "MISSING"}  ${name}`);
  if (!ok) missing.push(name);
}
if (missing.length) {
  fail(`the app cannot call ${missing.join(", ")}. Fix, one line per router:\n${missing.map((n) =>
    `  gcloud run services add-iam-policy-binding ${n} --region ${REGION} --project ${PROJECT_ID} --member=allUsers --role=roles/run.invoker`).join("\n")}`);
}

console.log(`\nBatch published: commit ${head.slice(0, 7)} on https://swaptrack-demo.web.app. Send this commit to the team to record the batch.`);
