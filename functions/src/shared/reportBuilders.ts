// Pure helpers to build the monthly report (PDF + Excel) and the on-demand export (Excel).
// Real file formats via pdfmake and exceljs (D30 removed). Fonts: pdfmake uses PDFKit built-in Helvetica,
// so no external TTF files are needed in the Cloud Function runtime.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require("pdfmake") as new (fonts: Record<string, Record<string, string>>) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createPdfKitDocument: (def: any) => NodeJS.ReadableStream & { end: () => void };
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExcelJS = require("exceljs");
import { reportT, Lang } from "../shared/reportStrings";

const HELVETICA_FONTS = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

function makePrinter() {
  return new PdfPrinter(HELVETICA_FONTS);
}

export interface ReportSummary {
  received: number;
  installed: number;
  removed: number;
  sorted: number;
  returned: number;
}

// §13.4 PDF: title, scope, month, summary table, one row per event type.
export async function buildReportPdf(opts: {
  lang: Lang;
  scope: string;
  month: string;
  summary: ReportSummary;
  byType: Array<[string, number]>;
}): Promise<Buffer> {
  const { lang, scope, month, summary, byType } = opts;
  const scopeLabel = scope === "client" ? reportT(lang, "report.allAsps") : scope;
  const now = new Date();
  const dateStr = now.toISOString().replace("T", " ").slice(0, 16);
  const indicator = reportT(lang, "report.indicator");
  const count = reportT(lang, "report.count");
  const docDef = {
    defaultStyle: { font: "Helvetica", fontSize: 10 },
    content: [
      { text: reportT(lang, "report.title"), style: "h1" },
      { text: `${reportT(lang, "report.scope")}: ${scopeLabel}`, margin: [0, 6, 0, 0] },
      { text: `${reportT(lang, "report.month")}: ${month}` },
      { text: `${reportT(lang, "report.generatedAt")}: ${dateStr}`, margin: [0, 0, 0, 10] },
      { text: reportT(lang, "report.summary"), style: "h2", margin: [0, 10, 0, 4] },
      {
        table: {
          headerRows: 1,
          widths: ["*", 60],
          body: [
            [{ text: indicator, bold: true }, { text: count, bold: true, alignment: "right" }],
            [reportT(lang, "report.received"), { text: String(summary.received), alignment: "right" }],
            [reportT(lang, "report.installed"), { text: String(summary.installed), alignment: "right" }],
            [reportT(lang, "report.removed"), { text: String(summary.removed), alignment: "right" }],
            [reportT(lang, "report.sorted"), { text: String(summary.sorted), alignment: "right" }],
            [reportT(lang, "report.returned"), { text: String(summary.returned), alignment: "right" }],
          ],
        },
        layout: "lightHorizontalLines",
      },
      { text: reportT(lang, "report.sheet.events"), style: "h2", margin: [0, 16, 0, 4] },
      {
        table: {
          headerRows: 1,
          widths: ["*", 60],
          body: [
            [
              { text: reportT(lang, "report.event.type"), bold: true },
              { text: count, bold: true, alignment: "right" },
            ],
            ...byType.map(([t, n]) => [t, { text: String(n), alignment: "right" } as unknown as string]),
          ],
        },
        layout: "lightHorizontalLines",
      },
    ],
    styles: {
      h1: { fontSize: 18, bold: true },
      h2: { fontSize: 13, bold: true },
    },
  };
  const printer = makePrinter();
  const doc = printer.createPdfKitDocument(docDef);
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

// §13.4 Excel: two sheets — summary and events by type.
export async function buildReportXlsx(opts: {
  lang: Lang;
  scope: string;
  month: string;
  summary: ReportSummary;
  byType: Array<[string, number]>;
}): Promise<Buffer> {
  const { lang, scope, month, summary, byType } = opts;
  const scopeLabel = scope === "client" ? reportT(lang, "report.allAsps") : scope;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wb = new (ExcelJS as any).Workbook();
  wb.creator = "SwapTrack";
  wb.created = new Date();
  const sum = wb.addWorksheet(reportT(lang, "report.sheet.summary"));
  sum.columns = [
    { header: reportT(lang, "report.indicator"), key: "k", width: 40 },
    { header: reportT(lang, "report.count"), key: "n", width: 12 },
  ];
  sum.getRow(1).font = { bold: true };
  sum.addRow({ k: reportT(lang, "report.scope"), n: scopeLabel });
  sum.addRow({ k: reportT(lang, "report.month"), n: month });
  sum.addRow({ k: reportT(lang, "report.received"), n: summary.received });
  sum.addRow({ k: reportT(lang, "report.installed"), n: summary.installed });
  sum.addRow({ k: reportT(lang, "report.removed"), n: summary.removed });
  sum.addRow({ k: reportT(lang, "report.sorted"), n: summary.sorted });
  sum.addRow({ k: reportT(lang, "report.returned"), n: summary.returned });
  const ev = wb.addWorksheet(reportT(lang, "report.sheet.events"));
  ev.columns = [
    { header: reportT(lang, "report.event.type"), key: "t", width: 36 },
    { header: reportT(lang, "report.count"), key: "n", width: 12 },
  ];
  ev.getRow(1).font = { bold: true };
  for (const [t, n] of byType) ev.addRow({ t, n });
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// §13.3 Excel export: one sheet with all items in scope.
export async function buildExportXlsx(opts: {
  lang: Lang;
  rows: Array<Record<string, string | number | null>>;
}): Promise<Buffer> {
  const { lang, rows } = opts;
  const h = (k: string) => reportT(lang, `exports.header.${k}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wb = new (ExcelJS as any).Workbook();
  wb.creator = "SwapTrack";
  wb.created = new Date();
  const ws = wb.addWorksheet(reportT(lang, "exports.sheet.items"));
  ws.columns = [
    { header: h("id"), key: "id", width: 24 },
    { header: h("status"), key: "status", width: 16 },
    { header: h("flow"), key: "flow", width: 12 },
    { header: h("model"), key: "model", width: 20 },
    { header: h("materialCode"), key: "materialCode", width: 18 },
    { header: h("manufacturer"), key: "manufacturer", width: 18 },
    { header: h("equipmentType"), key: "equipmentType", width: 20 },
    { header: h("location"), key: "location", width: 20 },
    { header: h("asp"), key: "asp", width: 16 },
    { header: h("sortingCategory"), key: "sortingCategory", width: 18 },
    { header: h("lastScanned"), key: "lastScanned", width: 22 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
