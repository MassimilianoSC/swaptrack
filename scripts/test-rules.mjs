// Runs the emulator-backed tests of functions/test (security rules, trigger) and always stops the emulators.
// Usage, from the repository root:   node scripts/test-rules.mjs [vitest args, e.g. functions/test/trigger]
// Why not `firebase emulators:exec`: on Windows it leaves the Firestore Java process alive on its port, and the
// next run fails with "port taken". Here the emulators' process tree is recorded while the CLI is alive and
// killed by PID at the end; the run fails (exit 3) if a port is still busy afterwards.
import { spawn, spawnSync } from "node:child_process";
import {
  ROOT, PROJECT, FIREBASE, EMULATORS, hostOf, portsOf, portOpen, busyPorts, cliEnv, processTable, descendantsOf, killPids,
  sleep, waitPortsFree,
} from "./emulatorPorts.mjs";

const ONLY = ["firestore", "storage"];
const PORTS = portsOf(ONLY);
const READY = [EMULATORS.firestore, EMULATORS.storage];
const VITEST = `${ROOT}node_modules/vitest/vitest.mjs`;

async function waitFor(predicate, timeoutMs, what) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await predicate()) return;
    await sleep(500);
  }
  throw new Error(`Timeout: ${what}`);
}

async function main() {
  const busy = await busyPorts(PORTS);
  if (busy.length) {
    console.error(`test-rules: port(s) ${busy.join(", ")} already in use. Another emulator instance is running (CLAUDE.md §5: one at a time).`);
    process.exit(2);
  }
  const emu = spawn(process.execPath, [FIREBASE, "emulators:start", "--only", ONLY.join(","), "--project", PROJECT], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: cliEnv(),
  });
  let emuLog = "";
  emu.stdout.on("data", (d) => { emuLog += d; });
  emu.stderr.on("data", (d) => { emuLog += d; });
  let exited = false;
  emu.on("exit", () => { exited = true; });
  let recorded = [];
  let code = 1;
  try {
    await waitFor(async () => {
      if (exited) throw new Error(`emulators exited early:\n${emuLog.slice(-2000)}`);
      for (const p of READY) if (!(await portOpen(p))) return false;
      return true;
    }, 120_000, "emulators did not open their ports");
    recorded = descendantsOf(processTable(), emu.pid);
    // The hub needs a moment after the ports open; the first test run otherwise races the rules load.
    await sleep(1500);
    const env = {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: hostOf("firestore"),
      FIREBASE_STORAGE_EMULATOR_HOST: hostOf("storage"),
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
    if (!exited) recorded = [...new Set([...recorded, ...descendantsOf(processTable(), emu.pid)])];
    killPids(emu.pid, recorded);
    if (!(await waitPortsFree(PORTS))) {
      console.error(`test-rules: port(s) ${(await busyPorts(PORTS)).join(", ")} still in use after the stop (recorded PIDs: ${recorded.join(" ")}).`);
      if (code === 0) code = 3;
    }
  }
  process.exit(code);
}

main().catch((e) => { console.error(e); process.exit(1); });
