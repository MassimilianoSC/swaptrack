// Pure helpers to build the monthly report (PDF + Excel) and the on-demand export (Excel).
// Real file formats via pdfmake and exceljs (D30 removed). Fonts: pdfmake uses PDFKit built-in Helvetica,
// so no external TTF files are needed in the Cloud Function runtime.
// pdfmake and exceljs are loaded on first use, not with the module: every function that imports this file
// (desk router, scheduled jobs) would otherwise pay about 4 s at each cold start and emulator start (D-26).
type PdfPrinterCtor = new (fonts: Record<string, Record<string, string>>) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createPdfKitDocument: (def: any) => NodeJS.ReadableStream & { end: () => void };
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfPrinter = (): PdfPrinterCtor => require("pdfmake");
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const excel = (): any => require("exceljs");
import { reportT, Lang } from "../shared/reportStrings";
import type { ReportData } from "./reportData";
import { romeDateTime } from "./reportMonth";

const HELVETICA_FONTS = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

function makePrinter() {
  return new (pdfPrinter())(HELVETICA_FONTS);
}

export interface ReportOpts {
  lang: Lang;
  scope: string;
  // Name of the ASP of the report (its own organization); the id is shown only if the name is missing.
  scopeName?: string | null;
  month: string;
  data: ReportData;
  // P-120: the end-of-month waiting numbers: taken by the monthly job (snapshot) or computed at generation.
  waitingAsOf?: { snapshot: boolean; at: Date };
}

const asOfLine = (o: ReportOpts) => (o.waitingAsOf
  ? reportT(o.lang, o.waitingAsOf.snapshot ? "report.dataAt" : "report.computedAt", { at: romeDateTime(o.waitingAsOf.at) })
  : null);

const scopeLabelOf = (o: ReportOpts) => (o.scope === "client" ? reportT(o.lang, "report.allAsps") : o.scopeName || o.scope);

// §13.4: the summary rows, in the order of the specification.
function summaryRows(o: ReportOpts): Array<[string, number]> {
  const s = o.data.summary, t = (k: string) => reportT(o.lang, k, { days: o.data.thresholdDays });
  return [
    [t("report.received"), s.received], [t("report.installed"), s.installed], [t("report.removed"), s.removed],
    [t("report.sorted"), s.sorted], [t("report.returned"), s.returned],
    [t("report.waitingNew"), s.waitingNew], [t("report.waitingRemoved"), s.waitingRemoved],
    [t("report.alertsOpened"), s.alertsOpened], [t("report.alertsClosed"), s.alertsClosed],
  ];
}

// The other sections of §13.4: title key, first column header key, rows.
const sections = (o: ReportOpts): Array<[string, string, Array<[string, number]>]> => [
  ["report.sortedByCategory", "report.category", o.data.sortedByCategory],
  ["report.topModels", "report.model", o.data.topModels],
  ["report.topSites", "report.site", o.data.topSites],
  ["report.sheet.events", "report.event.type", o.data.byType],
];

// §13.4 PDF: title, scope, month, summary, sorted per category, top models and sites, events by type.
export async function buildReportPdf(o: ReportOpts): Promise<Buffer> {
  const { lang, month } = o;
  const dateStr = new Date().toISOString().replace("T", " ").slice(0, 16);
  const head = (a: string, b: string) => [{ text: a, bold: true }, { text: b, bold: true, alignment: "right" }];
  const row = ([k, n]: [string, number]) => [k, { text: String(n), alignment: "right" }];
  const table = (first: string, second: string, rows: Array<[string, number]>) => rows.length
    ? { table: { headerRows: 1, widths: ["*", 60], body: [head(first, second), ...rows.map(row)] }, layout: "lightHorizontalLines" }
    : { text: reportT(lang, "report.none"), italics: true };
  const docDef = {
    defaultStyle: { font: "Helvetica", fontSize: 10 },
    content: [
      { text: reportT(lang, "report.title"), style: "h1" },
      { text: `${reportT(lang, "report.scope")}: ${scopeLabelOf(o)}`, margin: [0, 6, 0, 0] },
      { text: `${reportT(lang, "report.month")}: ${month}` },
      { text: `${reportT(lang, "report.generatedAt")}: ${dateStr}`, margin: [0, 0, 0, asOfLine(o) ? 0 : 10] },
      ...(asOfLine(o) ? [{ text: asOfLine(o)!, margin: [0, 0, 0, 10] }] : []),
      { text: reportT(lang, "report.summary"), style: "h2", margin: [0, 10, 0, 4] },
      table(reportT(lang, "report.indicator"), reportT(lang, "report.count"), summaryRows(o)),
      ...sections(o).flatMap(([title, first, rows]) => [
        { text: reportT(lang, title), style: "h2", margin: [0, 16, 0, 4] },
        table(reportT(lang, first), reportT(lang, title === "report.sheet.events" ? "report.count" : "report.pieces"), rows),
      ]),
    ],
    styles: { h1: { fontSize: 18, bold: true }, h2: { fontSize: 13, bold: true } },
  };
  const doc = makePrinter().createPdfKitDocument(docDef);
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

// §13.4 Excel extract of the month: the summary with every section, then the movements of the month.
export async function buildReportXlsx(o: ReportOpts): Promise<Buffer> {
  const { lang, month } = o;
  const wb = new (excel()).Workbook();
  wb.creator = "SwapTrack";
  wb.created = new Date();
  const sum = wb.addWorksheet(reportT(lang, "report.sheet.summary"));
  sum.columns = [
    { header: reportT(lang, "report.indicator"), key: "k", width: 70 },
    { header: reportT(lang, "report.count"), key: "n", width: 12 },
  ];
  sum.getRow(1).font = { bold: true };
  sum.addRow({ k: reportT(lang, "report.scope"), n: scopeLabelOf(o) });
  sum.addRow({ k: reportT(lang, "report.month"), n: month });
  if (asOfLine(o)) sum.addRow({ k: asOfLine(o)! });
  for (const [k, n] of summaryRows(o)) sum.addRow({ k, n });
  for (const [title, , rows] of sections(o)) {
    sum.addRow({});
    sum.addRow({ k: reportT(lang, title) }).font = { bold: true };
    if (!rows.length) sum.addRow({ k: reportT(lang, "report.none") });
    for (const [k, n] of rows) sum.addRow({ k, n });
  }
  const mov = wb.addWorksheet(reportT(lang, "report.sheet.movements"));
  mov.columns = [
    { header: reportT(lang, "report.mov.date"), key: "date", width: 18 },
    { header: reportT(lang, "report.event.type"), key: "type", width: 30 },
    { header: reportT(lang, "report.mov.code"), key: "code", width: 26 },
    { header: reportT(lang, "report.model"), key: "model", width: 22 },
    { header: reportT(lang, "report.mov.location"), key: "location", width: 30 },
    { header: reportT(lang, "report.mov.asp"), key: "asp", width: 18 },
  ];
  mov.getRow(1).font = { bold: true };
  for (const r of o.data.movements) mov.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// §13.3 Excel export: one sheet with the pieces, in the user's language (rows from reportData.exportRow).
export async function buildExportXlsx(opts: { lang: Lang; rows: Array<Record<string, string | number | null>> }): Promise<Buffer> {
  const { lang, rows } = opts;
  const h = (k: string) => reportT(lang, `exports.header.${k}`);
  const wb = new (excel()).Workbook();
  wb.creator = "SwapTrack";
  wb.created = new Date();
  const ws = wb.addWorksheet(reportT(lang, "exports.sheet.items"));
  ws.columns = [
    { header: h("code"), key: "code", width: 26 },
    { header: h("status"), key: "status", width: 20 },
    { header: h("flow"), key: "flow", width: 12 },
    { header: h("model"), key: "model", width: 20 },
    { header: h("materialCode"), key: "materialCode", width: 18 },
    { header: h("manufacturer"), key: "manufacturer", width: 18 },
    { header: h("equipmentType"), key: "equipmentType", width: 20 },
    { header: h("location"), key: "location", width: 30 },
    { header: h("asp"), key: "asp", width: 18 },
    { header: h("sortingCategory"), key: "sortingCategory", width: 22 },
    { header: h("lastScanned"), key: "lastScanned", width: 18 },
    { header: h("id"), key: "id", width: 24 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

