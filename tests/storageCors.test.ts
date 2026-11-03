import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// P-89 (D-35): the app reads private files with getBlob, which in the browser needs a CORS rule on the bucket for
// the app's own domains. scripts/storage-cors.json is that rule: it must follow the hosting sites of .firebaserc
// and allow reading only.
const cors = JSON.parse(readFileSync("scripts/storage-cors.json", "utf8")) as Array<{ origin: string[]; method: string[] }>;
const rc = JSON.parse(readFileSync(".firebaserc", "utf8")) as { targets: Record<string, { hosting?: { app?: string[] } }> };

describe("scripts/storage-cors.json", () => {
  it("allows the domains of every hosting site of the app, and nothing else", () => {
    const sites = Object.values(rc.targets).flatMap((t) => t.hosting?.app ?? []);
    expect(sites.length).toBeGreaterThan(0);
    const expected = sites.flatMap((s) => [`https://${s}.web.app`, `https://${s}.firebaseapp.com`]).sort();
    expect(cors.flatMap((r) => r.origin).sort()).toEqual(expected);
  });
  it("allows reading only", () => {
    expect(cors.flatMap((r) => r.method)).toEqual(["GET"]);
  });
});
