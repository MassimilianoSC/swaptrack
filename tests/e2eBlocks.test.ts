import { describe, it, expect } from "vitest";
import { filtersOf, SEEDS } from "../scripts/e2eBlocksPlan.mjs";

// D-60: the e2e round in blocks (scripts/e2e-blocks.mjs). The check of the plan is o3's e2e/check-blocks.mjs.
describe("filtersOf and SEEDS", () => {
  it("file names become literal filters (dots escaped); the seeds are the two of CLAUDE.md §5", () => {
    expect(filtersOf({ files: ["02-ddt-arrival.desk.spec.ts"] })).toEqual(["02-ddt-arrival\\.desk\\.spec\\.ts"]);
    expect(new RegExp(filtersOf({ files: ["a.desk.spec.ts"] })[0]).test("e2e\\aXdesk.spec.ts")).toBe(false);
    expect(SEEDS).toEqual({ full: "yarn seed && yarn seed:full", base: "yarn seed" });
  });
});
