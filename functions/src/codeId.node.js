/**
 * Barcode identity function (Cloud Functions copy, CommonJS).
 *
 * DO NOT REWRITE. MUST stay IDENTICAL in behaviour to src/lib/codeId.js: if the
 * two diverge, codes written server-side (trigger, imports) will not match the
 * ids computed by the app from scans, producing duplicates that look
 * inexplicable in the field. tests/codeId.parity.test.mjs compares the two real
 * files on edge cases.
 *
 * Separate file because the frontend copy is ESM with SubtleCrypto (browser);
 * here Node's crypto module is used. The logic is the same, and SHA-256 is
 * identical in both.
 *
 * IRREVERSIBLE like the other copy: any change requires bumping NORM_VERSION
 * here AND in the frontend, plus a data migration.
 */
const crypto = require("crypto");

const NORM_VERSION = 1;
const CTRL_MAX = 0x1f; // C0 controls 0x00-0x1F, including FNC1/GS (0x1D)
const DEL = 0x7f;
const MAX_ENCODED_BYTES = 1400;

function normalizeBarcode(raw) {
  let out = "";
  for (const ch of String(raw ?? "")) {
    const c = ch.codePointAt(0);
    if (c <= CTRL_MAX || c === DEL) continue;
    out += ch;
  }
  return out.trim();
}

function computeCodeId(raw) {
  const norm = normalizeBarcode(raw);
  const encoded = encodeURIComponent(norm);
  if (Buffer.byteLength(encoded, "utf8") <= MAX_ENCODED_BYTES) {
    return `c_${encoded}`;
  }
  return `h_${crypto.createHash("sha256").update(norm, "utf8").digest("hex")}`;
}

module.exports = { NORM_VERSION, normalizeBarcode, computeCodeId };
