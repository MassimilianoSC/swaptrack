/**
 * Parity test of the barcode identity function: the two REAL files, not a replica.
 *
 * Run with Vitest (it picks up *.test.mjs). It fails on any difference between
 * src/lib/codeId.js (frontend) and functions/src/codeId.node.js (server).
 *
 * Control characters are written as \u escapes, never as literal characters:
 * literal control characters are invisible and tools drop them silently.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import * as front from "../src/lib/codeId.js";

const require = createRequire(import.meta.url);
const server = require("../functions/src/codeId.node.js");

const CONTROL = "\u0000A\u001fB\u007fC\u001dD\t"; // NUL, US, DEL, GS (FNC1), TAB

const CASES = [
  "ERI100000", "eri100000",          // case sensitivity
  "0000192392", "VUS183",            // real-world shapes
  ".", "..", "...",                  // not encoded by encodeURIComponent
  "__X__", "_X_", "a__b",            // Firestore reserved pattern
  "a/b?c#d&e=f", "a b c", "  spaces  ",
  "café ☕ €", "日本語", "🔧🔩", // multibyte
  CONTROL,
  "A".repeat(1400),                  // exact boundary: 1400 encoded bytes -> c_
  "A".repeat(1401),                  // just over -> h_
  "A".repeat(3000),                  // far over -> h_
  "€".repeat(500),              // long multibyte -> h_
  "", "   ", null, undefined,
];

describe("codeId parity (frontend vs functions)", () => {
  it("NORM_VERSION matches", () => {
    expect(server.NORM_VERSION).toBe(front.NORM_VERSION);
  });

  for (const c of CASES) {
    const label = JSON.stringify(String(c).slice(0, 24));
    it(`same id for ${label}`, async () => {
      expect(await front.computeCodeId(c)).toBe(server.computeCodeId(c));
    });
  }

  it("control characters are removed", () => {
    expect(front.normalizeBarcode(CONTROL)).toBe("ABCD");
  });
});
