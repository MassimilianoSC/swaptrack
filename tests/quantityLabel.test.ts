import { describe, it, expect } from "vitest";
import i18next from "i18next";
import it_ from "../src/i18n/it.json";
import en from "../src/i18n/en.json";
import { quantityLabel, catalogIndex } from "../src/lib/documents/quantityLabel";

// P-192 (found checking the tester's script): in «Compare» a quantity line read "|MC400170|: 0/3", its technical key
// (modelId|materialCode|direction). Expected: the material code, the model's name when the catalog has it, and in a
// BOM «da smontare» / «da installare». The rows are as compareDocument returns them (QuantityResult).
const i18n = i18next.createInstance();
await i18n.init({ lng: "it", resources: { it: { translation: it_ }, en: { translation: en } }, interpolation: { escapeValue: false } });
const t = i18n.t.bind(i18n) as unknown as (k: string, o?: Record<string, unknown>) => string;
const catalog = catalogIndex([{ id: "mdl_MC400170", materialCode: "MC400170", model: "PSU-110" }, { id: "mdl_MC400177", materialCode: "MC400177", model: "TRX-111" }]);

describe("a quantity line of «Compare» in words (P-192)", () => {
  it("DDT: the material code with the model's name", () => {
    expect(quantityLabel({ materialCode: "MC400170", modelId: null, expected: 3, counted: 0 }, t, catalog)).toBe("MC400170 (PSU-110): 0/3");
  });
  it("BOM: and whether the pieces are installed or removed", () => {
    expect(quantityLabel({ materialCode: "MC400177", modelId: null, direction: "install", expected: 2, counted: 1 }, t, catalog)).toBe("MC400177 (TRX-111), da installare: 1/2");
    expect(quantityLabel({ materialCode: "MC400177", modelId: null, direction: "remove", expected: 2, counted: 2 }, t, catalog)).toBe("MC400177 (TRX-111), da smontare: 2/2");
  });
  it("a line with the model only takes the code from the catalog; a code the catalog does not know is shown as it is", () => {
    expect(quantityLabel({ materialCode: null, modelId: "mdl_MC400170", expected: 1, counted: 1 }, t, catalog)).toBe("MC400170 (PSU-110): 1/1");
    expect(quantityLabel({ materialCode: "MC999999", modelId: null, expected: 4, counted: 0 }, t, catalog)).toBe("MC999999: 0/4");
    expect(quantityLabel({ materialCode: null, modelId: null, expected: 1, counted: 0 }, t, catalog)).toBe("senza codice: 0/1");
  });
  it("never the technical key", () => {
    for (const q of [{ materialCode: "MC400170", modelId: null }, { materialCode: null, modelId: "mdl_MC400170", direction: "install" as const }, { materialCode: "X1", modelId: "mdl_X1", direction: "remove" as const }]) {
      const text = quantityLabel({ ...q, expected: 1, counted: 0 }, t, catalog);
      expect(text).not.toMatch(/\||mdl_|install\b|remove\b/);
    }
  });
  it("in English too", async () => {
    await i18n.changeLanguage("en");
    expect(quantityLabel({ materialCode: "MC400177", modelId: null, direction: "install", expected: 2, counted: 1 }, t, catalog)).toBe("MC400177 (TRX-111), to install: 1/2");
    await i18n.changeLanguage("it");
  });
});
