import { defineConfig, devices } from "@playwright/test";
import { DEV_PORT } from "./vite.config";

// End-to-end tests of the demo paths (DA_FARE P-6 / P-23).
// They run against the dev server (`yarn dev`, port DEV_PORT of vite.config.ts, REGISTRO D-22) and the Firebase
// emulators with the seed. The emulators are NEVER started from here (one instance per machine, REGISTRO D-4):
// `yarn e2e` builds the functions and runs the blocks of e2e/blocks.json (REGISTRO D-60), each through
// `node scripts/emulators.mjs --seed … --run …` on fresh emulators (seed without the functions emulator, then all
// emulators from that data: no seeded event reaches the trigger, P-71; tests; stop). One block:
// `node scripts/e2e-blocks.mjs --block <name>`. For a subset: `node scripts/emulators.mjs --seed "yarn seed && yarn seed:full" --run "yarn e2e:only <filter>"`.
export default defineConfig({
  testDir: "e2e",
  outputDir: ".playwright/test-results",
  // One worker, no parallelism: every test talks to the same emulators.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: ".playwright/report", open: "never" }]],
  use: {
    baseURL: `http://localhost:${DEV_PORT}`,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    // No camera at all: codes are typed in the manual field, so the scanning screen gets "camera not available" at
    // once and never runs the decoder on a fake video (it saturated the machine during the phone tests). The fake UI
    // flag only answers the permission prompt. The app for real users does not change.
    launchOptions: { args: ["--use-fake-ui-for-media-stream"] },
  },
  projects: [
    // Desk shell: client roles and ASP office on a wide screen (*.desk.spec.ts).
    { name: "desk", testMatch: /.*\.desk\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    // Field shell: phone width (*.phone.spec.ts).
    { name: "phone", testMatch: /.*\.phone\.spec\.ts/, use: { ...devices["Pixel 7"] } },
    // Diagnostics (*.diag.ts), never in the normal round: only with E2E_DIAG=1.
    ...(process.env.E2E_DIAG ? [{ name: "diag", testMatch: /.*\.diag\.ts/, use: { ...devices["Pixel 7"] } }] : []),
  ],
  webServer: {
    command: "yarn dev",
    url: `http://localhost:${DEV_PORT}`,
    // Always our own dev server, started from this copy: if anything already answers on the port (another
    // project, another copy of SwapTrack) Playwright stops at once instead of testing the wrong app (D-22).
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
