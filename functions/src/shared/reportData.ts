// §13.4 monthly report and §13.3 export: pure computations, no Firebase imports (the caller loads the data).
import { reportT, type Lang } from "./reportStrings";

export interface ReportEvent {
  id: string; type: string; at: number; itemId: string | null; aspId: string | null; locationId: string | null;
  codeRaw: string | null; voided: boolean; payload: { categoryId?: string; newClass?: string; shipmentId?: string };
}
export interface PlaceInfo { code: string; name: string; type: string }
export interface ReportInput {
  scope: string;                                   // "client" or an aspId
  events: ReportEvent[];                           // events of the month (any organization: filtered here)
  returnShipmentAsp: Record<string, string>;       // shipmentId -> fromAspId (return_confirm is written with aspId null)
  itemModels: Record<string, string | null>;       // itemId -> model name
  places: Record<string, PlaceInfo>;               // locationId -> code, name, type
  categories: Record<string, string>;              // categoryId -> label in the report language
  orgNames: Record<string, string>;                // orgId -> name
  waiting: { newPieces: number; removedPieces: number; thresholdDays: number };
  alerts: { opened: number; closed: number };
}
export interface ReportSummary {
  received: number; installed: number; removed: number; sorted: number; returned: number;
  waitingNew: number; waitingRemoved: number; alertsOpened: number; alertsClosed: number;
}
export interface MovementRow { date: string; type: string; code: string; model: string; location: string; asp: string }
export interface ReportData {
  summary: ReportSummary; thresholdDays: number;
  sortedByCategory: Array<[string, number]>; topModels: Array<[string, number]>; topSites: Array<[string, number]>;
  byType: Array<[string, number]>; movements: MovementRow[];
}

const TOP = 5;
// The events of the scope: an ASP sees its own events, plus the client's confirmations of its return shipments.
export function inScope(e: ReportEvent, scope: string, returnShipmentAsp: Record<string, string>): boolean {
  if (scope === "client") return true;
  if (e.aspId === scope) return true;
  return e.type === "return_confirm" && !!e.payload.shipmentId && returnShipmentAsp[e.payload.shipmentId] === scope;
}

const ranked = (m: Map<string, Set<string>>): Array<[string, number]> =>
  [...m.entries()].map(([k, s]): [string, number] => [k, s.size]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const top = (m: Map<string, Set<string>>) => ranked(m).slice(0, TOP);
const add = (m: Map<string, Set<string>>, k: string, piece: string) => { if (!m.has(k)) m.set(k, new Set()); m.get(k)!.add(piece); };
export const placeLabel = (p: PlaceInfo | undefined, fallback: string) => (p ? `${p.code} ${p.name}`.trim() : fallback);

// Counts are of distinct pieces, not of scans; voided scans and the void events themselves are left out (§8.2).
export function computeReport(input: ReportInput, lang: Lang): ReportData {
  const { scope, returnShipmentAsp, itemModels, places, categories, orgNames } = input;
  const events = input.events.filter((e) => !e.voided && e.type !== "void" && inScope(e, scope, returnShipmentAsp))
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const piece = (e: ReportEvent) => e.itemId ?? `event:${e.id}`;
  const kinds: Record<string, Set<string>> = { received: new Set(), installed: new Set(), removed: new Set(), sorted: new Set(), returned: new Set() };
  const byCategory = new Map<string, Set<string>>(), byModel = new Map<string, Set<string>>(), bySite = new Map<string, Set<string>>();
  const byType = new Map<string, number>();
  const unknown = reportT(lang, "report.unknown");
  for (const e of events) {
    const p = piece(e);
    byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
    if (e.type === "arrive_at_warehouse") kinds.received.add(p);
    if (e.type === "install_at_site") kinds.installed.add(p);
    if (e.type === "remove_at_site") kinds.removed.add(p);
    if (e.type === "return_confirm") kinds.returned.add(p);
    // Sorted: classify, and an arrival with a category (sorted in the same pass, P-25).
    const category = e.type === "classify" && e.payload.newClass ? reportT(lang, `status.${e.payload.newClass}`)
      : (e.type === "classify" || e.type === "arrive_at_warehouse") && e.payload.categoryId ? categories[e.payload.categoryId] ?? unknown : null;
    if (category) { kinds.sorted.add(p); add(byCategory, category, p); }
    if (e.itemId && e.type !== "site_done") add(byModel, itemModels[e.itemId] || unknown, p);
    if ((e.type === "remove_at_site" || e.type === "install_at_site") && e.locationId) add(bySite, placeLabel(places[e.locationId], e.locationId), p);
  }
  const movements: MovementRow[] = events.map((e) => ({
    date: new Date(e.at).toISOString().replace("T", " ").slice(0, 16),
    type: reportT(lang, `event.${e.type}`),
    code: e.codeRaw ?? "",
    model: (e.itemId && itemModels[e.itemId]) || "",
    location: e.locationId ? placeLabel(places[e.locationId], e.locationId) : "",
    asp: e.aspId ? orgNames[e.aspId] ?? e.aspId : "",
  }));
  return {
    summary: {
      received: kinds.received.size, installed: kinds.installed.size, removed: kinds.removed.size, sorted: kinds.sorted.size,
      returned: kinds.returned.size, waitingNew: input.waiting.newPieces, waitingRemoved: input.waiting.removedPieces,
      alertsOpened: input.alerts.opened, alertsClosed: input.alerts.closed,
    },
    thresholdDays: input.waiting.thresholdDays,
    sortedByCategory: ranked(byCategory),
    topModels: top(byModel), topSites: top(bySite),
    byType: [...byType.entries()].map(([t, n]): [string, number] => [reportT(lang, `event.${t}`), n]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    movements,
  };
}

// §13.3 export: the period is the date of the piece's last scan (D-37), both ends included.
export const inPeriod = (ms: number | null, from?: number, to?: number) =>
  (from === undefined || (ms !== null && ms >= from)) && (to === undefined || (ms !== null && ms <= to));

// P-114 n.36: an export keeps at most `max` rows and says when some were left out.
export const capRows = <T>(list: T[], max: number): { rows: T[]; truncated: boolean } => ({ rows: list.slice(0, max), truncated: list.length > max });

export interface ExportItem {
  id: string; status?: string | null; flow?: string | null; model?: string | null; materialCode?: string | null; manufacturer?: string | null;
  equipmentType?: string | null; currentLocationId?: string | null; currentAspId?: string | null; sortingCategoryId?: string | null; lastScannedAt: number | null;
}
// One export row in the user's language: words and names instead of internal ids; never a person.
export function exportRow(it: ExportItem, lang: Lang, maps: { codes: Record<string, string>; places: Record<string, PlaceInfo>; orgNames: Record<string, string>; categories: Record<string, string> }) {
  const word = (prefix: string, v?: string | null) => (v ? reportT(lang, `${prefix}.${v}`) : "");
  return {
    code: maps.codes[it.id] ?? "",
    status: word("status", it.status), flow: word("flow", it.flow),
    model: it.model ?? "", materialCode: it.materialCode ?? "", manufacturer: it.manufacturer ?? "", equipmentType: it.equipmentType ?? "",
    location: it.currentLocationId ? placeLabel(maps.places[it.currentLocationId], it.currentLocationId) : "",
    asp: it.currentAspId ? maps.orgNames[it.currentAspId] ?? it.currentAspId : "",
    sortingCategory: it.sortingCategoryId ? maps.categories[it.sortingCategoryId] ?? it.sortingCategoryId : "",
    lastScanned: it.lastScannedAt ? new Date(it.lastScannedAt).toISOString().replace("T", " ").slice(0, 16) : "",
    id: it.id,
  };
}
