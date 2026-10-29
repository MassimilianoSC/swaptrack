// Runs the emulator-backed tests of functions/test (security rules, trigger) and always stops the emulators.
// Usage, from the repository root:   node scripts/test-rules.mjs [vitest args, e.g. functions/test/trigger]
// Why not `firebase emulators:exec`: on Windows it leaves the Firestore Java process alive on its port, and the
// next run fails with "port taken". Here the emulators are started as a child process tree and killed as a tree.
import { spawn, spawnSync } from "node:child_process";
import { connect } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const firebaseJson = JSON.parse(readFileSync(`${ROOT}firebase.json`, "utf8"));
const PORTS = [firebaseJson.emulators.firestore, firebaseJson.emulators.storage];
const PROJECT = "demo-swaptrack";
const WIN = process.platform === "win32";
const FIREBASE = `${ROOT}node_modules/firebase-tools/lib/bin/firebase.js`;
const VITEST = `${ROOT}node_modules/vitest/vitest.mjs`;

const portOpen = ({ host, port }) => new Promise((resolve) => {
  const s = connect({ host, port });
  s.once("connect", () => { s.destroy(); resolve(true); });
  s.once("error", () => resolve(false));
  s.setTimeout(1000, () => { s.destroy(); resolve(false); });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate, timeoutMs, what) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await predicate()) return;
    await sleep(500);
  }
  throw new Error(`Timeout: ${what}`);
}

function killTree(pid) {
  if (WIN) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  else { try { process.kill(-pid, "SIGKILL"); } catch { /* already gone */ } }
}

// Last resort on Windows: a Java emulator still bound to one of our ports after the tree was killed.
function killPortHolders() {
  if (!WIN) return;
  const out = spawnSync("netstat", ["-ano"], { encoding: "utf8" }).stdout ?? "";
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s*TCP\s+(\S+):(\d+)\s+\S+\s+(LISTENING|ESTABLISHED)\s+(\d+)/);
    if (m && PORTS.some((p) => String(p.port) === m[2])) pids.add(m[4]);
  }
  for (const pid of pids) {
    const info = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" }).stdout ?? "";
    if (/^"java\.exe"/i.test(info.trim())) {
      console.error(`test-rules: killing leftover emulator java.exe ${pid}`);
      spawnSync("taskkill", ["/PID", pid, "/F"], { stdio: "ignore" });
    }
  }
}

async function main() {
  for (const p of PORTS) {
    if (await portOpen(p)) {
      console.error(`test-rules: port ${p.port} is already in use. Another emulator instance is running (CLAUDE.md §5: one at a time).`);
      process.exit(2);
    }
  }
  const emu = spawn(process.execPath, [FIREBASE, "emulators:start", "--only", "firestore,storage", "--project", PROJECT], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: !WIN,
  });
  let emuLog = "";
  emu.stdout.on("data", (d) => { emuLog += d; });
  emu.stderr.on("data", (d) => { emuLog += d; });
  let exited = false;
  emu.on("exit", () => { exited = true; });
  let code = 1;
  try {
    await waitFor(async () => {
      if (exited) throw new Error(`emulators exited early:\n${emuLog.slice(-2000)}`);
      for (const p of PORTS) if (!(await portOpen(p))) return false;
      return true;
    }, 120_000, "emulators did not open their ports");
    // The hub needs a moment after the ports open; the first test run otherwise races the rules load.
    await sleep(1500);
    const env = {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: `${PORTS[0].host}:${PORTS[0].port}`,
      FIREBASE_STORAGE_EMULATOR_HOST: `${PORTS[1].host}:${PORTS[1].port}`,
      GCLOUD_PROJECT: PROJECT,
    };
    const test = spawnSync(process.execPath, [VITEST, "run", "--config", "functions/test/vitest.config.ts", ...process.argv.slice(2)], {
      cwd: ROOT, stdio: "inherit", env,
    });
    code = test.status ?? 1;
  } catch (e) {
    console.error(String(e));
    code = 1;
  } finally {
    killTree(emu.pid);
    await sleep(1500);
    killPortHolders();
    const stillOpen = (await Promise.all(PORTS.map(portOpen))).some(Boolean);
    if (stillOpen) console.error("test-rules: warning, an emulator port is still in use after shutdown.");
  }
  process.exit(code);
}

main().catch((e) => { console.error(e); process.exit(1); });
