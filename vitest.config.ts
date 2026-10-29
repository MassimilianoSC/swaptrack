import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@shared": fileURLToPath(new URL("./functions/src/shared", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.{mjs,ts}", "functions/src/**/*.test.ts"],
    environment: "node",
  },
});
