// D-60: the full e2e round runs in blocks (e2e/blocks.json), each on fresh emulators. Every e2e/*.spec.ts must be in
// exactly one block, so that a new test file is never skipped in silence. Run: `yarn check:e2e-blocks`; exits 1 with
// the names of the files that are missing, listed twice, or listed but not existing. *.diag.ts are not part of it.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

export function checkBlocks() {
  const { blocks } = JSON.parse(readFileSync(join(dir, "blocks.json"), "utf8"));
  const specs = readdirSync(dir).filter((f) => f.endsWith(".spec.ts"));
  const problems = [];
  const seen = new Map();
  if (!Array.isArray(blocks) || blocks.length === 0) problems.push("blocks.json has no blocks");
  for (const b of blocks ?? []) {
    if (!b.name || !Array.isArray(b.files) || b.files.length === 0) problems.push(`block "${b.name ?? "?"}": no name or no files`);
    if (b.seed !== "full" && b.seed !== "base") problems.push(`block "${b.name}": seed must be "full" or "base"`);
    for (const f of b.files ?? []) {
      if (seen.has(f)) problems.push(`${f}: in two blocks ("${seen.get(f)}" and "${b.name}")`);
      seen.set(f, b.name);
      if (!specs.includes(f)) problems.push(`${f}: listed in block "${b.name}" but not in e2e/`);
    }
  }
  for (const f of specs) if (!seen.has(f)) problems.push(`${f}: in no block of e2e/blocks.json`);
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = checkBlocks();
  if (problems.length) {
    console.error(`e2e blocks: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log("e2e blocks: every e2e/*.spec.ts is in exactly one block");
}
