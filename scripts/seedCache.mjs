// D-60: the exported seed of the emulators is kept and imported again by the next runs, as long as nothing that makes
// it changes: the seed command, the seed scripts, the barcode identity, the emulator configuration, the version of
// firebase-tools (its export format) and the day (the full seed dates its data from "now": two months of history,
// documents 30 days old). Same key, same files: the runs import byte-identical data.
import { createHash } from "node:crypto";

export const SEED_INPUTS = [
  "scripts/seed.mjs", "scripts/seedCatalog.mjs", "scripts/fullSeed.mjs", "scripts/clearCollections.mjs", "scripts/demoAccounts.mjs",
  "functions/src/codeId.node.js", "firebase.json", "node_modules/firebase-tools/package.json",
];

// Pure: the key of a seed, from the command, the day (YYYY-MM-DD, UTC) and the contents of SEED_INPUTS in that order.
export function seedCacheKey(command, day, contents) {
  const h = createHash("sha256");
  h.update(`${command}\n${day}\n`);
  for (const c of contents) { h.update(String(c.length)); h.update("\n"); h.update(c); }
  return h.digest("hex").slice(0, 16);
}
