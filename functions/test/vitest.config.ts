// Security-rules tests (SPEC §17, PIANO P-10, D-12). They need the Firestore and Storage emulators:
//   yarn firebase emulators:exec --only firestore,storage --project demo-swaptrack "yarn vitest run --config functions/test/vitest.config.ts"
// Kept apart from the root vitest.config.ts so that `yarn test` stays emulator-free.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  test: {
    include: ["functions/test/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
