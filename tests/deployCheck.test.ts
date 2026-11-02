import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isRecentPass, readPass, writePass, CHECK_VERSION, CHECK_VALID_MS } from "../scripts/deployCheck.mjs";

// P-82: deployBatch --yes may skip the test round only when it passed on the same commit, with the same version of
// the round, less than 24 hours before. Any doubt repeats the tests.
const NOW = Date.UTC(2026, 10, 2, 12);
const rec = (over: Record<string, unknown> = {}) => ({ version: CHECK_VERSION, commit: "abc1234", at: NOW - 3600_000, ...over });

describe("isRecentPass", () => {
  it("same commit, same version, one hour ago: skip", () => {
    expect(isRecentPass(rec(), "abc1234", NOW)).toBe(true);
  });
  it("another commit, an older version of the round, 24 hours or more, a future date: repeat", () => {
    expect(isRecentPass(rec(), "def5678", NOW)).toBe(false);
    expect(isRecentPass(rec({ version: CHECK_VERSION - 1 }), "abc1234", NOW)).toBe(false);
    expect(isRecentPass(rec({ at: NOW - CHECK_VALID_MS }), "abc1234", NOW)).toBe(false);
    expect(isRecentPass(rec({ at: NOW + 60_000 }), "abc1234", NOW)).toBe(false);
  });
  it("no record, a broken record, an empty commit: repeat", () => {
    expect(isRecentPass(null, "abc1234", NOW)).toBe(false);
    expect(isRecentPass({ commit: "abc1234" }, "abc1234", NOW)).toBe(false);
    expect(isRecentPass(rec({ commit: "" }), "", NOW)).toBe(false);
  });
});

describe("readPass / writePass", () => {
  it("writes and reads back the record; a missing or unreadable file reads as no record", () => {
    const dir = mkdtempSync(join(tmpdir(), "deploycheck-"));
    try {
      const file = join(dir, "check.json");
      expect(readPass(file)).toBeNull();
      expect(writePass("abc1234", NOW, file)).toBe(true);
      expect(readPass(file)).toEqual({ version: CHECK_VERSION, commit: "abc1234", at: NOW });
      expect(isRecentPass(readPass(file), "abc1234", NOW + 1000)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
