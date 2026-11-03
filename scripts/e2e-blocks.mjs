// D-60: the end-to-end round in blocks, each on fresh emulators (scripts/emulators.mjs: seed, tests, stop), because the
// Firestore emulator slows down with every test (see e2eBlocksPlan.mjs). From the repository root:
//   node scripts/e2e-blocks.mjs                  every block of e2e/blocks.json, then one line per block
//   node scripts/e2e-blocks.mjs --block <name>   one block only
// Before starting it checks that every e2e/*.spec.ts is in exactly one block. A red block does not stop the others;
// the exit code is 1 if any block is red, 2 if the plan is wrong. Build the functions first (yarn build:functions).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { ROOT } from "./emulatorPorts.mjs";
import { SEEDS, filtersOf } from "./e2eBlocksPlan.mjs";
import { checkBlocks } from "../e2e/check-blocks.mjs";

const argOf = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const planFile = `${ROOT}e2e/blocks.json`;
const only = argOf("--block");

let plan;
try { plan = JSON.parse(readFileSync(planFile, "utf8")); } catch (e) { console.error(`e2e-blocks: cannot read ${planFile}: ${e.message}`); process.exit(2); }
const errors = checkBlocks();
if (errors.length) { console.error(`e2e-blocks: the plan is wrong:\n  ${errors.join("\n  ")}`); process.exit(2); }
const blocks = only ? plan.blocks.filter((b) => b.name === only) : plan.blocks;
if (!blocks.length) { console.error(`e2e-blocks: no block named "${only}"`); process.exit(2); }

const results = [];
for (const [i, b] of blocks.entries()) {
  console.log(`\n=== e2e block ${i + 1}/${blocks.length}: ${b.name} (${b.files.length} files, seed ${b.seed})`);
  const started = Date.now();
  const r = spawnSync(process.execPath, [`${ROOT}scripts/emulators.mjs`, "--seed", SEEDS[b.seed], "--run", `yarn e2e:only ${filtersOf(b).join(" ")}`],
    { cwd: ROOT, stdio: "inherit" });
  results.push({ name: b.name, ok: r.status === 0, code: r.status, min: (Date.now() - started) / 60000 });
}

console.log("\n=== e2e blocks");
for (const r of results) console.log(`${r.ok ? "OK  " : "RED "} ${r.name.padEnd(20)} ${r.min.toFixed(1)} min${r.ok ? "" : ` (exit ${r.code})`}`);
const red = results.filter((r) => !r.ok);
console.log(red.length ? `${red.length} block(s) red: ${red.map((r) => r.name).join(", ")}` : `All ${results.length} block(s) green.`);
process.exit(red.length ? 1 : 0);
