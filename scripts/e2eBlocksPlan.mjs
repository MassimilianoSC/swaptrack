// D-60: the e2e round in blocks (e2e/blocks.json): the seed of a block and its Playwright filters. Pure: no I/O here.
// The Firestore emulator grows with every test (measured: the same test 46 s on fresh emulators, 108 s and red after
// five repetitions; 5.3 GB of Java after 65 tests), so each block runs on fresh emulators.

export const SEEDS = { full: "yarn seed && yarn seed:full", base: "yarn seed" };

// The check that every e2e/*.spec.ts is in exactly one block is e2e/check-blocks.mjs (o3, yarn check:e2e-blocks).

// The Playwright filters of a block: each file name as a literal (Playwright reads the arguments as regular
// expressions: the dots are escaped, so "a.desk" never matches another file).
export const filtersOf = (block) => block.files.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
