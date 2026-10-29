/**
 * Copies zxing_reader.wasm into public/, to serve it from OUR domain.
 *
 * Why not leave it on the CDN (the package default):
 *  - Offline: the PWA must work without network. A wasm on a CDN means the
 *    scanner dies on first use without coverage, exactly in the field.
 *  - Third parties: devices must not load anything from external domains.
 *
 * Run it before dev and build ("predev" and "prebuild" npm scripts), so an
 * update of zxing-wasm refreshes the copy instead of silently lagging behind.
 * The file must also be precached by the service worker.
 */
import { copyFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "zxing-wasm", "dist", "reader", "zxing_reader.wasm");
const target = join(root, "public", "zxing_reader.wasm");

if (!existsSync(source)) {
  console.error(`[copy-wasm] MISSING SOURCE: ${source}`);
  console.error("[copy-wasm] The scanner will not work on devices without a native BarcodeDetector.");
  process.exit(1);
}

copyFileSync(source, target);
console.log(`[copy-wasm] zxing_reader.wasm -> public/ (${Math.round(statSync(target).size / 1024)} KB)`);
