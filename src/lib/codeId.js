/**
 * Barcode identity function (frontend copy).
 *
 * DO NOT REWRITE. Copied from a system used in the field for months.
 * IRREVERSIBLE: this function decides the identity of the data. Changing it after
 * real data exists breaks the link with every code already stored. Any change
 * requires bumping NORM_VERSION in BOTH copies (this file and
 * functions/src/codeId.node.js) and a data migration.
 *
 * Why normalization is needed: the app uses two decoding engines (native
 * BarcodeDetector and the zxing-wasm fallback). For the same physical label they
 * can return different raw strings (for example GS1-128 with or without the
 * FNC1/GS separators). Without normalization the same label would produce two
 * different ids and therefore two items.
 */

/** Bump on every change of normalizeBarcode(). Stored on every code and event. */
export const NORM_VERSION = 1;

const CTRL_MAX = 0x1f; // C0 controls 0x00-0x1F, including FNC1/GS (0x1D)
const DEL = 0x7f;

/**
 * v1: drop control characters, then trim.
 *
 * No regular expressions with literal control characters: they are invisible in
 * the source and editors or tools can silently drop them, corrupting the most
 * critical function of the system. Filter by code point, explicitly.
 */
export function normalizeBarcode(raw) {
  let out = "";
  for (const ch of String(raw ?? "")) {
    const c = ch.codePointAt(0);
    if (c <= CTRL_MAX || c === DEL) continue;
    out += ch;
  }
  return out.trim();
}

// Firestore limit: 1500 bytes per document id. Keep a margin.
const MAX_ENCODED_BYTES = 1400;

/**
 * Document id in `codes` for a raw barcode.
 *
 * The constant prefix is NOT cosmetic: encodeURIComponent does not encode
 * . _ ! ~ * ' ( ) so a barcode "." or ".." would give an id forbidden by
 * Firestore, and "__X__" would match the reserved pattern __.*__.
 *
 * The hash branch is NOT theoretical: PDF417 carries up to ~1800 bytes and
 * encodeURIComponent can triple the length.
 */
export async function computeCodeId(raw) {
  const norm = normalizeBarcode(raw);
  const encoded = encodeURIComponent(norm);
  if (new TextEncoder().encode(encoded).length <= MAX_ENCODED_BYTES) {
    return `c_${encoded}`;
  }
  return `h_${await sha256Hex(norm)}`;
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
