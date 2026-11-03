// P-82: the record of a test round that passed, so that `deployBatch.mjs --yes` right after a checks-only run does not
// repeat it. Kept outside the repository (user's temporary folder); trusted only for the same commit, the same
// version of the test round, and less than 24 hours.
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CHECK_FILE = join(tmpdir(), "swaptrack-deploy-check.json");
export const CHECK_VERSION = 2; // raise when the test round changes, so an older record is not trusted
export const CHECK_VALID_MS = 24 * 3600 * 1000;

// Pure: is this record a pass of the same commit and test round, recorded less than 24 hours before `now`?
export function isRecentPass(record, commit, now, version = CHECK_VERSION) {
  return !!record && typeof record === "object" && record.version === version && typeof commit === "string" && commit.length > 0
    && record.commit === commit && typeof record.at === "number" && now - record.at >= 0 && now - record.at < CHECK_VALID_MS;
}

export function readPass(file = CHECK_FILE) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

export function writePass(commit, now = Date.now(), file = CHECK_FILE) {
  try { writeFileSync(file, JSON.stringify({ version: CHECK_VERSION, commit, at: now })); return true; } catch { return false; }
}
