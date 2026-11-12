// Document comparison (SPEC §11.3). Pure function. Unit-tested.
// Three kinds (§11.1): ddt_in, ddt_return, bom. Lines are either serial lines or quantity lines.

export type Direction = "remove" | "install";
export type DocKind = "ddt_in" | "ddt_return" | "bom";

export interface SerialLine { codeRaw: string; codeId: string; materialCode?: string | null; modelId?: string | null; direction?: Direction }
export interface QuantityLine { materialCode?: string | null; modelId?: string | null; quantity: number; direction?: Direction }
export type Line = ({ kind: "serial" } & SerialLine) | ({ kind: "quantity" } & QuantityLine);

export interface EventFact {
  type: string; codeId: string | null; codeRaw?: string | null; materialCode: string | null; modelId: string | null;
  itemModelKnown: boolean; ddtId?: string | null; aspId?: string | null; locationId?: string | null; direction?: Direction;
}

export interface QuantityResult { key: string; materialCode?: string | null; modelId?: string | null; direction?: Direction; expected: number; counted: number }
export interface CompareResult {
  arrived: string[]; missing: string[]; unexpected: string[]; arrivedModelUnknown: string[];
  quantities: QuantityResult[]; totals: { arrived: number; missing: number; unexpected: number; arrivedModelUnknown: number };
}

// P-95: pieces found by the events are reported with the code as read (codeRaw), the codeId only when unknown.
const readable = (events: EventFact[]) => {
  const raw = new Map(events.filter((e) => e.codeId && e.codeRaw).map((e) => [e.codeId!, e.codeRaw!]));
  return (codeId: string) => raw.get(codeId) ?? codeId;
};

const quantityKey = (q: Pick<QuantityLine, "materialCode" | "modelId" | "direction">) =>
  `${q.modelId ?? ""}|${q.materialCode ?? ""}|${q.direction ?? ""}`;

// P-191 (D-79): the material code as normalizeBarcode reads it (src/lib/codeId.js, frozen: control characters out,
// trimmed). A copy, because this file is also bundled in the app and codeId.node.js needs Node's crypto;
// tests/documents.test.ts compares the two on spaces, dashes, lower case and control characters.
export function normalizeMaterialCode(raw: string | null | undefined): string {
  let out = "";
  for (const ch of String(raw ?? "")) {
    const c = ch.codePointAt(0) ?? 0;
    if (c <= 0x1f || c === 0x7f) continue;
    out += ch;
  }
  return out.trim();
}

// P-191 (D-79): a piece counts for a quantity line when every field the line HAS agrees with the piece: modelId
// equal, materialCode equal once normalized (a line saved by the app has the material code only, a piece read has
// both). A line with neither counts nothing. The direction (BOM) is checked by the caller.
export function quantityLineMatches(q: Pick<QuantityLine, "materialCode" | "modelId">, piece: { materialCode: string | null; modelId: string | null }): boolean {
  const code = normalizeMaterialCode(q.materialCode);
  if (!q.modelId && !code) return false;
  if (q.modelId && q.modelId !== piece.modelId) return false;
  return !code || code === normalizeMaterialCode(piece.materialCode);
}

interface QuantityPiece { key: string; code: string; materialCode: string | null; modelId: string | null; direction?: Direction }

// D-79, "a piece is counted once": only pieces that are NOT serial lines of the document reach the quantity lines
// (P-169: "quantity lines, pieces without a serial"). Pieces are taken in the order of their code as read (then
// their key), so the server and the phone give the same result; each goes to the first matching line (document
// order) that still has room, else to the first matching line. counted = the pieces of the line; the first
// `quantity` of them are absorbed (not unexpected), the ones beyond the quantity stay unexpected.
function countQuantities(quantities: QuantityLine[], pieces: QuantityPiece[]): { counted: number[]; absorbed: Set<string> } {
  const order = (a: QuantityPiece, b: QuantityPiece) => (a.code < b.code ? -1 : a.code > b.code ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const taken: string[][] = quantities.map(() => []);
  for (const p of [...pieces].sort(order)) {
    const matching = quantities.map((_, i) => i).filter((i) => (quantities[i].direction ?? null) === (p.direction ?? null) && quantityLineMatches(quantities[i], p));
    if (!matching.length) continue;
    const i = matching.find((j) => taken[j].length < quantities[j].quantity) ?? matching[0];
    taken[i].push(p.key);
  }
  return { counted: taken.map((t) => t.length), absorbed: new Set(taken.flatMap((t, i) => t.slice(0, Math.max(0, quantities[i].quantity)))) };
}

// §11.3 `ddt_in`: an arrival counts for a DDT only if the event's ddtId is that DDT, or its code is a serial line of that DDT.
// Never "every arrival at that warehouse since the upload".
function compareDdtIn(documentId: string, lines: Line[], events: EventFact[]): CompareResult {
  const serials = lines.filter((l): l is Line & { kind: "serial" } => l.kind === "serial");
  const quantities = lines.filter((l): l is Line & { kind: "quantity" } => l.kind === "quantity");
  const serialByCodeId = new Map(serials.map((s) => [s.codeId, s]));
  const linked = events.filter((e) => e.type === "arrive_at_warehouse" && (e.ddtId === documentId || (e.codeId && serialByCodeId.has(e.codeId))));
  const arrivedCodeIds = new Set<string>();
  const arrivedUnknownModel: string[] = [];
  const pieces = new Map<string, QuantityPiece>(); // the pieces arrived that are not serial lines (D-79), once each
  for (const ev of linked) {
    if (ev.codeId) arrivedCodeIds.add(ev.codeId);
    if (!ev.itemModelKnown) arrivedUnknownModel.push(ev.codeRaw ?? ev.codeId ?? "");
    if (ev.codeId && !serialByCodeId.has(ev.codeId) && !pieces.has(ev.codeId)) {
      pieces.set(ev.codeId, { key: ev.codeId, code: ev.codeRaw ?? ev.codeId, materialCode: ev.materialCode, modelId: ev.modelId });
    }
  }
  const { counted, absorbed } = countQuantities(quantities, [...pieces.values()]);
  const arrived = serials.filter((s) => arrivedCodeIds.has(s.codeId)).map((s) => s.codeRaw);
  const missing = serials.filter((s) => !arrivedCodeIds.has(s.codeId)).map((s) => s.codeRaw);
  const expectedCodeIds = new Set(serials.map((s) => s.codeId));
  const unexpected = [...arrivedCodeIds].filter((c) => !expectedCodeIds.has(c) && !absorbed.has(c)).map(readable(events));
  const quantitiesOut: QuantityResult[] = quantities.map((q, i) => ({
    key: quantityKey(q), materialCode: q.materialCode ?? null, modelId: q.modelId ?? null,
    expected: q.quantity, counted: counted[i],
  }));
  return {
    arrived, missing, unexpected, arrivedModelUnknown: arrivedUnknownModel,
    quantities: quantitiesOut,
    totals: { arrived: arrived.length, missing: missing.length, unexpected: unexpected.length, arrivedModelUnknown: arrivedUnknownModel.length },
  };
}

// §11.3 `ddt_return`: pieces of the shipment vs pieces confirmed by the client.
// Events here are return_confirm events of the shipment; lines are the shipment's lines (serial).
function compareDdtReturn(_documentId: string, lines: Line[], events: EventFact[]): CompareResult {
  const serials = lines.filter((l): l is Line & { kind: "serial" } => l.kind === "serial");
  const expected = new Set(serials.map((s) => s.codeId));
  const confirmed = new Set(events.filter((e) => e.type === "return_confirm" && e.codeId).map((e) => e.codeId!));
  const arrived = serials.filter((s) => confirmed.has(s.codeId)).map((s) => s.codeRaw);
  const missing = serials.filter((s) => !confirmed.has(s.codeId)).map((s) => s.codeRaw);
  const unexpected = [...confirmed].filter((c) => !expected.has(c)).map(readable(events));
  return { arrived, missing, unexpected, arrivedModelUnknown: [], quantities: [], totals: { arrived: arrived.length, missing: missing.length, unexpected: unexpected.length, arrivedModelUnknown: 0 } };
}

// §11.3 `bom`: removals and installations recorded at the site since the BOM date vs lines, separated by direction.
function compareBom(_documentId: string, lines: Line[], events: EventFact[]): CompareResult {
  const serials = lines.filter((l): l is Line & { kind: "serial" } => l.kind === "serial" && (l.direction === "remove" || l.direction === "install"));
  const quantities = lines.filter((l): l is Line & { kind: "quantity" } => l.kind === "quantity" && (l.direction === "remove" || l.direction === "install"));
  const serialKey = (codeId: string, dir: Direction) => `${dir}|${codeId}`;
  const expectedSerials = new Set(serials.map((s) => serialKey(s.codeId, s.direction!)));
  const got = new Map<string, EventFact[]>();
  for (const ev of events) {
    const dir: Direction | null = ev.type === "remove_at_site" ? "remove" : ev.type === "install_at_site" ? "install" : null;
    if (!dir || !ev.codeId) continue;
    const k = serialKey(ev.codeId, dir);
    if (!got.has(k)) got.set(k, []);
    got.get(k)!.push(ev);
  }
  const arrived = serials.filter((s) => got.has(serialKey(s.codeId, s.direction!))).map((s) => s.codeRaw);
  const missing = serials.filter((s) => !got.has(serialKey(s.codeId, s.direction!))).map((s) => s.codeRaw);
  const arrivedModelUnknown: string[] = [];
  for (const [k, evs] of got) if (expectedSerials.has(k)) for (const ev of evs) if (!ev.itemModelKnown && ev.codeId) arrivedModelUnknown.push(ev.codeRaw ?? ev.codeId);
  // D-79: the pieces of each direction that are not serial lines, once each (the first event of the piece).
  const pieces: QuantityPiece[] = [...got].filter(([k]) => !expectedSerials.has(k)).map(([k, evs]) => ({
    key: k, code: evs[0].codeRaw ?? evs[0].codeId!, materialCode: evs[0].materialCode, modelId: evs[0].modelId, direction: k.split("|")[0] as Direction,
  }));
  const { counted, absorbed } = countQuantities(quantities, pieces);
  const unexpected = [...got.keys()].filter((k) => !expectedSerials.has(k) && !absorbed.has(k)).map((k) => readable(events)(k.split("|")[1]));
  const quantitiesOut: QuantityResult[] = quantities.map((q, i) => ({
    key: quantityKey(q), materialCode: q.materialCode ?? null, modelId: q.modelId ?? null, direction: q.direction,
    expected: q.quantity, counted: counted[i],
  }));
  return { arrived, missing, unexpected, arrivedModelUnknown, quantities: quantitiesOut,
    totals: { arrived: arrived.length, missing: missing.length, unexpected: unexpected.length, arrivedModelUnknown: arrivedModelUnknown.length } };
}

export function compareDocument(kind: DocKind, documentId: string, lines: Line[], events: EventFact[]): CompareResult {
  if (kind === "ddt_in") return compareDdtIn(documentId, lines, events);
  if (kind === "ddt_return") return compareDdtReturn(documentId, lines, events);
  return compareBom(documentId, lines, events);
}

// §11.4 "updated with the count and the list" (P-95): the detail of a document alert, totals and the codes (at most
// ALERT_LIST_MAX of each list, so the alert stays small).
export const ALERT_LIST_MAX = 50;

// The differences that make a document alert (§11.4) and the detail it shows. P-114 n.15: with the field policy
// "accept silently" (§14, settings/fieldPolicy), pieces found at a BOM's site but not in the BOM are neither counted
// nor listed; missing pieces still are.
// P-195 (D-79, a piece is counted once): a quantity line adds only what is missing, max(0, expected - counted);
// the pieces beyond its quantity are already the unexpected ones.
export function documentAlert(r: CompareResult, opts: { silentUnexpected?: boolean } = {}) {
  const detail = alertDetail(r);
  const shown = opts.silentUnexpected ? { ...detail, unexpected: 0, unexpectedCodes: [] as string[] } : detail;
  const count = r.totals.missing + shown.unexpected + r.totals.arrivedModelUnknown + r.quantities.reduce((n, q) => n + Math.max(0, q.expected - q.counted), 0);
  return { count, detail: shown };
}
export function alertDetail(r: CompareResult) {
  return { ...r.totals, missingCodes: r.missing.slice(0, ALERT_LIST_MAX), unexpectedCodes: r.unexpected.slice(0, ALERT_LIST_MAX), modelUnknownCodes: r.arrivedModelUnknown.slice(0, ALERT_LIST_MAX) };
}
