// Starts the development emulators (project demo-swaptrack) and always stops them (P-46, P-51, P-71).
// Build the functions first (yarn build:functions). From the repository root:
//   node scripts/emulators.mjs                 interactive: data imported from and exported to .emulator-data;
//                                              stop with Ctrl+C.
//   node scripts/emulators.mjs --run "<cmd>"   start on empty data, wait until every emulator is ready and the
//                                              functions are loaded, run <cmd>, stop everything, check the ports.
//                                              Exit code: the command's, or 3 if a port stayed busy.
//   node scripts/emulators.mjs --seed "<seed cmd>" --run "<cmd>"
//                                              P-71: first run <seed cmd> on emulators WITHOUT the functions
//                                              emulator, export the data, stop; then start every emulator importing
//                                              that data and run <cmd>. Imported data starts no trigger, so the
//                                              ~10,000 seeded events (already processed) never queue onEventCreated
//                                              runs in front of the events of the tests.
// The stop kills the process tree this script started, recorded while the CLI was alive (on Windows the CLI
// leaves its Java emulators running after it exits, and they are no longer linked to it).
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ROOT, PROJECT, FIREBASE, hostOf, portsOf, busyPorts, cliEnv, processTable, descendantsOf, killPids, sleep, waitPortsFree,
} from "./emulatorPorts.mjs";

const ONLY = ["auth", "firestore", "functions", "storage", "pubsub"];
const SEED_ONLY = ["auth", "firestore", "storage"];
const PORTS = portsOf(ONLY);
const DATA = "./.emulator-data";
const READY_TIMEOUT_MS = 180_000;
const STOP_GRACE_MS = 60_000;
const READY = "All emulators ready";
const FUNCTIONS_LOADED = "Loaded functions definitions";
const FUNCTIONS_FAILED = "Failed to load function";
const TRIGGER_RUN = /Beginning execution of "[^"]*onEventCreated"/g;

const argOf = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const COMMAND = argOf("--run");
const SEED = argOf("--seed");
if ((process.argv.includes("--run") && !COMMAND) || (process.argv.includes("--seed") && (!SEED || !COMMAND))) {
  console.error('emulators: usage: node scripts/emulators.mjs [--seed "<seed command>"] --run "<command>"');
  process.exit(2);
}
const hostsEnv = () => ({ ...process.env, FIRESTORE_EMULATOR_HOST: hostOf("firestore"), FIREBASE_AUTH_EMULATOR_HOST: hostOf("auth"),
  FIREBASE_STORAGE_EMULATOR_HOST: hostOf("storage") });
const runCommand = (cmd) => new Promise((resolve) => spawn(cmd, { cwd: ROOT, stdio: "inherit", shell: true, env: hostsEnv() })
  .on("exit", (c) => resolve(c ?? 1)));

// One start of the CLI: output on screen and kept in `log`, process tree recorded for the stop.
function startCli(only, data) {
  const emu = spawn(process.execPath, [FIREBASE, "emulators:start", "--only", only.join(","), "--project", PROJECT, ...data],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: cliEnv() });
  const cli = { emu, log: "", exitCode: null, recorded: [] };
  emu.stdout.on("data", (d) => { cli.log += d; process.stdout.write(d); });
  emu.stderr.on("data", (d) => { cli.log += d; process.stderr.write(d); });
  cli.exited = new Promise((resolve) => emu.on("exit", (code) => { cli.exitCode = code ?? 1; resolve(cli.exitCode); }));
  cli.record = () => { if (cli.exitCode === null) cli.recorded = [...new Set([...cli.recorded, ...descendantsOf(processTable(), emu.pid)])]; };
  cli.stop = async (tag) => {
    cli.record();
    killPids(emu.pid, cli.recorded);
    await cli.exited;
    if (!(await waitPortsFree(portsOf(only)))) {
      console.error(`${tag}: port(s) ${(await busyPorts(portsOf(only))).join(", ")} still in use after the stop (recorded PIDs: ${cli.recorded.join(" ")}).`);
      return false;
    }
    return true;
  };
  return cli;
}

// Ready = the CLI says so and, with the functions emulator, the definitions were loaded (D-26). Exits on failure.
async function waitReady(cli, only, tag) {
  const until = Date.now() + READY_TIMEOUT_MS;
  while (!cli.log.includes(READY) || (only.includes("functions") && !cli.log.includes(FUNCTIONS_LOADED))) {
    if (cli.exitCode !== null) { console.error(`${tag}: the CLI exited (${cli.exitCode}) before being ready.`); process.exit(1); }
    if (cli.log.includes(FUNCTIONS_FAILED) || Date.now() > until) {
      console.error(`${tag}: ${cli.log.includes(FUNCTIONS_FAILED) ? "the functions did not load" : "not ready in time"}; stopping.`);
      await cli.stop(tag);
      process.exit(1);
    }
    await sleep(500);
  }
  cli.record();
}

// Phase 1 of --seed: seed without the functions emulator, export to a temporary folder, stop. Returns the folder.
async function seedPhase() {
  const dir = mkdtempSync(join(tmpdir(), "swaptrack-seed-"));
  const cli = startCli(SEED_ONLY, []);
  await waitReady(cli, SEED_ONLY, "emulators --seed");
  const code = await runCommand(SEED);
  let exported = false;
  if (code === 0) {
    const r = await fetch(`http://${hostOf("hub")}/_admin/export`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: dir, initiatedBy: "swaptrack-emulators" }),
    }).catch((e) => ({ ok: false, status: String(e) }));
    exported = r.ok;
    if (!exported) console.error(`emulators --seed: export failed (${r.status}).`);
  }
  const freed = await cli.stop("emulators --seed");
  if (code !== 0 || !exported || !freed) {
    rmSync(dir, { recursive: true, force: true });
    process.exit(code !== 0 ? code : !freed ? 3 : 1);
  }
  return dir;
}

async function main() {
  const busy = await busyPorts(PORTS);
  if (busy.length) {
    console.error(`emulators: port(s) ${busy.join(", ")} already in use. Another SwapTrack emulator instance is running (CLAUDE.md §5: one at a time).`);
    process.exit(2);
  }
  const seeded = SEED ? await seedPhase() : null;
  const data = seeded ? ["--import", seeded] : COMMAND ? [] : ["--import", DATA, "--export-on-exit", DATA];
  if (!COMMAND) mkdirSync(`${ROOT}.emulator-data`, { recursive: true });
  const cli = startCli(ONLY, data);
  await waitReady(cli, ONLY, "emulators");

  if (COMMAND) {
    if (seeded) console.log(`emulators: data imported; onEventCreated runs so far: ${(cli.log.match(TRIGGER_RUN) ?? []).length}`);
    const code = await runCommand(COMMAND);
    const freed = await cli.stop("emulators --run");
    if (seeded) rmSync(seeded, { recursive: true, force: true });
    process.exit(freed ? code : 3);
  }

  // Interactive: Ctrl+C reaches the CLI too (same console). Record its tree now, let it export and stop,
  // then kill what is left; after a grace period, force it.
  let stopping = false;
  const onStop = () => {
    if (stopping) return;
    stopping = true;
    cli.record();
    setTimeout(() => killPids(cli.emu.pid, cli.recorded), STOP_GRACE_MS).unref();
  };
  process.on("SIGINT", onStop);
  process.on("SIGTERM", () => { onStop(); killPids(cli.emu.pid, cli.recorded); });
  const code = await cli.exited;
  const freed = await cli.stop("emulators");
  process.exit(freed ? code : 3);
}

main().catch((e) => { console.error(e); process.exit(1); });
