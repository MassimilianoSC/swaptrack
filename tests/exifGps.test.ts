import { describe, it, expect } from "vitest";
import { addExifGps, hasExif, hasGps } from "./fixtures/exifGps";

// P-22 fixture: the photo "with location" given to the app, and the check of the file that reaches Storage.
// A JPEG skeleton (start, quantization table, start of scan, data, end): enough for the marker walk.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x01, 0x02, 0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]);
// The same with a JFIF segment, as many cameras and canvas.toBlob write it: not EXIF.
const JFIF = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x07, 0x4a, 0x46, 0x49, 0x46, 0x00, ...JPEG.subarray(2)]);

describe("addExifGps / hasExif / hasGps", () => {
  it("a JPEG without EXIF: no EXIF, no GPS (also with a JFIF segment)", () => {
    expect([hasExif(JPEG), hasGps(JPEG)]).toEqual([false, false]);
    expect([hasExif(JFIF), hasGps(JFIF)]).toEqual([false, false]);
  });
  it("adds an EXIF segment with GPS right after the start marker and keeps the rest of the file", () => {
    for (const bigEndian of [false, true]) {
      const out = addExifGps(JFIF, { bigEndian });
      expect([hasExif(out), hasGps(out)]).toEqual([true, true]);
      expect([...out.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe1]);
      expect([...out.subarray(out.length - JFIF.length + 2)]).toEqual([...JFIF.subarray(2)]);
    }
  });
  it("an EXIF segment without the GPS pointer is EXIF but not GPS", () => {
    const out = addExifGps(JPEG);
    out[12 + 10] = 0x12; // IFD0's only tag (little endian, 12 bytes of segment header before the TIFF): 0x8825 -> 0x8812
    expect([hasExif(out), hasGps(out)]).toEqual([true, false]);
  });
  it("refuses what is not a JPEG", () => {
    expect(() => addExifGps(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toThrow("not a JPEG");
    expect(() => hasExif(new Uint8Array([0x89, 0x50]))).toThrow("not a JPEG");
  });
});
