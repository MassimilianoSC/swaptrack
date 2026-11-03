// PIANO P-22, DA_FARE "the file on Storage has no EXIF and no GPS": test fixture, pure (no Node or browser API).
// addExifGps puts an EXIF segment with an invented GPS position into a JPEG (right after the start marker), so a test
// can give the app a photo "taken with location"; hasExif / hasGps tell whether a JPEG still carries one.
// The JPEG itself must be real (decodable): the e2e test can make one in the browser (canvas.toBlob "image/jpeg").

const GPS_INFO = 0x8825; // IFD0 tag: pointer to the GPS IFD

// TIFF block of the EXIF segment: IFD0 with only the GPS pointer, then a GPS IFD with latitude and longitude.
function tiffWithGps(bigEndian: boolean): Uint8Array {
  const out = new Uint8Array(128);
  const v = new DataView(out.buffer);
  const le = !bigEndian;
  out.set(bigEndian ? [0x4d, 0x4d] : [0x49, 0x49], 0);
  v.setUint16(2, 42, le);
  v.setUint32(4, 8, le); // IFD0 at 8
  const entry = (at: number, tag: number, type: number, count: number, value: (p: number) => void) => {
    v.setUint16(at, tag, le); v.setUint16(at + 2, type, le); v.setUint32(at + 4, count, le); value(at + 8);
  };
  // IFD0 (8..26): one entry, next IFD 0.
  v.setUint16(8, 1, le);
  entry(10, GPS_INFO, 4, 1, (p) => v.setUint32(p, 26, le));
  v.setUint32(22, 0, le);
  // GPS IFD (26..80): N / latitude, E / longitude; the rationals follow at 80 and 104.
  v.setUint16(26, 4, le);
  entry(28, 0x0001, 2, 2, (p) => out.set([0x4e, 0], p));
  entry(40, 0x0002, 5, 3, (p) => v.setUint32(p, 80, le));
  entry(52, 0x0003, 2, 2, (p) => out.set([0x45, 0], p));
  entry(64, 0x0004, 5, 3, (p) => v.setUint32(p, 104, le));
  v.setUint32(76, 0, le);
  // Invented position: 45° 30' 15" N, 9° 10' 20" E.
  [[45, 1], [30, 1], [15, 1], [9, 1], [10, 1], [20, 1]].forEach(([n, d], i) => {
    v.setUint32(80 + i * 8, n, le); v.setUint32(84 + i * 8, d, le);
  });
  return out;
}

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif\0\0"

export function addExifGps(jpeg: Uint8Array, opts: { bigEndian?: boolean } = {}): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("not a JPEG");
  const tiff = tiffWithGps(!!opts.bigEndian);
  const length = 2 + EXIF_HEADER.length + tiff.length;
  const out = new Uint8Array(jpeg.length + 2 + length);
  out.set([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...EXIF_HEADER], 0);
  out.set(tiff, 12);
  out.set(jpeg.subarray(2), 12 + tiff.length);
  return out;
}

// TIFF blocks of the EXIF segments (APP1 starting with "Exif\0\0"), up to the start of the image data.
function exifBlocks(jpeg: Uint8Array): Uint8Array[] {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("not a JPEG");
  const blocks: Uint8Array[] = [];
  let i = 2;
  while (i + 4 <= jpeg.length) {
    if (jpeg[i] !== 0xff) break;
    const m = jpeg[i + 1];
    if (m === 0xff) { i++; continue; } // fill byte
    if (m === 0xda || m === 0xd9) break; // image data or end
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; } // markers without length
    const len = (jpeg[i + 2] << 8) | jpeg[i + 3];
    const body = jpeg.subarray(i + 4, i + 2 + len);
    if (m === 0xe1 && EXIF_HEADER.every((b, k) => body[k] === b)) blocks.push(body.subarray(EXIF_HEADER.length));
    i += 2 + len;
  }
  return blocks;
}

export const hasExif = (jpeg: Uint8Array): boolean => exifBlocks(jpeg).length > 0;

export function hasGps(jpeg: Uint8Array): boolean {
  return exifBlocks(jpeg).some((t) => {
    if (t.length < 8) return false;
    const v = new DataView(t.buffer, t.byteOffset, t.byteLength);
    const le = t[0] === 0x49;
    const ifd0 = v.getUint32(4, le);
    if (ifd0 + 2 > t.length) return false;
    const n = v.getUint16(ifd0, le);
    for (let k = 0; k < n && ifd0 + 2 + k * 12 + 2 <= t.length; k++) if (v.getUint16(ifd0 + 2 + k * 12, le) === GPS_INFO) return true;
    return false;
  });
}
