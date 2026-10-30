// Starts the development emulators (project demo-swaptrack) and cleans up after them (P-46).
// Usage, from the repository root, after building the functions:   node scripts/emulators.mjs
// Stop with Ctrl+C: the CLI exports the data to .emulator-data, then this script removes any Java
// emulator left bound to our ports (on Windows the CLI leaves Firestore and Pub/Sub alive).
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { ROOT, PROJECT, portsOf, portOpen, killTree, killPortHolders } from "./emulatorPorts.mjs";

const ONLY = ["auth", "firestore", "functions", "storage", "pubsub"];
const PORTS = portsOf(ONLY);
const FIREBASE = `${ROOT}node_modules/firebase-tools/lib/bin/firebase.js`;
const DATA = "./.emulator-data";
const STOP_GRACE_MS = 60_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const busy = [];
  for (const p of PORTS) if (await portOpen(p)) busy.push(p.port);
  if (busy.length) {
    console.error(`emulators: port(s) ${busy.join(", ")} already in use. Another SwapTrack emulator instance is running (CLAUDE.md §5: one at a time).`);
    process.exit(2);
  }
  mkdirSync(`${ROOT}.emulator-data`, { recursive: true });
  const emu = spawn(process.execPath, [FIREBASE, "emulators:start", "--only", ONLY.join(","), "--project", PROJECT,
    "--import", DATA, "--export-on-exit", DATA], { cwd: ROOT, stdio: "inherit" });
  const exited = new Promise((resolve) => emu.on("exit", (code) => resolve(code ?? 1)));

  // Ctrl+C reaches the CLI too (same console): let it export and stop, then force it after a grace period.
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    setTimeout(() => killTree(emu.pid), STOP_GRACE_MS).unref();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", () => { emu.kill("SIGTERM"); stop(); });

  const code = await exited;
  killTree(emu.pid);
  await sleep(1500);
  killPortHolders(PORTS, "emulators");
  const still = [];
  for (const p of PORTS) if (await portOpen(p)) still.push(p.port);
  if (still.length) console.error(`emulators: warning, port(s) ${still.join(", ")} still in use after shutdown.`);
  process.exit(code);
}

main().catch((e) => { console.error(e); process.exit(1); });
