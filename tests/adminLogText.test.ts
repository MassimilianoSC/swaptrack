import { describe, it, expect } from "vitest";
import i18next from "i18next";
import it_ from "../src/i18n/it.json";
import en from "../src/i18n/en.json";
import { logTarget, logDetails, personName, type LogEntry, type LogNames } from "../src/lib/adminLogText";

// P-184 (tester, C12): the admin log showed {"kind":"bom","number":"111","version":2}. Every action the server writes
// (functions/src/routers/*: adminLog(...)) must read as words: no braces, no quotes of JSON, no ids.
const i18n = i18next.createInstance();
await i18n.init({ lng: "it", resources: { it: { translation: it_ }, en: { translation: en } }, interpolation: { escapeValue: false } });
const t = i18n.t.bind(i18n) as unknown as (k: string, o?: Record<string, unknown>) => string;
const names: LogNames = {
  user: (uid) => ({ u1: "Mario Rossi", u2: "Anna Bianchi" } as Record<string, string>)[uid] ?? null,
  org: (id) => ({ org_asp_nord: "ASP Nord", org_asp_sud: "ASP Sud" } as Record<string, string>)[id] ?? null,
};
const row = (action: string, target: string | null, details: Record<string, unknown> = {}): LogEntry => ({ action, target, details });

// One entry for each call of adminLog in the server, with the details it writes.
const ENTRIES: Array<[LogEntry, string, string]> = [
  [row("document_saved", "AbC123docId", { kind: "bom", number: "111", version: 2 }), "BOM n. 111", "Versione 2"],
  [row("user_created", "u2", { role: "asp_technician", orgId: "org_asp_nord" }), "Anna Bianchi", "Ruolo: Tecnico ASP · ASP Nord"],
  [row("role_changed", "u2", { from: "asp_technician", to: "asp_warehouse" }), "Anna Bianchi", "Da «Tecnico ASP» a «Magazzino ASP»"],
  [row("invitation_link_shown", "u2"), "Anna Bianchi", ""],
  [row("user_deleted", "uidGone"), "Utente non più presente", ""],
  [row("asp_created", "org_new", { name: "ASP Ovest" }), "ASP Ovest", ""],
  [row("asp_disabled", "org_asp_sud"), "ASP Sud", ""],
  [row("organization_language_changed", "org_asp_nord", { language: "en" }), "ASP Nord", "Lingua: inglese"],
  [row("settings_changed", "settings/branding"), "Impostazioni: Marchio", ""],
  [row("settings_changed", "settings/importMappings"), "Impostazioni: Colonne delle importazioni", ""],
  [row("settings_changed", "sortingCategories/k3J9"), "Categoria di smistamento", ""],
  [row("settings_changed", "sortingRules/x7Q2"), "Regola di smistamento", ""],
  [row("location_created", "loc_SITO-00001"), "SITO-00001", ""],
  [row("location_updated", "loc_MAG%20NORD%2001"), "MAG NORD 01", ""],
  [row("locations_deactivated", null, { count: 3, importId: "imp_9f" }), "—", "Luoghi disattivati: 3"],
  [row("site_reassigned", "loc_SITO-00004", { from: "org_asp_nord", to: "org_asp_sud", pieces: 5 }), "SITO-00004", "Da ASP Nord a ASP Sud · pezzi spostati: 5"],
  [row("model_updated", "mdl_MC400100"), "MC400100", ""],
  [row("models_deactivated", null, { count: 2 }), "—", "Modelli disattivati: 2"],
  [row("items_merged", "itemInto1", { from: "itemFrom1", reason: "Etichetta doppia" }), "Apri il pezzo", "Motivo: Etichetta doppia"],
  [row("event_location_corrected", "evt_77", { reason: "Sito sbagliato" }), "—", "Motivo: Sito sbagliato"],
  [row("anomaly_resolved", "anom_5", { type: "late_event", action: "accept_move" }), "—", "Evento in ritardo · spostamento accettato"],
  [row("anomaly_resolved", "anom_6", { type: "late_event", action: "dismiss" }), "—", "Evento in ritardo · chiusa senza spostamento"],
];

describe("the admin log in words (P-184)", () => {
  it.each(ENTRIES)("%o", (entry, target, details) => {
    expect(logTarget(entry, t, names)).toBe(target);
    expect(logDetails(entry, t, names)).toBe(details);
  });
  it("no entry shows braces, JSON quotes or the ids it was given", () => {
    for (const [entry] of ENTRIES) {
      const text = `${logTarget(entry, t, names)} ${logDetails(entry, t, names)}`;
      expect(text).not.toMatch(/[{}"]/);
      for (const id of ["AbC123docId", "uidGone", "org_", "loc_", "mdl_", "imp_9f", "itemInto1", "itemFrom1", "evt_77", "anom_", "sortingRules/", "settings/"]) expect(text).not.toContain(id);
    }
  });
  it("the actor: its name, or «no longer present», never the uid", () => {
    expect(personName("u1", t, names)).toBe("Mario Rossi");
    expect(personName("uidGone", t, names)).toBe("Utente non più presente");
  });
  it("in English too", async () => {
    await i18n.changeLanguage("en");
    expect(logTarget(ENTRIES[0][0], t, names)).toBe("BOM no. 111");
    expect(logDetails(ENTRIES[0][0], t, names)).toBe("Version 2");
    expect(logDetails(ENTRIES[20][0], t, names)).toBe(`${en.anomalies.types.late_event} · move accepted`);
    await i18n.changeLanguage("it");
  });
});
