// D-67: an online PREVIEW of the app, for the owner's check before the test round and the batch. Run by the project
// owner only (it writes to the cloud, never to the live site), from the main checkout:
//   node scripts/previewApp.mjs                    channel "anteprima", 7 days
//   node scripts/previewApp.mjs --channel <name>   another channel
// Steps: main with nothing uncommitted (the preview shows what is in git), dependencies as in the lockfiles, the demo
// build (.env.demo, the same project as the live site), `firebase hosting:channel:deploy` on the app site. Deploying
// the same channel again updates it at the same address and restarts its 7 days. firebase-tools adds the channel's
// domain to the authorized domains of Firebase Auth by itself (and removes those of expired channels); if it cannot,
// it says so with a link to the console. Only the app changes: functions, rules and indexes are those online.
import { spawnSync } from "node:child_process";
import { ROOT, FIREBASE } from "./emulatorPorts.mjs";

const PROJECT_ALIAS = "demo";
const argOf = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const CHANNEL = argOf("--channel") ?? "anteprima";
const EXPIRES = "7d";
let stepNo = 0;

function fail(message) {
  console.error(`\nSTOP at step ${stepNo}: ${message}\nNothing after this step was done.`);
  process.exit(1);
}
function step(title) { stepNo++; console.log(`\n=== ${stepNo}. ${title}`); }
function run(cmd, args, { capture = false } = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit", encoding: "utf8", shell: process.platform === "win32" && cmd !== process.execPath });
  if (r.status !== 0) fail(`"${[cmd, ...args].join(" ")}" ended with code ${r.status}`);
  return (r.stdout ?? "").trim();
}

if (!/^[a-z0-9-]{1,40}$/.test(CHANNEL) || CHANNEL === "live") { console.error(`previewApp: "${CHANNEL}" is not a preview channel name (lower-case letters, digits, hyphens; never "live").`); process.exit(2); }
console.log(`SwapTrack app preview on channel "${CHANNEL}" (${EXPIRES}) of the demo project — the live site does not change`);

step("Git: branch main, nothing uncommitted (the preview shows what is in git)");
if (run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { capture: true }) !== "main") fail("this folder is not on the main branch");
if (run("git", ["status", "--porcelain"], { capture: true })) fail("there are uncommitted changes: the preview must show what is in git");
const head = run("git", ["rev-parse", "--short", "HEAD"], { capture: true });
console.log(`commit ${head}`);

step("Dependencies exactly as in the lockfile");
run("yarn", ["install", "--frozen-lockfile"]);

step("App build for the demo (.env.demo, with type check)");
run("yarn", ["build:demo"]);

step(`Deploy of the app to the preview channel "${CHANNEL}" (hosting target app)`);
const out = run(process.execPath, [FIREBASE, "hosting:channel:deploy", CHANNEL, "--only", "app", "--expires", EXPIRES, "--project", PROJECT_ALIAS, "--json"], { capture: true });
let url = null, expires = null;
try {
  const result = JSON.parse(out.slice(out.indexOf("{"))).result ?? {};
  const site = Object.values(result)[0] ?? {};
  url = site.url ?? null;
  expires = site.expireTime ?? null;
} catch { /* printed below as it is */ }
if (!url) { console.log(out); fail("the address of the preview was not found in the answer above"); }

console.log(`\nPreview ready: ${url}`);
console.log(`Commit ${head}${expires ? `, expires ${new Date(expires).toLocaleString("it-IT")}` : ""}.`);
console.log("Attenzione: l'anteprima usa i dati veri della demo.");
