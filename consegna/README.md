# consegna/ — files to place in the project

These files are **adapted** from a system used in the field for months and reviewed many times. The adaptations are only: identifiers and comments translated to English, Vite instead of Create React App (`import.meta.env.BASE_URL`), errors returned as codes instead of Italian messages, the location-poster helpers removed (SwapTrack does not use them). **The logic is unchanged: do not rewrite or "improve" it** (SPEC.md R18). Adding TypeScript declarations next to them is fine.

| File | What it is | SPEC |
|---|---|---|
| `src/lib/codeId.js` | Barcode identity function, frontend copy (irreversible) | R8, §6.3 |
| `functions/src/codeId.node.js` | Same function, Cloud Functions copy (CommonJS) | R8, R19 |
| `tests/codeId.parity.test.mjs` | Vitest test: the two copies must give the same ids | R8, §17 |
| `src/lib/clockOffset.js` | Device clock correction for scannedAt | R9 |
| `src/lib/imageCompress.js` | Photo compression, strips EXIF and GPS | R10, §7.3 |
| `src/lib/scanner/engine.js` | ScannerEngine interface: the only entry point for camera scanning | R16, §7.1 |
| `src/lib/scanner/webEngine.js` | Web engine: native BarcodeDetector + zxing-wasm fallback | §7.1 |
| `scripts/copy-wasm.mjs` | Copies zxing_reader.wasm into public/ (run in predev and prebuild) | §7.1, §16 |

## Pinned versions (mandatory)

Pin these exact versions in `package.json` (no `^`):

- `barcode-detector`: **3.2.1** — `webEngine.js` uses the v3 API (`prepareZXingModule` from `barcode-detector/ponyfill`).
- `zxing-wasm`: **3.1.1** — `copy-wasm.mjs` reads `node_modules/zxing-wasm/dist/reader/zxing_reader.wasm`, the v3 path.

A different version breaks the scanner **only on the fallback path**, that is on iPhones, where the problem would not show up on an Android or desktop test.

Also needed: `vitest` for the parity test.
