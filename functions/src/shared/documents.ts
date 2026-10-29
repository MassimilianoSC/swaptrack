// Document comparison (SPEC §11.3). Pure function. Unit-tested.
// Three kinds (§11.1): ddt_in, ddt_return, bom. Lines are either serial lines or quantity lines.

export type Direction = "remove" | "install";
export type DocKind = "ddt_in" | "ddt_return" | "bom";

export interface SerialLine { codeRaw: string; codeId: string; materialCode?: string | null; modelId?: string | null; direction?: Direction }
export interface QuantityLine { materialCode?: string | null; modelId?: string | null; quantity: number; direction?: Direction }
export type Line = ({ kind: "serial" } & SerialLine) | ({ kind: "quantity" } & QuantityLine);

export interface EventFact {
  type: string; codeId: string | null; materialCode: string | null; modelId: string | null;
  itemModelKnown: boolean; ddtId?: string | null; aspId?: string | null; locationId?: string | null; direction?: Direction;
}

export interface QuantityResult { key: string; materialCode?: string | null; modelId?: string | null; direction?: Direction; expected: number; counted: number }
export interface CompareResult {
  arrived: string[]; missing: string[]; unexpected: string[]; arrivedModelUnknown: string[];
  quantities: QuantityResult[]; totals: { arrived: number; missing: number; unexpected: number; arrivedModelUnknown: number };
}

const quantityKey = (q: Pick<QuantityLine, "materialCode" | "modelId" | "direction">) =>
  `${q.modelId ?? ""}|${q.materialCode ?? ""}|${q.direction ?? ""}`;

// §11.3 `ddt_in`: an arrival counts for a DDT only if the event's ddtId is that DDT, or its code is a serial line of that DDT.
// Never "every arrival at that warehouse since the upload".
function compareDdtIn(documentId: string, lines: Line[], events: EventFact[]): CompareResult {
  const serials = lines.filter((l): l is Line & { kind: "serial" } => l.kind === "serial");
  const quantities = lines.filter((l): l is Line & { kind: "quantity" } => l.kind === "quantity");
  const serialByCodeId = new Map(serials.map((s) => [s.codeId, s]));
  const linked = events.filter((e) => e.type === "arrive_at_warehouse" && (e.ddtId === documentId || (e.codeId && serialByCodeId.has(e.codeId))));
  const arrivedCodeIds = new Set<string>();
  const arrivedUnknownModel: string[] = [];
  const arrivedByQuantityKey = new Map<string, number>();
  for (const ev of linked) {
    if (ev.codeId) arrivedCodeIds.add(ev.codeId);
    if (!ev.itemModelKnown) arrivedUnknownModel.push(ev.codeId ?? "");
    const qk = quantityKey({ materialCode: ev.materialCode, modelId: ev.modelId });
    arrivedByQuantityKey.set(qk, (arrivedByQuantityKey.get(qk) ?? 0) + 1);
  }
  const arrived = serials.filter((s) => arrivedCodeIds.has(s.codeId)).map((s) => s.codeRaw);
  const missing = serials.filter((s) => !arrivedCodeIds.has(s.codeId)).map((s) => s.codeRaw);
  const expectedCodeIds = new Set(serials.map((s) => s.codeId));
  const unexpected = [...arrivedCodeIds].filter((c) => !expectedCodeIds.has(c));
  const quantitiesOut: QuantityResult[] = quantities.map((q) => ({
    key: quantityKey(q), materialCode: q.materialCode ?? null, modelId: q.modelId ?? null,
    expected: q.quantity, counted: arrivedByQuantityKey.get(quantityKey(q)) ?? 0,
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
  const unexpected = [...confirmed].filter((c) => !expected.has(c));
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
  const unexpected = [...got.keys()].filter((k) => !expectedSerials.has(k)).map((k) => k.split("|")[1]);
  const arrivedModelUnknown: string[] = [];
  for (const [k, evs] of got) if (expectedSerials.has(k)) for (const ev of evs) if (!ev.itemModelKnown && ev.codeId) arrivedModelUnknown.push(ev.codeId);
  const seenByKey = new Map<string, number>();
  for (const [k, evs] of got) {
    const dir = k.split("|")[0] as Direction;
    for (const ev of evs) {
      const qk = quantityKey({ materialCode: ev.materialCode, modelId: ev.modelId, direction: dir });
      seenByKey.set(qk, (seenByKey.get(qk) ?? 0) + 1);
    }
  }
  const quantitiesOut: QuantityResult[] = quantities.map((q) => ({
    key: quantityKey(q), materialCode: q.materialCode ?? null, modelId: q.modelId ?? null, direction: q.direction,
    expected: q.quantity, counted: seenByKey.get(quantityKey(q)) ?? 0,
  }));
  return { arrived, missing, unexpected, arrivedModelUnknown, quantities: quantitiesOut,
    totals: { arrived: arrived.length, missing: missing.length, unexpected: unexpected.length, arrivedModelUnknown: arrivedModelUnknown.length } };
}

export function compareDocument(kind: DocKind, documentId: string, lines: Line[], events: EventFact[]): CompareResult {
  if (kind === "ddt_in") return compareDdtIn(documentId, lines, events);
  if (kind === "ddt_return") return compareDdtReturn(documentId, lines, events);
  return compareBom(documentId, lines, events);
}
