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
//                                              D-57: the base seed alone (--seed "yarn seed") writes no events, so
//                                              it runs in the emulators started for <cmd>: no second start and stop.
//                                              D-60: any other seed is exported once and kept (seedCache.mjs): the
//                                              next runs import the same files. --no-seed-cache seeds again.
// The stop kills the process tree this script started, recorded while the CLI was alive (on Windows the CLI
// leaves its Java emulators running after it exits, and they are no longer linked to it).
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ROOT, PROJECT, FIREBASE, hostOf, portsOf, busyPorts, cliEnv, processTable, descendantsOf, killPids, sleep, waitPortsFree,
} from "./emulatorPorts.mjs";
import { SEED_INPUTS, seedCacheKey } from "./seedCache.mjs";

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
// D-57: a seed that writes no events (the base seed: organizations, users through the Admin SDK, places, models,
// settings) wakes no trigger: it runs in place, after the start (measured: about 22 s saved out of 130).
const SEED_IN_PLACE = !!SEED && SEED.split("&&").every((c) => c.trim() === "yarn seed");
const SEED_CACHE = !process.argv.includes("--no-seed-cache");
// One cached export at a time, outside the repository; "complete" is written last, so a cut copy is never used.
const CACHE_ROOT = join(tmpdir(), "swaptrack-seed-cache");
const cacheDir = () => join(CACHE_ROOT, seedCacheKey(SEED, new Date().toISOString().slice(0, 10), SEED_INPUTS.map((f) => readFileSync(`${ROOT}${f}`))));
const MARK = "complete";
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

// D-57: how long each phase took, so that the time of a test round can be read from its log.
const lap = (what, since) => console.log(`emulators: [time] ${what}: ${((Date.now() - since) / 1000).toFixed(1)} s`);

// Phase 1 of --seed: seed without the functions emulator, export to a temporary folder, stop. Returns the folder.
async function seedPhase() {
  const dir = mkdtempSync(join(tmpdir(), "swaptrack-seed-"));
  let t = Date.now();
  const cli = startCli(SEED_ONLY, []);
  await waitReady(cli, SEED_ONLY, "emulators --seed");
  lap("seed emulators started", t); t = Date.now();
  const code = await runCommand(SEED);
  lap("seed command", t); t = Date.now();
  let exported = false;
  if (code === 0) {
    const r = await fetch(`http://${hostOf("hub")}/_admin/export`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: dir, initiatedBy: "swaptrack-emulators" }),
    }).catch((e) => ({ ok: false, status: String(e) }));
    exported = r.ok;
    if (!exported) console.error(`emulators --seed: export failed (${r.status}).`);
  }
  lap("seed export", t); t = Date.now();
  const freed = await cli.stop("emulators --seed");
  lap("seed emulators stopped", t);
  if (code !== 0 || !exported || !freed) {
    rmSync(dir, { recursive: true, force: true });
    process.exit(code !== 0 ? code : !freed ? 3 : 1);
  }
  return dir;
}

// P-83: the first onEventCreated after a start waits for the functions emulator to start its worker (measured: up to
// 50 s on a busy machine), and the emulator runs one trigger at a time, so the first scans of the tests queued behind
// it. A malformed event (no such type) starts the worker without touching any data: the trigger marks it and writes
// one malformed_event anomaly; both documents are then deleted, so the tests never see them.
async function warmUpTrigger() {
  const base = `http://${hostOf("firestore")}/v1/projects/${PROJECT}/databases/(default)/documents`;
  const headers = { Authorization: "Bearer owner", "Content-Type": "application/json" }; // emulator admin access
  const id = "warmup-0000-4000-8000-000000000000";
  const started = Date.now();
  const r = await fetch(`${base}/events?documentId=${id}`, { method: "POST", headers,
    body: JSON.stringify({ fields: { type: { stringValue: "emulator_warmup" }, locationId: { stringValue: "none" } } }) }).catch(() => null);
  if (!r?.ok) { console.error("emulators: warm-up event not written; continuing."); return; }
  let done = false;
  while (!done && Date.now() - started < READY_TIMEOUT_MS) {
    await sleep(500);
    const doc = await fetch(`${base}/events/${id}`, { headers }).then((x) => x.json()).catch(() => ({}));
    done = !!doc.fields?.processedAt;
  }
  for (const path of [`events/${id}`, `anomalies/${id}_malformed_event`]) await fetch(`${base}/${path}`, { method: "DELETE", headers }).catch(() => null);
  console.log(`emulators: onEventCreated ${done ? "warmed up" : "NOT warmed up"} in ${Date.now() - started} ms`);
}

// D-60: a fresh export is copied into the cache (the older ones are removed: they can never match again).
function keepSeed(dir) {
  const target = cacheDir();
  try {
    mkdirSync(CACHE_ROOT, { recursive: true });
    for (const old of readdirSync(CACHE_ROOT)) if (join(CACHE_ROOT, old) !== target) rmSync(join(CACHE_ROOT, old), { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
    cpSync(dir, target, { recursive: true });
    writeFileSync(join(target, MARK), new Date().toISOString());
    console.log(`emulators: seed kept in the cache ${target}`);
  } catch (e) {
    console.error(`emulators: seed not kept in the cache (${e.message}); the next run seeds again.`);
  }
}

async function main() {
  const busy = await busyPorts(PORTS);
  if (busy.length) {
    console.error(`emulators: port(s) ${busy.join(", ")} already in use. Another SwapTrack emulator instance is running (CLAUDE.md §5: one at a time).`);
    process.exit(2);
  }
  const t0 = Date.now();
  // D-60: the exported seed of an earlier run (same key) is imported as it is, and never deleted here.
  const cached = SEED && !SEED_IN_PLACE && SEED_CACHE && existsSync(join(cacheDir(), MARK)) ? cacheDir() : null;
  if (cached) console.log(`emulators: seed from the cache ${cached}`);
  const seeded = cached ? null : SEED && !SEED_IN_PLACE ? await seedPhase() : null;
  if (seeded && SEED_CACHE) keepSeed(seeded);
  let t = Date.now();
  const data = cached ?? seeded ? ["--import", cached ?? seeded] : COMMAND ? [] : ["--import", DATA, "--export-on-exit", DATA];
  if (!COMMAND) mkdirSync(`${ROOT}.emulator-data`, { recursive: true });
  const cli = startCli(ONLY, data);
  await waitReady(cli, ONLY, "emulators");
  lap("emulators started", t);

  if (COMMAND) {
    if (seeded) console.log(`emulators: data imported; onEventCreated runs so far: ${(cli.log.match(TRIGGER_RUN) ?? []).length}`);
    if (SEED_IN_PLACE) {
      t = Date.now();
      const seedCode = await runCommand(SEED);
      lap("seed command, in place", t);
      const runs = (cli.log.match(TRIGGER_RUN) ?? []).length;
      if (runs) console.error(`emulators: the seed in place woke onEventCreated ${runs} time(s): use a seed that writes no events.`);
      if (seedCode !== 0) { await cli.stop("emulators --run"); process.exit(seedCode); }
    }
    await warmUpTrigger();
    t = Date.now();
    const code = await runCommand(COMMAND);
    lap("command", t); t = Date.now();
    const freed = await cli.stop("emulators --run");
    lap("emulators stopped", t);
    lap("total", t0);
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
