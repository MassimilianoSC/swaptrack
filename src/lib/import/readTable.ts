// Reads Excel (exceljs, R1) or CSV files into rows of strings for the import wizard (§5, §6.1).
export interface Sheet { headers: string[]; rows: string[][] }

// P-171: why an Excel could not be read. "load": the part of the app that reads Excel files did not arrive (it is loaded
// only when needed: an app left open across a new version may ask for a part that is no longer there); "file": the file
// itself could not be read (not a real .xlsx, protected, damaged).
export class TableReadError extends Error {
  constructor(readonly kind: "load" | "file") { super(`table_${kind}`); }
}
async function excelJs() {
  try { return (await import("exceljs")).default; } catch { /* once more: a network that came back */ }
  try { return (await import("exceljs")).default; } catch { throw new TableReadError("load"); }
}

export async function readTable(file: File): Promise<Sheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(await file.text());
  const ExcelJS = await excelJs();
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(await file.arrayBuffer()); } catch { throw new TableReadError("file"); }
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const all: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as unknown[]).slice(1).map(cellText);
    all.push(values);
  });
  const [headers = [], ...rows] = all;
  return { headers: headers.map((h) => h.trim()), rows };
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v).trim();
}

// RFC 4180 CSV; delimiter auto-detected between ";" and ",".
export function parseCsv(text: string): Sheet {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) out.push(row.map((x) => x.trim()));
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) out.push(row.map((x) => x.trim()));
  const [headers = [], ...rows] = out;
  return { headers, rows };
}
