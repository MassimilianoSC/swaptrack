// Emulator ports and process helpers shared by the scripts that start the emulators (D-21, P-46).
// Every port lives in firebase.json only: nothing else in the repository writes a port number.
import { spawnSync } from "node:child_process";
import { connect } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const EMULATORS = JSON.parse(readFileSync(`${ROOT}firebase.json`, "utf8")).emulators;
export const PROJECT = "demo-swaptrack";
const WIN = process.platform === "win32";

// "127.0.0.1:8190" for the *_EMULATOR_HOST variables of the Admin SDK.
export const hostOf = (name) => `${EMULATORS[name].host}:${EMULATORS[name].port}`;

// Every port the given emulators open, with the ones the CLI always starts (hub, logging) and the
// Firestore websocket. Used to refuse a start on a busy port and to clean up after a stop.
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

export function killTree(pid) {
  if (WIN) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  else { try { process.kill(-pid, "SIGKILL"); } catch { /* already gone */ } }
}

// PIDs that own a local socket on one of the ports, from `netstat -ano` output. The state column is
// localized (an Italian Windows prints "IN ASCOLTO", not "LISTENING"), so it is not matched.
export function portHolderPids(netstatText, ports) {
  const wanted = new Set(ports.map((p) => String(p.port)));
  const pids = new Set();
  for (const line of netstatText.split(/\r?\n/)) {
    const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+.*?\s(\d+)\s*$/);
    if (m && wanted.has(m[1]) && m[2] !== "0") pids.add(m[2]);
  }
  return [...pids];
}

// Last resort on Windows: a Java emulator still bound to one of our ports after the tree was killed.
export function killPortHolders(ports, tag) {
  if (!WIN) return;
  const out = spawnSync("netstat", ["-ano"], { encoding: "utf8" }).stdout ?? "";
  for (const pid of portHolderPids(out, ports)) {
    const info = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" }).stdout ?? "";
    if (/^"java\.exe"/i.test(info.trim())) {
      console.error(`${tag}: killing leftover emulator java.exe ${pid}`);
      spawnSync("taskkill", ["/PID", pid, "/F"], { stdio: "ignore" });
    }
  }
}
