import { describe, it, expect } from "vitest";
import it_ from "../src/i18n/it.json";
import en from "../src/i18n/en.json";
import { NAV } from "../src/app/nav";

// P-196 (round of lot 13): the Home card of every menu entry says what the section is for with
// t(`home.cards.${label after "nav."}`) (src/pages/Home.tsx). That key is put together at runtime, so check:i18n
// cannot see it: P-190 renamed the menu entry to nav.exportsReports and the Home showed "home.cards.exportsReports".
// Every menu entry, now and future, needs its card text in both languages.
const cards = (j: unknown) => ((j as { home?: { cards?: Record<string, unknown> } }).home?.cards ?? {});

describe("every menu entry has its Home card text (P-196)", () => {
  for (const [lang, j] of [["it", it_], ["en", en]] as const) {
    it(`${lang}: home.cards.<entry> exists for every entry of the menu`, () => {
      // The Home itself ("/") has no card (Home.tsx filters it out).
      const missing = NAV.filter((n) => n.to !== "/").map((n) => n.label.split(".")[1]).filter((k) => typeof cards(j)[k] !== "string" || !String(cards(j)[k]).trim());
      expect(missing).toEqual([]);
    });
  }
});
