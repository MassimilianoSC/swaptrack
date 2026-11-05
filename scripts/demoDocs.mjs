// P-124: invented documents for the demo and for tuning the automatic reading (D-45, D-49), consistent with the seed:
// the warehouse and a site of ASP Nord, the material codes of the seed catalog, NEW serials ("TD26..."): saving the DDT
// creates the expected pieces, reading the labels shows arrived / missing / unexpected.
//   node scripts/demoDocs.mjs        -> demo-docs/ (git-ignored), then checks what it wrote
// Needs only what the project already has: Chromium of Playwright (PDF and pictures), exceljs, zxing-wasm (barcodes,
// written and read back offline). Every document says "DOCUMENTO DI PROVA". Invented data only.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";
import ExcelJS from "exceljs";
import { prepareZXingModule, writeBarcode, readBarcodes } from "zxing-wasm/full";
import { ORGS, CLIENT_WAREHOUSE, aspWarehouses, site, seedModels } from "./seedCatalog.mjs";

const OUT = fileURLToPath(new URL("../demo-docs/", import.meta.url));
const require = createRequire(import.meta.url);
const TEST_MARK = "DOCUMENTO DI PROVA";

// ---- Data, from the seed ----
const MODELS = seedModels();
const CLIENT = ORGS.find((o) => o.type === "client");
const NORD = ORGS.find((o) => o.slug === "nord");
const WAREHOUSE = aspWarehouses().find((w) => w.code === "MAG-NORD-01");
// A Nord site without a seeded BOM (the full seed puts Nord's BOMs at sites 1, 10, 19 and 28; the e2e tests use 1 and 7).
const SITE = site(13);
if (SITE.aspId !== NORD.id) throw new Error("site 13 is not a Nord site any more: choose another one");
const DATE = "04/11/2026";
const KIND_IT = { "Radio unit": "Unità radio", Baseband: "Unità banda base", "Power supply": "Alimentatore", "Transmission card": "Scheda di trasmissione", "Antenna module": "Modulo d'antenna" };
const describe = (m) => `${KIND_IT[m.equipmentType]} ${m.model} - ${m.manufacturer}`;

const serialLine = (code, m) => ({ serial: code, materialCode: m.materialCode, description: describe(m), quantity: 1 });
const quantityLine = (m, quantity) => ({ serial: "", materialCode: m.materialCode, description: describe(m), quantity });
const DDT = [
  { number: "TD-2026-0412", lines: [...Array.from({ length: 8 }, (_, i) => serialLine(`TD260412${String(i + 1).padStart(3, "0")}`, MODELS[i])), quantityLine(MODELS[10], 3), quantityLine(MODELS[15], 2)] },
  { number: "TD-2026-0413", lines: [...Array.from({ length: 44 }, (_, i) => serialLine(`TD260413${String(i + 1).padStart(3, "0")}`, MODELS[i % 20])), quantityLine(MODELS[12], 4), quantityLine(MODELS[17], 6)] },
];
const BOM = [
  ...Array.from({ length: 5 }, (_, i) => ({ op: "SMONTARE", model: MODELS[i], ...serialLine(`TD26R13${String(i + 1).padStart(3, "0")}`, MODELS[i]) })),
  ...Array.from({ length: 4 }, (_, i) => ({ op: "INSTALLARE", model: MODELS[i + 5], ...serialLine(`TD26I13${String(i + 1).padStart(3, "0")}`, MODELS[i + 5]) })),
  { op: "INSTALLARE", ...quantityLine(MODELS[11], 2) },
];
// Labels: three clean ones of DDT 0412, two damaged ones of the same DDT, one piece that is not in it ("unexpected").
const LABELS = [
  { file: "etichetta-1-pulita-TD260412001.png", serial: "TD260412001", model: MODELS[0], damage: null },
  { file: "etichetta-2-pulita-TD260412002.png", serial: "TD260412002", model: MODELS[1], damage: null },
  { file: "etichetta-3-pulita-TD260412003.png", serial: "TD260412003", model: MODELS[2], damage: null },
  { file: "etichetta-4-sfocata-TD260412004.jpg", serial: "TD260412004", model: MODELS[3], damage: "blur" },
  { file: "etichetta-5-strappata-TD260412005.jpg", serial: "TD260412005", model: MODELS[4], damage: "torn" },
  { file: "etichetta-6-fuori-DDT-TD260499001.png", serial: "TD260499001", model: MODELS[6], damage: null },
];
// The serials of the BOM of the site, all clean: the pieces to remove at the site and the new ones to install.
const BOM_LABELS = BOM.filter((l) => l.serial).map((l, i) => ({
  file: `etichetta-bom-${i + 1}-${l.op.toLowerCase()}-${l.serial}.png`, serial: l.serial, model: l.model, damage: null, op: l.op,
}));
// All the labels on A4 at real size, to print (at 100%) and read with the phone camera.
const PRINT_PDF = "etichette-da-stampare.pdf";
const LABEL_MM = { width: 70, height: 35 };
const DAMAGE_IT = { blur: "sfocata, non si legge", torn: "strappata, non si legge" };

// ---- HTML ----
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function ddtHtml(ddt) {
  const rows = ddt.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.materialCode)}</td><td>${esc(l.description)}</td><td class="mono">${esc(l.serial)}</td><td class="num">${l.quantity}</td><td>PZ</td></tr>`).join("");
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { font: 10pt Arial, Helvetica, sans-serif; color: #111; margin: 0 3px; } /* 3px: the right borders stay inside the printed area */
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 6px; }
    .brand { font-size: 20pt; font-weight: bold; letter-spacing: .5px; }
    .brand small { display: block; font-size: 8.5pt; font-weight: normal; color: #333; }
    .title { text-align: right; } .title b { font-size: 13pt; display: block; }
    .test { color: #888; font-size: 7pt; letter-spacing: 1px; }
    .boxes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 8px 0; }
    .box { border: 1px solid #555; padding: 4px 6px; min-height: 44px; } .box h4 { margin: 0 0 2px; font-size: 7.5pt; text-transform: uppercase; color: #444; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; } thead { display: table-header-group; }
    th, td { border: 1px solid #777; padding: 3px 5px; text-align: left; font-size: 9pt; } th { background: #e8e8e8; font-size: 8pt; }
    tr { page-break-inside: avoid; } .num { text-align: right; } .mono { font-family: "Courier New", monospace; font-weight: bold; color: #000; }
    .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; page-break-inside: avoid; }
    .sign div { border-top: 1px solid #555; padding-top: 3px; font-size: 8pt; height: 36px; }
  </style></head><body>
    <div class="head">
      <div class="brand">${esc(CLIENT.name)}<small>${esc(CLIENT_WAREHOUSE.name)} · ${esc(CLIENT_WAREHOUSE.address)}</small></div>
      <div class="title"><b>DOCUMENTO DI TRASPORTO</b>D.d.T. (D.P.R. 472/1996)<div class="test">${TEST_MARK}</div></div>
    </div>
    <div class="boxes">
      <div class="box"><h4>Destinatario</h4>${esc(NORD.name)}</div>
      <div class="box"><h4>Luogo di destinazione</h4>${esc(WAREHOUSE.name)} (${esc(WAREHOUSE.code)})<br>${esc(WAREHOUSE.address)} · ${esc(WAREHOUSE.region)}</div>
    </div>
    <div class="meta">
      <div class="box"><h4>Numero</h4><b>${esc(ddt.number)}</b></div>
      <div class="box"><h4>Data</h4>${DATE}</div>
      <div class="box"><h4>Causale</h4>Materiale per swap di rete</div>
      <div class="box"><h4>Trasporto a cura</h4>Mittente</div>
    </div>
    <table><thead><tr><th>Pos.</th><th>Cod. articolo</th><th>Descrizione</th><th>N. serie</th><th>Q.tà</th><th>UM</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="meta" style="margin-top:8px"><div class="box"><h4>Aspetto dei beni</h4>Scatole</div><div class="box"><h4>N. colli</h4>${Math.ceil(ddt.lines.length / 4)}</div><div class="box"><h4>Peso kg</h4>${ddt.lines.length * 6}</div><div class="box"><h4>Inizio trasporto</h4>${DATE} 08:30</div></div>
    <div class="sign"><div>Firma mittente</div><div>Firma vettore</div><div>Firma destinatario</div></div>
  </body></html>`;
}
// The BOM of the site as a printed list, for the automatic reading (the Excel is for the column choice). Same look as
// the DDT: its style block is reused.
function bomHtml() {
  const ddt = ddtHtml(DDT[0]);
  const style = ddt.slice(ddt.indexOf("<style>"), ddt.indexOf("</style>") + "</style>".length);
  const rows = BOM.map((l, i) => `<tr><td>${i + 1}</td><td><b>${esc(l.op)}</b></td><td>${esc(l.materialCode)}</td><td>${esc(l.description)}</td><td class="mono">${esc(l.serial)}</td><td class="num">${l.quantity}</td></tr>`).join("");
  const count = (op) => BOM.filter((l) => l.op === op).length;
  return `<!doctype html><html lang="it"><head><meta charset="utf-8">${style}</head><body>
    <div class="head">
      <div class="brand">${esc(CLIENT.name)}<small>Pianificazione swap di rete</small></div>
      <div class="title"><b>LISTA MATERIALI DEL SITO (BOM)</b>Rif. BOM-${esc(SITE.code)}-01<div class="test">${TEST_MARK}</div></div>
    </div>
    <div class="boxes">
      <div class="box"><h4>Sito</h4>${esc(SITE.code)} · ${esc(SITE.name)}<br>${esc(SITE.address)} · ${esc(SITE.region)}</div>
      <div class="box"><h4>Ditta installatrice</h4>${esc(NORD.name)}</div>
    </div>
    <div class="meta"><div class="box"><h4>Data</h4>${DATE}</div><div class="box"><h4>Da smontare</h4>${count("SMONTARE")} righe</div><div class="box"><h4>Da installare</h4>${count("INSTALLARE")} righe</div><div class="box"><h4>Revisione</h4>1</div></div>
    <table><thead><tr><th>Pos.</th><th>Operazione</th><th>Cod. articolo</th><th>Descrizione</th><th>N. serie</th><th>Q.tà</th></tr></thead><tbody>${rows}</tbody></table>
  </body></html>`;
}
const FOOTER = `<div style="font: 7pt Arial, sans-serif; color: #777; width: 100%; padding: 0 12mm; display: flex; justify-content: space-between;"><span>${TEST_MARK} · dati inventati</span><span>Pagina <span class="pageNumber"></span> di <span class="totalPages"></span></span></div>`;

// Code 128 as vector bars (the quiet zone is in the SVG): sharp in the pictures and on paper.
async function barcodeSvg(serial) {
  const bar = await writeBarcode(serial, { format: "Code128" });
  if (bar.error) throw new Error(bar.error);
  const svg = bar.svg.slice(bar.svg.indexOf("<svg")).replace(/<svg width="(\d+)" height="(\d+)"/, '<svg viewBox="0 0 $1 $2" preserveAspectRatio="none" shape-rendering="crispEdges"');
  if (!svg.includes("viewBox")) throw new Error(`unexpected SVG for ${serial}`);
  return svg;
}
const LABEL_CSS = `
    .label { position: relative; width: 600px; padding: 18px 22px 14px; background: #fbfbf7; border-radius: 6px; font-family: Arial, Helvetica, sans-serif; color: #111; }
    .shadow { box-shadow: 0 3px 10px rgba(0,0,0,.45); }
    .top { display: flex; justify-content: space-between; font-size: 15px; } .brand { font-weight: bold; font-size: 20px; }
    .bar { width: 556px; height: 120px; margin: 10px 0 4px; } .bar svg { display: block; width: 100%; height: 100%; }
    .sn { font: bold 26px "Courier New", monospace; letter-spacing: 3px; text-align: center; }
    .test { position: absolute; right: 10px; bottom: 4px; font-size: 9px; color: #999; letter-spacing: 1px; }
    .tear { position: absolute; left: 150px; top: 58px; width: 80px; height: 128px; background: linear-gradient(100deg, transparent 0 20%, #d9d6cc 22% 80%, transparent 82%);
      transform: rotate(12deg); box-shadow: inset 0 0 6px rgba(0,0,0,.25); }
    .smudge { position: absolute; left: 393px; top: 190px; width: 30px; height: 34px; border-radius: 50%; background: rgba(90,80,60,.55); filter: blur(3px); }`;
const DAMAGE_STYLE = { blur: "filter: blur(2.6px) contrast(.8); transform: rotate(-4deg);", torn: "transform: rotate(1.5deg);" };
const labelDiv = (l, svg, extraClass = "") => `<div class="label ${extraClass}" style="${DAMAGE_STYLE[l.damage] ?? ""}">
    <div class="top"><span class="brand">${esc(l.model.manufacturer)}</span><span>${esc(KIND_IT[l.model.equipmentType])} ${esc(l.model.model)}</span></div>
    <div class="top"><span>P/N ${esc(l.model.materialCode)}</span><span>Made in EU</span></div>
    <div class="bar">${svg}</div>
    <div class="sn">S/N ${esc(l.serial)}</div>
    ${l.damage === "torn" ? '<div class="tear"></div><div class="smudge"></div>' : ""}
    <div class="test">${TEST_MARK}</div>
  </div>`;
// The label photographed on a grey device.
const labelHtml = (l, svg) => `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; width: 760px; height: 420px; display: flex; align-items: center; justify-content: center;
      background: radial-gradient(circle at 30% 30%, #8d949b, #4b5157); }${LABEL_CSS}
  </style></head><body>${labelDiv(l, svg, "shadow")}</body></html>`;
// The sheet to print: each label in a 70 x 35 mm box with a dashed cutting line, its name below it.
function printHtml(groups) {
  const zoom = ((LABEL_MM.width - 4) * 96 / 25.4 / 644).toFixed(3); // 644 px = the label with its padding; 2 mm free each side
  const cell = ({ l, svg, caption }) => `<div class="item"><div class="cut" data-serial="${esc(l.serial)}"><div style="zoom: ${zoom}">${labelDiv(l, svg)}</div></div><div class="cap">${esc(caption)}</div></div>`;
  const section = (g, i) => `<section style="${i ? "break-before: page;" : ""}"><h2>${esc(g.title)}</h2><p>${esc(g.note)}</p><div class="grid">${g.items.map(cell).join("")}</div></section>`;
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; } body { margin: 0; font: 9pt Arial, Helvetica, sans-serif; color: #111; }
    h1 { font-size: 13pt; margin: 0 0 1mm; } h2 { font-size: 11pt; margin: 0 0 1mm; } p { margin: 0 0 3mm; color: #333; }
    .grid { display: grid; grid-template-columns: repeat(2, ${LABEL_MM.width}mm); column-gap: 14mm; row-gap: 3mm; }
    .item { break-inside: avoid; }
    .cut { width: ${LABEL_MM.width}mm; height: ${LABEL_MM.height}mm; border: .25mm dashed #999; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fff; }
    .cap { font-size: 7.5pt; color: #555; margin-top: .8mm; }${LABEL_CSS}
  </style></head><body>
    <h1>Etichette di prova da stampare · ${TEST_MARK}</h1>
    <p>Stampa al 100% (dimensione reale, non «adatta alla pagina»): ogni etichetta è ${LABEL_MM.width} × ${LABEL_MM.height} mm. Ritaglia lungo il tratteggio. Dati inventati.</p>
    ${groups.map(section).join("")}
  </body></html>`;
}

// The DDT on paper, photographed on a desk: a little rotated, uneven light, slightly soft (D-45: the real case).
const photoHtml = (pagePng) => `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; width: 1400px; height: 1900px; overflow: hidden; background: linear-gradient(135deg, #6b5a46, #3e3328); display: flex; align-items: center; justify-content: center; }
  .sheet { position: relative; transform: perspective(1800px) rotateX(5deg) rotate(-2.2deg); box-shadow: 8px 14px 30px rgba(0,0,0,.55); }
  .sheet img { display: block; width: 1190px; filter: blur(.6px) contrast(.92) brightness(.97) sepia(.08); }
  .light { position: absolute; inset: 0; background: radial-gradient(ellipse at 25% 20%, rgba(255,255,240,.18), rgba(0,0,0,.28) 85%); }
</style></head><body><div class="sheet"><img src="data:image/png;base64,${pagePng.toString("base64")}"><div class="light"></div></div></body></html>`;

// ---- Excel ----
async function writeExcel(file, sheetName, headers, rows) {
  const wb = new ExcelJS.Workbook();
  wb.title = TEST_MARK; wb.subject = `${TEST_MARK} - dati inventati`; wb.creator = "SwapTrack demoDocs";
  // The first sheet starts with the header row: the app reads it so (readTable).
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(headers).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((c, i) => { c.width = Math.max(10, ...[headers[i], ...rows.map((r) => r[i])].map((v) => String(v ?? "").length + 2)); });
  wb.addWorksheet("Leggimi").addRow([`${TEST_MARK}: dati inventati per la demo di SwapTrack, nessun dato reale.`]);
  await wb.xlsx.writeFile(`${OUT}${file}`);
}

// ---- Checks of what was written ----
const pdfPages = (file) => (readFileSync(`${OUT}${file}`, "latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
async function excelRows(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(`${OUT}${file}`);
  const ws = wb.worksheets[0];
  return { headers: ws.getRow(1).values.slice(1), rows: ws.actualRowCount - 1 };
}
const decode = async (file) => (await readBarcodes(new Uint8Array(readFileSync(`${OUT}${file}`)), { formats: ["Code128"], tryHarder: true })).map((b) => b.text);

async function main() {
  mkdirSync(OUT, { recursive: true });
  // The wasm file from node_modules: never fetched from the network.
  const wasm = readFileSync(require.resolve("zxing-wasm/full/zxing_full.wasm"));
  await prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) }, fireImmediately: true });
  const browser = await chromium.launch();
  const checks = [];
  const printed = [];
  try {
    const page = await browser.newPage();
    for (const d of DDT) {
      await page.setContent(ddtHtml(d), { waitUntil: "load" });
      await page.pdf({ path: `${OUT}DDT-${d.number}.pdf`, format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<div></div>", footerTemplate: FOOTER, margin: { top: "14mm", bottom: "18mm", left: "12mm", right: "12mm" } });
    }
    await page.setContent(bomHtml(), { waitUntil: "load" });
    await page.pdf({ path: `${OUT}BOM-${SITE.code}.pdf`, format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<div></div>", footerTemplate: FOOTER, margin: { top: "14mm", bottom: "18mm", left: "12mm", right: "12mm" } });
    // The paper photo: the first page of DDT 0412 as an image, then photographed.
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.setContent(ddtHtml(DDT[0]).replace("<body>", `<body style="padding: 14mm 12mm; box-sizing: border-box; width: 794px; background: #fff">`), { waitUntil: "load" });
    const pagePng = await page.screenshot({ fullPage: false, type: "png", scale: "device" });
    await page.setViewportSize({ width: 1400, height: 1900 });
    await page.setContent(photoHtml(pagePng), { waitUntil: "load" });
    await page.screenshot({ path: `${OUT}DDT-TD-2026-0412-foto.jpg`, type: "jpeg", quality: 78 });

    await page.setViewportSize({ width: 760, height: 420 });
    const svgs = new Map();
    for (const l of [...LABELS, ...BOM_LABELS]) {
      svgs.set(l.serial, await barcodeSvg(l.serial));
      await page.setContent(labelHtml(l, svgs.get(l.serial)), { waitUntil: "load" });
      await page.screenshot({ path: `${OUT}${l.file}`, ...(l.file.endsWith(".jpg") ? { type: "jpeg", quality: 85 } : { type: "png" }) });
    }

    // The sheet to print, then the same sheet on screen at about 300 dpi: what the camera will meet on paper.
    const groups = [
      { title: `Arrivo in magazzino: DDT ${DDT[0].number}`, note: `Etichette 1-5 del DDT (la 4 e la 5 rovinate apposta) e la 6 di un pezzo che non è nel DDT. Luogo: ${WAREHOUSE.code}.`,
        items: LABELS.map((l, i) => ({ l, svg: svgs.get(l.serial), caption: `${i + 1} · ${l.serial}${l.damage ? ` · ${DAMAGE_IT[l.damage]}` : ""}${i === 5 ? " · fuori DDT" : ""}` })) },
      { title: `Sito ${SITE.code}: seriali della BOM`, note: "SMONTARE: da attaccare ai pezzi vecchi da togliere al sito. INSTALLARE: i pezzi nuovi da montare.",
        items: BOM_LABELS.map((l) => ({ l, svg: svgs.get(l.serial), caption: `${l.op} · ${l.serial}` })) },
    ];
    await page.setContent(printHtml(groups), { waitUntil: "load" });
    await page.pdf({ path: `${OUT}${PRINT_PDF}`, format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<div></div>", footerTemplate: FOOTER, margin: { top: "12mm", bottom: "16mm", left: "18mm", right: "18mm" } });
    const hiRes = await browser.newPage({ deviceScaleFactor: 300 / 96 });
    await hiRes.setContent(printHtml(groups), { waitUntil: "load" });
    for (const box of await hiRes.locator(".cut").all()) {
      const serial = await box.getAttribute("data-serial");
      const mm = await box.evaluate((e) => [e.offsetWidth, e.offsetHeight].map((px) => Math.round(px * 25.4 / 96)));
      printed.push({ serial, mm, got: (await readBarcodes(new Uint8Array(await box.screenshot({ type: "png" })), { formats: ["Code128"], tryHarder: true })).map((b) => b.text) });
    }
  } finally {
    await browser.close();
  }

  const DDT_HEADERS = ["Pos.", "Cod. articolo", "Descrizione", "N. serie", "Q.tà", "UM"];
  await writeExcel("DDT-TD-2026-0412.xlsx", "DDT TD-2026-0412", DDT_HEADERS, DDT[0].lines.map((l, i) => [i + 1, l.materialCode, l.description, l.serial, l.quantity, "PZ"]));
  await writeExcel(`BOM-${SITE.code}.xlsx`, `BOM ${SITE.code}`, ["Sito", "Operazione", "Cod. articolo", "Descrizione", "N. serie", "Q.tà"],
    BOM.map((l) => [SITE.code, l.op, l.materialCode, l.description, l.serial, l.quantity]));
  writeFileSync(`${OUT}LEGGIMI.txt`, leggimi(), "utf8");

  // What was written, read back.
  checks.push(["DDT-TD-2026-0412.pdf: 1 pagina", pdfPages("DDT-TD-2026-0412.pdf") === 1]);
  checks.push(["DDT-TD-2026-0413.pdf: 2 pagine", pdfPages("DDT-TD-2026-0413.pdf") === 2]);
  checks.push([`BOM-${SITE.code}.pdf: 1 pagina`, pdfPages(`BOM-${SITE.code}.pdf`) === 1]);
  const x1 = await excelRows("DDT-TD-2026-0412.xlsx");
  checks.push([`DDT-TD-2026-0412.xlsx: intestazioni in riga 1 e ${DDT[0].lines.length} righe`, x1.headers.join("|") === DDT_HEADERS.join("|") && x1.rows === DDT[0].lines.length]);
  const x2 = await excelRows(`BOM-${SITE.code}.xlsx`);
  checks.push([`BOM-${SITE.code}.xlsx: ${BOM.length} righe con la colonna Operazione`, x2.headers.includes("Operazione") && x2.rows === BOM.length]);
  for (const l of [...LABELS, ...BOM_LABELS]) {
    const got = await decode(l.file);
    checks.push(l.damage
      ? [`${l.file}: lo scanner NON la legge (caso della lettura automatica)`, !got.includes(l.serial)]
      : [`${l.file}: lo scanner legge ${l.serial}`, got.length === 1 && got[0] === l.serial]);
  }
  checks.push([`${PRINT_PDF}: 2 pagine (DDT, poi BOM)`, pdfPages(PRINT_PDF) === 2]);
  const all = [...LABELS, ...BOM_LABELS];
  checks.push([`${PRINT_PDF}: ${all.length} etichette di ${LABEL_MM.width} × ${LABEL_MM.height} mm`, printed.length === all.length && printed.every((p) => p.mm[0] === LABEL_MM.width && p.mm[1] === LABEL_MM.height)]);
  for (const l of all) {
    const got = printed.find((p) => p.serial === l.serial)?.got ?? [];
    checks.push(l.damage
      ? [`stampata ${l.serial}: lo scanner NON la legge`, !got.includes(l.serial)]
      : [`stampata ${l.serial}: lo scanner la legge`, got.length === 1 && got[0] === l.serial]);
  }
  for (const [what, ok] of checks) console.log(`${ok ? "OK  " : "NO  "} ${what}`);
  console.log(`Files in ${OUT}`);
  if (checks.some(([, ok]) => !ok)) process.exit(1);
}

function leggimi() {
  const count = (d) => `${d.lines.filter((l) => l.serial).length} seriali e ${d.lines.filter((l) => !l.serial).length} righe a quantità`;
  const ddt0 = DDT[0].lines.filter((l) => l.serial).map((l) => l.serial);
  return [
    `${TEST_MARK} - dati inventati per la demo di SwapTrack. Rigenerati con: node scripts/demoDocs.mjs`,
    "",
    `Coerenti con i dati inventati della demo: ${NORD.name}, ${WAREHOUSE.name} (${WAREHOUSE.code}), sito ${SITE.code} (${SITE.name}), codici materiale del catalogo.`,
    "I seriali TD26... sono nuovi: non esistono nei dati inventati. Salvando il DDT, il server crea i pezzi attesi.",
    "",
    `DDT-TD-2026-0412.pdf        DDT di 1 pagina: ${count(DDT[0])} (per la lettura automatica)`,
    "DDT-TD-2026-0412-foto.jpg   lo stesso DDT fotografato sulla scrivania (il caso vero per la lettura automatica)",
    "DDT-TD-2026-0412.xlsx       lo stesso DDT in Excel: scegli le colonne N. serie, Cod. articolo, Q.tà",
    `DDT-TD-2026-0413.pdf        DDT di 2 pagine: ${count(DDT[1])}`,
    `BOM-${SITE.code}.xlsx         BOM del sito ${SITE.code}: colonna Operazione, valori SMONTARE e INSTALLARE`,
    `BOM-${SITE.code}.pdf          la stessa BOM stampata (per la lettura automatica)`,
    "etichetta-1..3-pulita       si leggono con la fotocamera (seriali del DDT 0412)",
    "etichetta-4-sfocata         la fotocamera non la legge: «Il codice non si legge?» → «Fotografa l'etichetta»",
    "etichetta-5-strappata       codice a barre strappato e una cifra macchiata: lettura automatica con carattere incerto",
    "etichetta-6-fuori-DDT       pezzo che non è nel DDT: compare «Pezzo sconosciuto» (scegli un modello o «Salta»), poi nel confronto risulta «Non atteso»",
    `etichetta-bom-1..9          seriali della BOM di ${SITE.code}: ${BOM_LABELS.filter((l) => l.op === "SMONTARE").length} da smontare (TD26R13…), ${BOM_LABELS.filter((l) => l.op === "INSTALLARE").length} da installare (TD26I13…)`,
    `${PRINT_PDF}   tutte le etichette su A4, ${LABEL_MM.width} × ${LABEL_MM.height} mm: stampare al 100% e ritagliare`,
    "",
    "Percorso di demo (Magazzino ASP Nord):",
    "1. Documenti > Nuovo documento > DDT (arrivo), numero TD-2026-0412, luogo MAG-NORD-01; carica il PDF, l'Excel o la foto; controlla le righe e Salva.",
    "2. Leggi > Arrivo > DDT TD-2026-0412; leggi le etichette 1, 2, 3 (e la 4 e la 5 con la foto, se la lettura automatica è accesa); poi la 6.",
    `3. Documenti > TD-2026-0412 > Confronta: arrivati ${ddt0.slice(0, 3).join(", ")} (più 4 e 5 se lette), mancanti gli altri, non atteso TD260499001.`,
    "",
    "Prima della presentazione i dati delle prove si cancellano: vedi la cartella PRIMA_DELLA_PRESENTAZIONE.",
    "",
  ].join("\r\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
