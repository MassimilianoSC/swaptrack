import { describe, it, expect } from "vitest";
import i18next from "i18next";
import it_ from "../src/i18n/it.json";
import en from "../src/i18n/en.json";
import { pieceCode, replacedByText } from "../src/lib/itemText";
import { locationTypeOf } from "../functions/src/shared/locationType";

// P-205 (census by role): ids on the screen. The piece page was titled "Pezzo 3f2a9c1b" (the start of the item id) and
// a replaced label read "(→ 9f86d081884c…)" (the codeId of the new label, a hash). Expected: the codes a person reads.
const i18n = i18next.createInstance();
await i18n.init({ lng: "it", resources: { it: { translation: it_ }, en: { translation: en } }, interpolation: { escapeValue: false } });
const t = i18n.t.bind(i18n) as unknown as (k: string, o?: Record<string, unknown>) => string;
const HASH_OLD = "a3f1c2e4b5d60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9";
const HASH_NEW = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
const codes = [
  { id: HASH_OLD, raw: "SN-OLD-001", active: false, replacedBy: HASH_NEW },
  { id: HASH_NEW, raw: "RL-NEW-777", active: true, replacedBy: null },
];

describe("the piece page in codes, not ids (P-205)", () => {
  it("the title is the piece's active code, else its first code; nothing while the codes load", () => {
    expect(t("items.title", { code: pieceCode(codes) })).toBe("Pezzo RL-NEW-777");
    expect(pieceCode([{ id: HASH_OLD, raw: "SN-ONLY", active: false }])).toBe("SN-ONLY");
    expect(pieceCode([])).toBeNull();
  });
  it("a replaced label says which label replaced it, never the hash", () => {
    const text = replacedByText(codes[0], codes, t);
    expect(text).toBe("sostituito da RL-NEW-777");
    expect(text).not.toContain(HASH_NEW.slice(0, 8));
    expect(replacedByText({ id: "x", raw: "SN-X", active: false, replacedBy: "unknown-hash" }, codes, t)).toBe("sostituito");
  });
  it("the hints of the correction windows have no internal words", () => {
    for (const lang of [it_, en]) {
      for (const k of ["forceStateHint", "mergeHint", "correctLocationHint"] as const) {
        expect((lang.items as Record<string, string>)[k]).not.toMatch(/force_state|mergedInto|trigger|`/);
      }
    }
  });
});

// P-205: the locations import read only "site, asp_warehouse, client_warehouse". The names a person writes are read too.
describe("the type of a location in the import (P-205)", () => {
  it("Italian and English names, any case, spaces, dashes or underscores", () => {
    for (const [raw, type] of [
      ["Sito", "site"], ["SITO", "site"], ["site", "site"], [" Site ", "site"],
      ["Magazzino ASP", "asp_warehouse"], ["magazzino-asp", "asp_warehouse"], ["asp_warehouse", "asp_warehouse"], ["ASP warehouse", "asp_warehouse"],
      ["Magazzino cliente", "client_warehouse"], ["Magazzino del cliente", "client_warehouse"], ["client_warehouse", "client_warehouse"], ["Client Warehouse", "client_warehouse"],
    ] as const) expect([raw, locationTypeOf(raw)]).toEqual([raw, type]);
  });
  it("anything else is not a type", () => {
    for (const raw of ["", "magazzino", "warehouse", "Sito X", null, undefined]) expect(locationTypeOf(raw)).toBeNull();
  });
  it("the hint of the import lists the names a person writes", () => {
    expect(it_.import.typeValues).toBe("Valori del tipo: Sito, Magazzino ASP, Magazzino cliente.");
    for (const v of ["Sito", "Magazzino ASP", "Magazzino cliente"]) expect(locationTypeOf(v)).not.toBeNull();
  });
});
