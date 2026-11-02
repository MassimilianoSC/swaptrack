// Fixtures for the scheduled jobs tests (PIANO P-13) and the export (P-79). The jobs (run* in scheduled.ts) and the
// desk operations are called in-process against the emulators. They read whole collections (every item, every
// event), so each test file uses its own project, cleared before each test, and never shares data with others.
// Needs the Firestore, Storage and Auth emulators (node scripts/test-rules.mjs starts them).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const emulators = JSON.parse(readFileSync(`${ROOT}firebase.json`, "utf8")).emulators as Record<string, { host: string; port: number }>;
const host = (name: string) => `${emulators[name].host}:${emulators[name].port}`;
process.env.FIRESTORE_EMULATOR_HOST ??= host("firestore");
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= host("storage");
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= host("auth");

export const NOW = Date.UTC(2026, 10, 1, 5, 0, 0); // 1 November 2026, 06:00 Europe/Rome
export const DAY = 24 * 3600 * 1000;

type Admin = typeof import("../../src/core/admin");
type Scheduled = typeof import("../../src/scheduled");
export interface ScheduledEnv { admin: Admin; jobs: Scheduled; clear: () => Promise<void> }

// One project per test file (each file runs in its own process): set before the Admin SDK is first imported.
export async function setupScheduled(project = "demo-scheduled-tests"): Promise<ScheduledEnv> {
  process.env.GCLOUD_PROJECT = project;
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: project, storageBucket: `${project}.appspot.com` });
  const admin = await import("../../src/core/admin");
  const jobs = await import("../../src/scheduled");
  // Empties the whole Firestore database of this project (emulator REST endpoint).
  const clear = async () => {
    const r = await fetch(`http://${host("firestore")}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" });
    if (!r.ok) throw new Error(`clear failed: ${r.status}`);
  };
  return { admin, jobs, clear };
}
