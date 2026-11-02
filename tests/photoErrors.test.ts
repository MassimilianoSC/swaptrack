import { describe, it, expect } from "vitest";
import { isPermanentPhotoError, MAX_PERMANENT_FAILURES, MIN_PERMANENT_INTERVAL_MS, countsAsPermanentFailure } from "../src/lib/offline/photoErrors";

// P-69: a queued photo becomes "lost" only after permanent Storage errors. Before, flushQueue counted EVERY failed
// upload (network included) and declared the photo lost after 5 of them.
describe("isPermanentPhotoError", () => {
  it("network and transient errors never count: the photo stays in the queue", () => {
    for (const code of ["storage/retry-limit-exceeded", "storage/unknown", "storage/canceled", "storage/server-file-wrong-size", "storage/unauthenticated", undefined, ""]) {
      expect(isPermanentPhotoError(code)).toBe(false);
    }
  });

  it("errors that can never succeed on a retry count", () => {
    for (const code of ["storage/unauthorized", "storage/invalid-argument", "storage/invalid-format", "storage/quota-exceeded"]) {
      expect(isPermanentPhotoError(code)).toBe(true);
    }
  });

  it("a photo is lost after five permanent failures counted at least 15 minutes apart (more than the 1 h token life)", () => {
    expect(MAX_PERMANENT_FAILURES).toBe(5);
    expect(MIN_PERMANENT_INTERVAL_MS).toBe(15 * 60 * 1000);
    expect(MAX_PERMANENT_FAILURES * MIN_PERMANENT_INTERVAL_MS).toBeGreaterThan(60 * 60 * 1000);
    const t0 = Date.UTC(2026, 9, 30, 10, 0, 0);
    expect(countsAsPermanentFailure(undefined, t0)).toBe(true);
    expect(countsAsPermanentFailure(t0, t0 + 30_000)).toBe(false); // the next 30 s flush does not count
    expect(countsAsPermanentFailure(t0, t0 + MIN_PERMANENT_INTERVAL_MS)).toBe(true);
  });
});
