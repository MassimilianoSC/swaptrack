import { defineConfig, devices } from "@playwright/test";
import { DEV_PORT } from "./vite.config";

// End-to-end tests of the demo paths (DA_FARE P-6 / P-23).
// They run against the dev server (`yarn dev`, port DEV_PORT of vite.config.ts, REGISTRO D-22) and the Firebase
// emulators with the seed (`yarn emulators`, then `yarn seed` and `yarn seed:full`). The emulators are NEVER started from here:
// one instance per machine (REGISTRO D-4), start them first. `yarn e2e`, or `yarn e2e --project=desk`.
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
    // A fake camera, so the scanning screen never waits for a permission; codes are typed in the manual field.
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  },
  projects: [
    // Desk shell: client roles and ASP office on a wide screen (*.desk.spec.ts).
    { name: "desk", testMatch: /.*\.desk\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    // Field shell: phone width (*.phone.spec.ts).
    { name: "phone", testMatch: /.*\.phone\.spec\.ts/, use: { ...devices["Pixel 7"] } },
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
