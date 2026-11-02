import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// D-35: a Storage download URL works for anyone who has it, also without an account or after a change of role.
// The app uses it only for the public logo (src/lib/data/storage.ts, logoUrl); private files go through getBlob.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx|js|jsx)$/.test(name) ? [p] : [];
  });
}

describe("no public Storage URLs for private files", () => {
  it("getDownloadURL appears only in src/lib/data/storage.ts, once, inside logoUrl", () => {
    const users = sources("src").filter((p) => readFileSync(p, "utf8").includes("getDownloadURL"));
    expect(users.map((p) => p.replace(/\\/g, "/"))).toEqual(["src/lib/data/storage.ts"]);
    const text = readFileSync("src/lib/data/storage.ts", "utf8");
    const calls = text.match(/getDownloadURL\(/g) ?? [];
    expect(calls).toHaveLength(1);
    const logo = text.slice(text.indexOf("export async function logoUrl"), text.indexOf("export async function fileBlobUrl"));
    expect(logo).toContain("getDownloadURL(");
  });
});
