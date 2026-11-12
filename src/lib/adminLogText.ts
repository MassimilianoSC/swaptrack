// P-184: the admin log in plain words. The server writes each entry as { action, target, details } (functions/src/core/adminLog.ts):
// the target is an id (a user, an organization, "settings/<name>", "loc_<code>", "mdl_<code>", a document...) and the
// details an object. The page showed both as they were stored ({"kind":"bom","number":"111","version":2}); here every
// action gets a sentence, and an id that means nothing to a person is never shown. Pure, so a unit test can check each action.
export interface LogEntry { action: string; target: string | null; details?: Record<string, unknown> }
export type Translate = (key: string, options?: Record<string, unknown>) => string;
export interface LogNames { user: (uid: string) => string | null; org: (id: string) => string | null }

const NONE = "—";
const USER_ACTIONS = new Set([
  "user_created", "invitation_link_shown", "user_invited_again", "role_changed", "user_deactivated", "user_reactivated",
  "user_blocked", "signed_out_everywhere", "user_deleted",
]);
const ORG_ACTIONS = new Set(["asp_created", "asp_enabled", "asp_disabled", "organization_language_changed"]);

const str = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");
// "loc_SITO%2000001" -> "SITO 00001": the code a person knows (functions/src/shared/policy.ts, locationIdFor/modelIdFor).
const codeOf = (id: string): string => { try { return decodeURIComponent(id.slice(4)); } catch { return id.slice(4); } };

// The name of a person in the log (also for the actor); a profile no longer there is said so, never shown as its uid.
export function personName(uid: string | null | undefined, t: Translate, names: LogNames): string {
  if (!uid) return NONE;
  return names.user(uid) ?? t("adminLog.unknownUser");
}

export function logTarget(e: LogEntry, t: Translate, names: LogNames): string {
  const target = e.target ?? "";
  const d = e.details ?? {};
  if (e.action === "document_saved") {
    return str(d.number) ? t("adminLog.document", { kind: t(`documents.kinds.${str(d.kind)}`, { defaultValue: t("documents.kind") }), number: str(d.number) }) : NONE;
  }
  if (e.action === "items_merged") return target ? t("adminLog.openPiece") : NONE;
  if (!target) return NONE;
  if (target.startsWith("settings/")) {
    const name = target.slice("settings/".length);
    return t("adminLog.settingsTarget", { name: name === "importMappings" ? t("adminLog.importMappings") : t(`settings.tabs.${name}`, { defaultValue: t("nav.settings") }) });
  }
  if (target.startsWith("sortingCategories/")) return t("adminLog.sortingCategory");
  if (target.startsWith("sortingRules/")) return t("adminLog.sortingRule");
  if (target.startsWith("loc_") || target.startsWith("mdl_")) return codeOf(target);
  if (ORG_ACTIONS.has(e.action)) return names.org(target) ?? (str(d.name) || NONE);
  if (USER_ACTIONS.has(e.action)) return personName(target, t, names);
  return names.user(target) ?? NONE; // an event, an anomaly: an id only
}

export function logDetails(e: LogEntry, t: Translate, names: LogNames): string {
  const d = e.details ?? {};
  const role = (r: unknown) => t(`roles.${str(r)}`, { defaultValue: str(r) });
  const org = (id: unknown) => names.org(str(id)) ?? NONE;
  switch (e.action) {
    case "user_created": return d.role ? t("adminLog.d.roleOrg", { role: role(d.role), org: org(d.orgId) }) : "";
    case "role_changed": return d.from || d.to ? t("adminLog.d.roleChange", { from: role(d.from), to: role(d.to) }) : "";
    case "organization_language_changed": return d.language ? t("adminLog.d.language", { language: t(`adminLog.languages.${str(d.language)}`, { defaultValue: str(d.language) }) }) : "";
    case "locations_deactivated": return t("adminLog.d.locations", { count: Number(d.count) || 0 });
    case "models_deactivated": return t("adminLog.d.models", { count: Number(d.count) || 0 });
    case "site_reassigned": return t("adminLog.d.siteMove", { from: org(d.from), to: org(d.to), pieces: Number(d.pieces) || 0 });
    case "document_saved": return d.version ? t("adminLog.d.version", { version: str(d.version) }) : "";
    case "items_merged":
    case "event_location_corrected": return str(d.reason) ? t("adminLog.d.reason", { reason: str(d.reason) }) : "";
    case "anomaly_resolved": {
      const type = d.type ? t(`anomalies.types.${str(d.type)}`, { defaultValue: t("nav.anomalies") }) : t("nav.anomalies");
      return d.action ? t("adminLog.d.anomaly", { type, choice: t(`adminLog.choices.${str(d.action)}`, { defaultValue: "" }) }).replace(/ · $/, "") : type;
    }
    default: return ""; // asp_created (the name is the target) and the actions without details
  }
}
