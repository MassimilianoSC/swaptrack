// P-84 (P-2): sets a new password on EVERY demo account of the seed (e-mail @swaptrack-demo.test), and on no other
// account. The password is asked twice at a hidden prompt; it is never stored, printed or written to a file.
// Target: the emulators by default (project demo-swaptrack). The real demo project only with BOTH
//   DEMO_PASSWORD_REAL_PROJECT=kronos-caffe-sito   and the argument --yes-real-project
// (PowerShell: $env:DEMO_PASSWORD_REAL_PROJECT="kronos-caffe-sito" then the command)
// (credentials: gcloud auth application-default login). First it says how many accounts it will change and asks.
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { hostOf } from "./emulatorPorts.mjs";
import { askHidden, askLine } from "./prompt.mjs";
import { DEMO_DOMAIN, isDemoAccount, passwordProblem } from "./demoAccounts.mjs";

const REAL = process.env.DEMO_PASSWORD_REAL_PROJECT === "kronos-caffe-sito" && process.argv.includes("--yes-real-project");
if (!REAL) process.env.FIREBASE_AUTH_EMULATOR_HOST ??= hostOf("auth");
const PROJECT = REAL ? "kronos-caffe-sito" : "demo-swaptrack";
initializeApp({ projectId: PROJECT });
const auth = getAuth();

const accounts = [];
let pageToken;
do {
  const page = await auth.listUsers(1000, pageToken);
  accounts.push(...page.users.filter((u) => isDemoAccount(u.email)));
  pageToken = page.pageToken;
} while (pageToken);

console.log(`${REAL ? "REAL project" : "Emulators"} ${PROJECT}: ${accounts.length} demo accounts (@${DEMO_DOMAIN}) will get the new password. No other account is touched.`);
if (!accounts.length) process.exit(0);
const sure = (await askLine('Type "yes" to continue: ')).trim().toLowerCase();
if (!["yes", "sì", "si"].includes(sure)) { console.log("Stopped: nothing changed."); process.exit(1); }

const first = await askHidden("New password (not shown): ");
const problem = passwordProblem(first);
if (problem) { console.log(`Stopped: the password needs ${problem}. Nothing changed.`); process.exit(1); }
if ((await askHidden("Same password again: ")) !== first) { console.log("Stopped: the two passwords differ. Nothing changed."); process.exit(1); }

let updated = 0;
try {
  for (const u of accounts) {
    await auth.updateUser(u.uid, { password: first });
    updated++;
  }
} catch (e) {
  // Never print the password: only the count and the error code.
  console.log(`Stopped after ${updated} of ${accounts.length} accounts: ${e?.code ?? "error"}. Run the script again to finish.`);
  process.exit(1);
}
console.log(`Updated ${updated} accounts.`);
process.exit(0);
