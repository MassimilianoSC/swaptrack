// Emulator ports and process helpers shared by the scripts that start the emulators (D-21, P-46, P-51).
// Every port lives in firebase.json only: nothing else in the repository writes a port number.
import { spawnSync } from "node:child_process";
import { connect } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const EMULATORS = JSON.parse(readFileSync(`${ROOT}firebase.json`, "utf8")).emulators;
export const PROJECT = "demo-swaptrack";
export const FIREBASE = `${ROOT}node_modules/firebase-tools/lib/bin/firebase.js`;
const WIN = process.platform === "win32";

// "127.0.0.1:8190" for the *_EMULATOR_HOST variables of the Admin SDK.
export const hostOf = (name) => `${EMULATORS[name].host}:${EMULATORS[name].port}`;

// Every port the given emulators open, with the ones the CLI always starts (hub, logging) and the
// Firestore websocket. Used to refuse a start on a busy port and to check that a stop freed them.
export function portsOf(names) {
  const list = [...names, "hub", "logging"].filter((n) => EMULATORS[n]?.port).map((n) => EMULATORS[n]);
  if (names.includes("firestore") && EMULATORS.firestore.websocketPort) {
    list.push({ host: EMULATORS.firestore.host, port: EMULATORS.firestore.websocketPort });
  }
  if (names.includes("functions")) for (const n of ["eventarc", "tasks"]) if (EMULATORS[n]?.port) list.push(EMULATORS[n]);
  return list;
}

export const portOpen = ({ host, port }) => new Promise((resolve) => {
  const s = connect({ host, port });
  s.once("connect", () => { s.destroy(); resolve(true); });
  s.once("error", () => resolve(false));
  s.setTimeout(1000, () => { s.destroy(); resolve(false); });
});

export async function busyPorts(ports) {
  const busy = [];
  for (const p of ports) if (await portOpen(p)) busy.push(p.port);
  return busy;
}

// D-26: the CLI gives the functions 10 s to load their definitions, and functions/lib/index.js took 10.6 s on
// this machine; after that timeout it never reloads them. firebase-tools reads this variable (seconds).
export const cliEnv = (base = process.env) => ({ ...base, FUNCTIONS_DISCOVERY_TIMEOUT: "60" });

// [{pid, ppid}] of every process of the machine.
export function processTable() {
  if (WIN) {
    const out = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command",
      "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId) $($_.ParentProcessId)\" }"], { encoding: "utf8" }).stdout ?? "";
    return parseTable(out);
  }
  return parseTable(spawnSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" }).stdout ?? "");
}
export function parseTable(text) {
  return text.split(/\r?\n/).map((l) => l.trim().split(/\s+/).map(Number)).filter((r) => r.length === 2 && r.every(Number.isInteger))
    .map(([pid, ppid]) => ({ pid, ppid }));
}

// The PIDs started by `root` (children, grandchildren, ...), root included. Recorded while the CLI is alive:
// once it exits, Windows no longer links its Java emulators to it and `taskkill /T` cannot find them.
export function descendantsOf(table, root) {
  const kids = new Map();
  for (const { pid, ppid } of table) if (pid !== ppid) kids.set(ppid, [...(kids.get(ppid) ?? []), pid]);
  const seen = new Set([root]);
  const stack = [root];
  while (stack.length) for (const k of kids.get(stack.pop()) ?? []) if (!seen.has(k)) { seen.add(k); stack.push(k); }
  return [...seen];
}

// The recorded PIDs still alive whose parent is `root` or another recorded PID (a PID reused by an unrelated
// process in the meantime has another parent and is left alone).
export function stillOurs(table, root, recorded) {
  const ours = new Set([root, ...recorded]);
  return table.filter(({ pid, ppid }) => pid !== root && recorded.includes(pid) && ours.has(ppid)).map((r) => r.pid);
}

// Kills the tree of `root` and the processes recorded from it. Never a process this script did not start.
export function killPids(root, recorded = []) {
  const targets = stillOurs(processTable(), root, recorded);
  if (WIN) {
    spawnSync("taskkill", ["/PID", String(root), "/T", "/F"], { stdio: "ignore" });
    for (const pid of targets) spawnSync("taskkill", ["/PID", String(pid), "/F"], { stdio: "ignore" });
  } else {
    try { process.kill(root, "SIGKILL"); } catch { /* already gone */ }
    for (const pid of targets) { try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ } }
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// After a stop the ports free up within seconds; true when all of them are free.
export async function waitPortsFree(ports, timeoutMs = 15_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (!(await busyPorts(ports)).length) return true;
    await sleep(500);
  }
  return false;
}
