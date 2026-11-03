// Document lines (§11.2) as the pages edit them: text in boxes, one line per row, and lines read from an Excel sheet
// through a column mapping. Pure: the same lines reach saveDocument whether typed, pasted, read from a file or, later,
// proposed by the automatic reading (extract.ts); they are always confirmed by the user before saving.
import type { Sheet } from "@/lib/import/readTable";

export type Direction = "remove" | "install";
export type DocLine =
  | { kind: "serial"; codeRaw: string; materialCode?: string | null; modelId?: string | null; direction?: Direction }
  | { kind: "quantity"; quantity: number; materialCode: string | null; modelId?: string | null; direction?: Direction };

// The boxes show serial, material code and quantity, not the model a line may carry (modelId, set by the server or
// an import). Saving the document again keeps it on the lines that are still there (censimento n.38).
const lineKey = (l: DocLine) => (l.kind === "serial" ? `s:${l.codeRaw}` : `q:${l.materialCode ?? ""}`);
export function carryModels(lines: DocLine[], before: DocLine[]): DocLine[] {
  const models = new Map(before.filter((l) => l.modelId).map((l) => [lineKey(l), l.modelId!]));
  return lines.map((l) => (l.modelId || !models.has(lineKey(l)) ? l : { ...l, modelId: models.get(lineKey(l)) }));
}

// One row of a box: "SERIAL", "SERIAL MATERIALCODE" or a quantity "#3 MATERIALCODE". A "[remove]" / "[install]"
// typed by hand is ignored: the direction comes from the box (P-92).
export function parseLines(text: string, direction?: Direction): DocLine[] {
  return text.split("\n").map((s) => s.replace(/\s*\[(remove|install)\]\s*$/, "").trim()).filter(Boolean).map((s): DocLine => {
    const q = s.match(/^#(\d+)(?:\s+(\S+))?$/);
    if (q) return { kind: "quantity", quantity: Number(q[1]), materialCode: q[2] ?? null, direction };
    const m = s.match(/^(\S+)\s+(\S+)$/);
    return m ? { kind: "serial", codeRaw: m[1], materialCode: m[2], direction } : { kind: "serial", codeRaw: s, direction };
  });
}

export const linesToText = (lines: DocLine[]): string => lines.map((l) => l.kind === "serial"
  ? `${l.codeRaw}${l.materialCode ? ` ${l.materialCode}` : ""}`
  : `#${l.quantity}${l.materialCode ? ` ${l.materialCode}` : ""}`).join("\n");

// The lines of a BOM split by direction, for its boxes; lines without direction (saved before P-92) apart.
export const splitByDirection = (lines: DocLine[]) => ({
  remove: linesToText(lines.filter((l) => l.direction === "remove")),
  install: linesToText(lines.filter((l) => l.direction === "install")),
  none: linesToText(lines.filter((l) => !l.direction)),
});

// Column mapping of an Excel/CSV document (documentMappings/{kind}_{scope}): which column holds which field.
// direction is a column, or "*remove" / "*install" for "every line"; removeValue / installValue are the cell texts
// that mean remove and install in that column.
export interface LineMapping { serial?: string; materialCode?: string; quantity?: string; direction?: string; removeValue?: string; installValue?: string }
export const ALL_REMOVE = "*remove";
export const ALL_INSTALL = "*install";

// Rows -> lines. A row with a serial is a serial line; otherwise a material code with a positive quantity is a
// quantity line; anything else is skipped (counted, so the page can say how many rows were not read).
export function linesFromSheet(sheet: Sheet, map: LineMapping, withDirection: boolean): { lines: DocLine[]; skipped: number } {
  const col = (h?: string) => (h ? sheet.headers.indexOf(h) : -1);
  const iSerial = col(map.serial), iMat = col(map.materialCode), iQty = col(map.quantity), iDir = col(map.direction);
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const norm = (s: string) => s.trim().toLowerCase();
  const directionOf = (r: string[]): Direction | undefined => {
    if (!withDirection) return undefined;
    if (map.direction === ALL_REMOVE) return "remove";
    if (map.direction === ALL_INSTALL) return "install";
    const v = norm(cell(r, iDir));
    if (v && map.removeValue && v === norm(map.removeValue)) return "remove";
    if (v && map.installValue && v === norm(map.installValue)) return "install";
    return undefined;
  };
  const lines: DocLine[] = [];
  let skipped = 0;
  for (const r of sheet.rows) {
    if (r.every((c) => !(c ?? "").trim())) continue;
    const serial = cell(r, iSerial), mat = cell(r, iMat), qty = Number(cell(r, iQty).replace(",", "."));
    const direction = directionOf(r);
    if (serial) lines.push({ kind: "serial", codeRaw: serial.replace(/\s+/g, ""), materialCode: mat ? mat.replace(/\s+/g, "") : null, direction });
    else if (mat && Number.isInteger(qty) && qty > 0) lines.push({ kind: "quantity", quantity: qty, materialCode: mat.replace(/\s+/g, ""), direction });
    else skipped++;
  }
  return { lines, skipped };
}

// The distinct values of a column (for choosing which one means remove and which install).
export const distinctValues = (sheet: Sheet, header?: string, max = 20): string[] => {
  const i = header ? sheet.headers.indexOf(header) : -1;
  if (i < 0) return [];
  return [...new Set(sheet.rows.map((r) => (r[i] ?? "").trim()).filter(Boolean))].slice(0, max);
};
