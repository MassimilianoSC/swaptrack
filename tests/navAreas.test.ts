import { describe, it, expect } from "vitest";
import it_ from "../src/i18n/it.json";
import en from "../src/i18n/en.json";
import { NAV, navAreasFor, type NavArea } from "../src/app/nav";

// P-222 (tester): the menu in areas. An area shows its title only when it has at least two entries for that role;
// the Home stays on top, alone, without a title. The titles are nav.areas.<area>, put together at runtime: check:i18n
// cannot see them, so this test does (as navHomeCards.test.ts for the Home cards, P-196).
const titled = (role: string) => navAreasFor(role).filter((g) => g.titled).map((g) => g.area);
const entries = (role: string, area: NavArea) => navAreasFor(role).find((g) => g.area === area)?.items.map((n) => n.label) ?? [];

describe("the menu in areas (P-222)", () => {
  it("client admin: titles for Operations, To check, Registry, Configuration; the single-entry areas without", () => {
    expect(navAreasFor("client_admin").map((g) => g.area)).toEqual(["home", "dashboard", "operations", "documents", "check", "reports", "registry", "config", "guide"]);
    expect(titled("client_admin")).toEqual(["operations", "check", "registry", "config"]);
    expect(entries("client_admin", "operations")).toEqual(["nav.items", "nav.toComplete", "nav.shipments"]);
    expect(entries("client_admin", "check")).toEqual(["nav.alerts", "nav.anomalies"]);
    expect(entries("client_admin", "registry")).toEqual(["nav.organizations", "nav.users", "nav.locations", "nav.models"]);
    expect(entries("client_admin", "config")).toEqual(["nav.sorting", "nav.settings", "nav.adminLog"]);
  });
  it("the other roles: the same areas with their own entries only", () => {
    expect(titled("client_office")).toEqual(["operations", "check"]);
    expect(titled("client_warehouse")).toEqual(["operations"]);
    expect(entries("client_warehouse", "operations")).toEqual(["nav.items", "nav.shipments"]);
    expect(titled("asp_admin")).toEqual(["operations", "check"]);
    expect(entries("asp_admin", "registry")).toEqual(["nav.people"]); // one entry: no title
    expect(titled("asp_warehouse")).toEqual(["operations", "check"]);
  });
  it("the technician: no title (Home and Guide), as before", () => {
    expect(navAreasFor("asp_technician").map((g) => [g.area, g.titled])).toEqual([["home", false], ["guide", false]]);
  });
  it("the menu entries are the same as before, in the same order", () => {
    for (const role of ["client_admin", "client_office", "client_warehouse", "asp_admin", "asp_warehouse", "asp_technician"]) {
      expect(navAreasFor(role).flatMap((g) => g.items)).toEqual(NAV.filter((n) => n.roles.includes(role)));
    }
  });
  it("every area has its title in Italian and English", () => {
    const areas = [...new Set(NAV.map((n) => n.area))];
    for (const j of [it_, en]) {
      const t = (j as { nav: { areas?: Record<string, string> } }).nav.areas ?? {};
      expect(areas.filter((a) => !t[a]?.trim())).toEqual([]);
    }
  });
});

// P-222: the Home cards in the same areas (client roles; the ASP roles see the site picker).
import { homeSections } from "../src/app/nav";
describe("the Home cards in areas (P-222)", () => {
  it("client admin: titled sections for the titled areas, the others untitled, in menu order, every card once", () => {
    const s = homeSections("client_admin");
    expect(s.map((x) => x.area)).toEqual([null, "operations", null, "check", null, "registry", "config", null]);
    expect(s.find((x) => x.area === "config")!.items.map((n) => n.label)).toEqual(["nav.sorting", "nav.settings", "nav.adminLog"]);
    expect(s.flatMap((x) => x.items)).toEqual(NAV.filter((n) => n.roles.includes("client_admin") && n.to !== "/"));
  });
  it("client warehouse: Operations titled; Documents, Alerts and Guide share one untitled section", () => {
    const s = homeSections("client_warehouse");
    expect(s.map((x) => [x.area, x.items.map((n) => n.label)])).toEqual([
      ["operations", ["nav.items", "nav.shipments"]],
      [null, ["nav.documents", "nav.alerts", "nav.guide"]],
    ]);
  });
});
