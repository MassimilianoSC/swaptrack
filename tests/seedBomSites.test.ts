import { describe, it, expect } from "vitest";
import { ORGS, SITE_COUNT, SITES_WITHOUT_SEEDED_BOM, bomSite, site } from "../scripts/seedCatalog.mjs";

// The full seed puts 10 BOMs on sites (fullSeed.mjs): the i-th goes to the ASP asps[i % 3], where asps follow the order
// of the organization ids (as Firestore returns them), on that ASP's sites in the order of their ids. None of them may
// land on the demo site or on a site where an e2e test saves its own BOM.
const sites = Array.from({ length: SITE_COUNT }, (_, i) => site(i + 1)).sort((a, b) => a.code.localeCompare(b.code));
const asps = ORGS.filter((o) => o.type === "asp").sort((a, b) => a.id.localeCompare(b.id));
const seeded = Array.from({ length: 10 }, (_, i) => {
  const asp = asps[i % asps.length];
  return bomSite(sites.filter((s) => s.aspId === asp.id), i).code;
});

describe("sites of the BOMs of the full seed", () => {
  it("never the demo site nor the sites of the e2e tests", () => {
    expect(seeded.filter((c) => SITES_WITHOUT_SEEDED_BOM.includes(c))).toEqual([]);
  });
  it("ten different sites, each of the ASP of its BOM", () => {
    expect(new Set(seeded).size).toBe(10);
    seeded.forEach((code, i) => expect(sites.find((s) => s.code === code)?.aspId).toBe(asps[i % asps.length].id));
  });
  it("the demo site is a site of ASP Nord", () => {
    expect(site(13)).toMatchObject({ code: "SITO-00013", aspId: "org_asp_nord" });
  });
});
