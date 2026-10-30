// Starts the development emulators (project demo-swaptrack) and always stops them (P-46, P-51).
// Build the functions first (yarn build:functions). From the repository root:
//   node scripts/emulators.mjs                 interactive: data imported from and exported to .emulator-data;
//                                              stop with Ctrl+C.
//   node scripts/emulators.mjs --run "<cmd>"   start on empty data, wait until every emulator is ready and the
//                                              functions are loaded, run <cmd>, stop everything, check the ports.
//                                              Exit code: the command's, or 3 if a port stayed busy.
// The stop kills the process tree this script started, recorded while the CLI was alive (on Windows the CLI
// leaves its Java emulators running after it exits, and they are no longer linked to it).
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import {
  ROOT, PROJECT, FIREBASE, hostOf, portsOf, busyPorts, cliEnv, processTable, descendantsOf, killPids, sleep, waitPortsFree,
} from "./emulatorPorts.mjs";

const ONLY = ["auth", "firestore", "functions", "storage", "pubsub"];
const PORTS = portsOf(ONLY);
const DATA = "./.emulator-data";
const READY_TIMEOUT_MS = 180_000;
const STOP_GRACE_MS = 60_000;
const READY = "All emulators ready";
const FUNCTIONS_LOADED = "Loaded functions definitions";
const FUNCTIONS_FAILED = "Failed to load function";

const runAt = process.argv.indexOf("--run");
const COMMAND = runAt >= 0 ? process.argv[runAt + 1] : null;
if (runAt >= 0 && !COMMAND) { console.error('emulators: usage: node scripts/emulators.mjs --run "<command>"'); process.exit(2); }

async function main() {
  const busy = await busyPorts(PORTS);
  if (busy.length) {
    console.error(`emulators: port(s) ${busy.join(", ")} already in use. Another SwapTrack emulator instance is running (CLAUDE.md §5: one at a time).`);
    process.exit(2);
  }
  const data = COMMAND ? [] : ["--import", DATA, "--export-on-exit", DATA];
  if (!COMMAND) mkdirSync(`${ROOT}.emulator-data`, { recursive: true });
  const emu = spawn(process.execPath, [FIREBASE, "emulators:start", "--only", ONLY.join(","), "--project", PROJECT, ...data],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: cliEnv() });
  let log = "";
  emu.stdout.on("data", (d) => { log += d; process.stdout.write(d); });
  emu.stderr.on("data", (d) => { log += d; process.stderr.write(d); });
  let exitCode = null;
  const exited = new Promise((resolve) => emu.on("exit", (code) => { exitCode = code ?? 1; resolve(exitCode); }));

  let recorded = [];
  const record = () => { if (exitCode === null) recorded = [...new Set([...recorded, ...descendantsOf(processTable(), emu.pid)])]; };
  const stopAll = async (tag) => {
    record();
    killPids(emu.pid, recorded);
    await exited;
    if (!(await waitPortsFree(PORTS))) {
      console.error(`${tag}: port(s) ${(await busyPorts(PORTS)).join(", ")} still in use after the stop (recorded PIDs: ${recorded.join(" ")}).`);
      return false;
    }
    return true;
  };

  // Ready = the CLI says so and, with the functions emulator, the definitions were loaded (D-26).
  const until = Date.now() + READY_TIMEOUT_MS;
  while (!log.includes(READY) || (ONLY.includes("functions") && !log.includes(FUNCTIONS_LOADED))) {
    if (exitCode !== null) { console.error(`emulators: the CLI exited (${exitCode}) before being ready.`); process.exit(1); }
    if (log.includes(FUNCTIONS_FAILED) || Date.now() > until) {
      console.error(`emulators: ${log.includes(FUNCTIONS_FAILED) ? "the functions did not load" : "not ready in time"}; stopping.`);
      await stopAll("emulators");
      process.exit(1);
    }
    await sleep(500);
  }
  record();

  if (COMMAND) {
    const env = { ...process.env, FIRESTORE_EMULATOR_HOST: hostOf("firestore"), FIREBASE_AUTH_EMULATOR_HOST: hostOf("auth"),
      FIREBASE_STORAGE_EMULATOR_HOST: hostOf("storage") };
    const code = await new Promise((resolve) => spawn(COMMAND, { cwd: ROOT, stdio: "inherit", shell: true, env })
      .on("exit", (c) => resolve(c ?? 1)));
    const freed = await stopAll("emulators --run");
    process.exit(freed ? code : 3);
  }

  // Interactive: Ctrl+C reaches the CLI too (same console). Record its tree now, let it export and stop,
  // then kill what is left; after a grace period, force it.
  let stopping = false;
  const onStop = () => {
    if (stopping) return;
    stopping = true;
    record();
    setTimeout(() => killPids(emu.pid, recorded), STOP_GRACE_MS).unref();
  };
  process.on("SIGINT", onStop);
  process.on("SIGTERM", () => { onStop(); killPids(emu.pid, recorded); });
  const code = await exited;
  const freed = await stopAll("emulators");
  process.exit(freed ? code : 3);
}

main().catch((e) => { console.error(e); process.exit(1); });
