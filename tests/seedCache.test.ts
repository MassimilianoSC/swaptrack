import { describe, it, expect } from "vitest";
import { seedCacheKey, SEED_INPUTS } from "../scripts/seedCache.mjs";

// D-60: the exported seed is reused only while the command, the day and every input file are the same.
describe("seedCacheKey", () => {
  const files = ["a", "b"];
  const key = seedCacheKey("yarn seed && yarn seed:full", "2026-11-03", files);
  it("the same command, day and files give the same key", () => {
    expect(seedCacheKey("yarn seed && yarn seed:full", "2026-11-03", ["a", "b"])).toBe(key);
  });
  it("another command, another day or any changed file gives another key", () => {
    expect(seedCacheKey("node scripts/seed.mjs", "2026-11-03", files)).not.toBe(key);
    expect(seedCacheKey("yarn seed && yarn seed:full", "2026-11-04", files)).not.toBe(key);
    expect(seedCacheKey("yarn seed && yarn seed:full", "2026-11-03", ["a", "c"])).not.toBe(key);
    // Contents are separated: moving a character from one file to the next is a change.
    expect(seedCacheKey("yarn seed && yarn seed:full", "2026-11-03", ["ab", ""])).not.toBe(seedCacheKey("yarn seed && yarn seed:full", "2026-11-03", ["a", "b"]));
  });
  it("the inputs include the seed scripts, the barcode identity, the emulator configuration and firebase-tools", () => {
    expect(SEED_INPUTS).toEqual(expect.arrayContaining(["scripts/seed.mjs", "scripts/fullSeed.mjs", "scripts/clearCollections.mjs", "scripts/seedCatalog.mjs", "functions/src/codeId.node.js", "firebase.json", "node_modules/firebase-tools/package.json"]));
  });
});
