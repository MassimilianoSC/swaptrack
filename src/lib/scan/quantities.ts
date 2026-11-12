// P-188: the quantity lines of the BOM of a site and of the DDT of an arrival, as "Scan" shows them: expected and
// counted. Counted with the server's own comparison (SPEC §11.3, functions/src/shared/documents.ts, P-191), on this
// phone's readings, so the phone and the alert never disagree on the rule.
import { compareDocument, type DocKind, type Direction, type EventFact, type Line } from "@shared/documents";

// A reading of this phone with the model it gives: picked, read as a product code, or known from the phone's copy.
export interface QtyReading { type: string; codeId: string; codeRaw: string; modelId: string | null; materialCode: string | null; ddtId?: string | null }
export interface QtyRow { key: string; modelId: string | null; materialCode: string | null; expected: number; counted: number }

type RawLine = { kind?: string; codeRaw?: string; codeId?: string; materialCode?: string | null; modelId?: string | null; quantity?: number; direction?: string };

// lines: the document's lines as saved; serial lines must carry their codeId (computed by the caller when missing).
// direction: the BOM's direction shown ("remove" | "install"); none for a DDT.
// D-79: with quantity lines, the pieces not expected are the comparison's too (a piece a quantity line takes, up to its
// quantity, is not "not expected"); unexpected is null when the document has no quantity line (the screen's own list).
export function quantityRows(kind: DocKind, documentId: string, lines: RawLine[], readings: QtyReading[], direction?: Direction): { rows: QtyRow[]; unexpected: string[] | null } {
  const shown = lines.filter((l) => !direction || l.direction === direction);
  if (!shown.some((l) => l.kind === "quantity")) return { rows: [], unexpected: null };
  const docLines: Line[] = shown.flatMap((l): Line[] => {
    if (l.kind === "serial" && l.codeRaw && l.codeId) return [{ kind: "serial", codeRaw: l.codeRaw, codeId: l.codeId, materialCode: l.materialCode ?? null, modelId: l.modelId ?? null, ...(direction ? { direction } : {}) }];
    if (l.kind === "quantity" && typeof l.quantity === "number") return [{ kind: "quantity", quantity: l.quantity, materialCode: l.materialCode ?? null, modelId: l.modelId ?? null, ...(direction ? { direction } : {}) }];
    return [];
  });
  const facts: EventFact[] = readings.map((r) => ({
    type: r.type, codeId: r.codeId, codeRaw: r.codeRaw, materialCode: r.materialCode, modelId: r.modelId,
    itemModelKnown: !!(r.modelId || r.materialCode), ddtId: r.ddtId ?? null,
  }));
  const r = compareDocument(kind, documentId, docLines, facts);
  return {
    rows: r.quantities.map((q, i) => ({ key: `${q.key}#${i}`, modelId: q.modelId ?? null, materialCode: q.materialCode ?? null, expected: q.expected, counted: q.counted })),
    unexpected: r.unexpected,
  };
}
