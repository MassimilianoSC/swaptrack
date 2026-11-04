// D-67: a LOCAL preview for the owner's check when both the app and the server change: the emulators with the full
// seed (from the seed cache when it is there) and the development app on port 3010, open until Ctrl+C; then the
// emulators are stopped as always (emulators.mjs). From the repository root:
//   node scripts/previewLocal.mjs
// While it runs it holds the emulators (one instance at a time, CLAUDE.md §5). It never prints a password.
import { spawnSync, spawn } from "node:child_process";
import { ROOT } from "./emulatorPorts.mjs";
import { ORGS } from "./seedCatalog.mjs";
import { DEMO_DOMAIN } from "./demoAccounts.mjs";

const ROLES = { client: ["client_admin", "client_office", "client_warehouse"], asp: ["asp_admin", "asp_warehouse", "asp_technician"] };
const accounts = ORGS.flatMap((o) => ROLES[o.type].map((role) => [`${role.replace("_", ".")}.${o.slug}@${DEMO_DOMAIN}`, role, o.name]));

console.log("SwapTrack local preview: emulators with the full seed + the app on http://localhost:3010");
console.log("Demo accounts (password: the one of the emulators, in the README):");
for (const [email, role, org] of accounts) console.log(`  ${email.padEnd(46)} ${role.padEnd(17)} ${org}`);

const build = spawnSync("yarn", ["build:functions"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
if (build.status !== 0) { console.error("previewLocal: the functions did not build."); process.exit(build.status ?? 1); }

// The app starts with node (copy-wasm, then vite), not with yarn: on Windows Ctrl+C on a yarn command asks
// "Terminate batch job (Y/N)?".
const app = "node scripts/copy-wasm.mjs && node node_modules/vite/bin/vite.js";
console.log("\nOpen http://localhost:3010 when vite says it is ready. Press Ctrl+C here to stop everything.\n");
process.on("SIGINT", () => console.log("previewLocal: stopping…"));
const child = spawn(process.execPath, [`${ROOT}scripts/emulators.mjs`, "--seed", "yarn seed && yarn seed:full", "--run", app], { cwd: ROOT, stdio: "inherit" });
child.on("exit", (code) => process.exit(code === 3 ? 3 : 0));
