import { expect, type Page, type Download } from "@playwright/test";
import { readFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";

// Seeded accounts of the emulators (README, scripts/seed.mjs). Invented data.
// The password is the one of the emulator seed; E2E_PASSWORD overrides it.
export const PASSWORD = process.env.E2E_PASSWORD ?? "SwapDemo2026";
export const ACCOUNTS = {
  clientAdmin: "client.admin.telco@swaptrack-demo.test",
  clientOffice: "client.office.telco@swaptrack-demo.test",
  clientWarehouse: "client.warehouse.telco@swaptrack-demo.test",
  aspAdminNord: "asp.admin.nord@swaptrack-demo.test",
  aspWarehouseNord: "asp.warehouse.nord@swaptrack-demo.test",
  aspTechnicianNord: "asp.technician.nord@swaptrack-demo.test",
  aspAdminCentro: "asp.admin.centro@swaptrack-demo.test",
  aspWarehouseCentro: "asp.warehouse.centro@swaptrack-demo.test",
  aspTechnicianCentro: "asp.technician.centro@swaptrack-demo.test",
  aspAdminSud: "asp.admin.sud@swaptrack-demo.test",
  aspWarehouseSud: "asp.warehouse.sud@swaptrack-demo.test",
  aspTechnicianSud: "asp.technician.sud@swaptrack-demo.test",
} as const;

// The Italian strings the app shows (locale it-IT in playwright.config.ts), read from the app's own file.
const IT = JSON.parse(readFileSync(new URL("../src/i18n/it.json", import.meta.url), "utf8")) as Record<string, unknown>;
export function tr(path: string): string {
  const v = path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), IT);
  if (typeof v !== "string") throw new Error(`Missing i18n key: ${path}`);
  return v;
}

// The texts of the page shown as raw i18n keys ("home.cards.items", "common.download"): one of the app's namespaces,
// a dot, a name. innerText, not textContent: textContent glues neighbouring elements ("Pezzihome.cards.items").
export async function rawKeysIn(page: Page): Promise<string[]> {
  const re = new RegExp(`\\b(?:${Object.keys(IT).join("|")})\\.[a-zA-Z_.]+`, "g");
  return (await page.getByTestId("main-content").evaluate((el) => (el as HTMLElement).innerText)).match(re) ?? [];
}

// Admin reads of the emulators ("Bearer owner" bypasses the rules; emulators only, never the real project). The
// ports come from firebase.json (D-21), the project and bucket from .env.development.
const EMU = (JSON.parse(readFileSync(new URL("../firebase.json", import.meta.url), "utf8")) as { emulators: Record<string, { port: number }> }).emulators;
const ENV = Object.fromEntries(readFileSync(new URL("../.env.development", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const OWNER = { Authorization: "Bearer owner" };
export async function emulatorDoc(path: string): Promise<Record<string, { stringValue?: string; arrayValue?: { values?: Array<{ stringValue?: string }> } }>> {
  const r = await fetch(`http://127.0.0.1:${EMU.firestore.port}/v1/projects/${ENV.VITE_FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`, { headers: OWNER });
  if (!r.ok) throw new Error(`emulatorDoc ${path}: ${r.status}`);
  return ((await r.json()) as { fields: never }).fields;
}
// The tests' own documents, written and read as plain values through the emulator's REST API (admin).
type FsValue = Record<string, unknown>;
const toFs = (v: unknown): FsValue => v === null || v === undefined ? { nullValue: null }
  : v instanceof Date ? { timestampValue: v.toISOString() }
  : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v }
  : typeof v === "number" ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : Array.isArray(v) ? { arrayValue: { values: v.map(toFs) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, toFs(x)])) } };
const fromFs = (v: Record<string, unknown>): unknown => {
  if ("mapValue" in v) return Object.fromEntries(Object.entries(((v.mapValue as { fields?: Record<string, FsValue> }).fields) ?? {}).map(([k, x]) => [k, fromFs(x)]));
  if ("arrayValue" in v) return (((v.arrayValue as { values?: FsValue[] }).values) ?? []).map(fromFs);
  if ("integerValue" in v) return Number(v.integerValue);
  if ("nullValue" in v) return null;
  return Object.values(v)[0];
};
const docsUrl = (path: string) => `http://127.0.0.1:${EMU.firestore.port}/v1/projects/${ENV.VITE_FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
export async function emulatorSetDoc(path: string, data: Record<string, unknown>): Promise<void> {
  const r = await fetch(docsUrl(path), { method: "PATCH", headers: { ...OWNER, "Content-Type": "application/json" }, body: JSON.stringify({ fields: (toFs(data).mapValue as { fields: unknown }).fields }) });
  if (!r.ok) throw new Error(`emulatorSetDoc ${path}: ${r.status} ${await r.text()}`);
}
export async function emulatorRead(path: string): Promise<Record<string, unknown>> {
  const r = await fetch(docsUrl(path), { headers: OWNER });
  if (!r.ok) throw new Error(`emulatorRead ${path}: ${r.status}`);
  return fromFs({ mapValue: await r.json() }) as Record<string, unknown>;
}
export async function emulatorList(collection: string, pageSize = 20): Promise<Array<Record<string, unknown> & { id: string }>> {
  const r = await fetch(`${docsUrl(collection)}?pageSize=${pageSize}`, { headers: OWNER });
  const docs = ((await r.json()) as { documents?: Array<{ name: string; fields?: Record<string, FsValue> }> }).documents ?? [];
  return docs.map((d) => ({ id: d.name.split("/").pop()!, ...(fromFs({ mapValue: { fields: d.fields ?? {} } }) as Record<string, unknown>) }));
}
// A shared setting (settings/{name}) changed for one test and put back by it: the other fields are kept.
export async function emulatorPatchSetting(name: string, fields: Record<string, unknown>): Promise<void> {
  const current = await emulatorRead(`settings/${name}`).catch(() => ({}));
  await emulatorSetDoc(`settings/${name}`, { ...current, ...fields });
}

// The first document of a collection whose fields equal the given values (a seeded example to read).
export async function emulatorFindOne(collection: string, equals: Record<string, string>): Promise<(Record<string, unknown> & { id: string }) | null> {
  const where = { compositeFilter: { op: "AND", filters: Object.entries(equals).map(([field, v]) => ({ fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: v } } })) } };
  const r = await fetch(`${docsUrl("")}`.replace(/\/documents\/$/, "/documents:runQuery"), { method: "POST", headers: { ...OWNER, "Content-Type": "application/json" }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where, limit: 1 } }) });
  const doc = ((await r.json()) as Array<{ document?: { name: string; fields?: Record<string, FsValue> } }>).find((x) => x.document)?.document;
  return doc ? { id: doc.name.split("/").pop()!, ...(fromFs({ mapValue: { fields: doc.fields ?? {} } }) as Record<string, unknown>) } : null;
}
export async function emulatorFirstId(collection: string): Promise<string> {
  const r = await fetch(`${docsUrl(collection)}?pageSize=1`, { headers: OWNER });
  const name = ((await r.json()) as { documents?: Array<{ name: string }> }).documents?.[0]?.name ?? "";
  return name.split("/").pop()!;
}

// A test's own account (never a seeded one): created in the Auth emulator by its admin API, which, like the Admin SDK,
// does not run the blocking functions; claims as setCustomUserClaims writes them (users.ts).
const authUrl = (op: string) => `http://127.0.0.1:${EMU.auth.port}/identitytoolkit.googleapis.com/v1/projects/${ENV.VITE_FIREBASE_PROJECT_ID}/${op}`;
export async function emulatorCreateUser(email: string): Promise<string> {
  const r = await fetch(authUrl("accounts"), { method: "POST", headers: { ...OWNER, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  if (!r.ok) throw new Error(`emulatorCreateUser: ${r.status} ${await r.text()}`);
  return ((await r.json()) as { localId: string }).localId;
}
export async function emulatorSetClaims(uid: string, claims: Record<string, unknown>): Promise<void> {
  const r = await fetch(authUrl("accounts:update"), { method: "POST", headers: { ...OWNER, "Content-Type": "application/json" }, body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(claims) }) });
  if (!r.ok) throw new Error(`emulatorSetClaims: ${r.status} ${await r.text()}`);
}

export async function emulatorFile(path: string): Promise<Uint8Array> {
  const r = await fetch(`http://127.0.0.1:${EMU.storage.port}/v0/b/${ENV.VITE_FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media`, { headers: OWNER });
  if (!r.ok) throw new Error(`emulatorFile ${path}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

// A code that belongs to this run only: tests that write never touch the seeded SNN-/SNC-/SNS- pieces.
let codeCounter = 0;
export const uniqueCode = (prefix: string): string => `E2E-${prefix}-${Date.now().toString(36).toUpperCase()}${(codeCounter++).toString(36).toUpperCase()}`;

// Sign in with e-mail and password; accept the privacy notice at the first sign-in of a seeded account (SPEC §4.15).
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/signin");
  await page.getByTestId("signin-email-input").fill(email);
  await page.getByTestId("signin-password-input").fill(PASSWORD);
  await page.getByTestId("signin-submit-button").click();
  const privacy = page.getByTestId("privacy-accept-button");
  const topbar = page.getByTestId("topbar");
  await expect(privacy.or(topbar)).toBeVisible({ timeout: 30_000 });
  if (await privacy.isVisible()) await privacy.click();
  await expect(topbar).toBeVisible({ timeout: 30_000 });
}

// Field roles: choose a site or a warehouse by its code in the site picker (home), right after the sign-in, while the
// ASP's offline cache may still be loading (the real case, P-78): nothing waits for it.
export async function pickLocation(page: Page, code: string): Promise<void> {
  await page.goto("/");
  await page.getByTestId("site-picker-search").fill(code);
  await page.getByTestId("site-picker-item").filter({ hasText: code }).first().click();
  await expect(page.getByTestId("site-picker-selected")).toContainText(code);
}

// P-157: what the scanning screen shows over time, sampled in the page (a wait in the test would measure the test too).
export type FlashEntry = { v: string; at: number };
type FlashWindow = { __flash: FlashEntry[]; __toasts: string[] };
export async function watchFlash(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as FlashWindow;
    w.__flash = [];
    w.__toasts = [];
    let current = "";
    setInterval(() => {
      const el = document.querySelector("[data-testid='scan-flash']");
      const now = el ? `${el.getAttribute("data-tone")}|${el.textContent}` : "";
      if (now !== current) { current = now; w.__flash.push({ v: now, at: performance.now() }); }
      document.querySelectorAll("[data-sonner-toast]").forEach((t) => { const s = t.textContent ?? ""; if (!w.__toasts.includes(s)) w.__toasts.push(s); });
    }, 30);
  });
}
export const flashLog = (page: Page): Promise<FlashEntry[]> => page.evaluate(() => (window as unknown as FlashWindow).__flash);
export const toastLog = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as FlashWindow).__toasts);
export const clearFlashLog = (page: Page): Promise<void> => page.evaluate(() => { const w = window as unknown as FlashWindow; w.__flash = []; w.__toasts = []; });
// How long the last message of this tone stayed in ms (0: never shown, or still on the screen).
export async function flashSpell(page: Page, tone: "ok" | "warn" | "danger"): Promise<number> {
  const log = await flashLog(page);
  for (let i = log.length - 1; i >= 0; i--) if (log[i].v.startsWith(`${tone}|`)) return log[i + 1] ? log[i + 1].at - log[i].at : 0;
  return 0;
}

// Scanning screen: type the digits under the barcode (source: manual) and wait for the confirmation flash.
// Enter submits the form (the fixed "Scan" button of the field shell can never sit over a click).
// An unknown piece in a removal or an arrival asks for the model first (SPEC §6.4): skipped, or the first
// model of the catalog is chosen when `withModel` is set.
export async function scanManual(page: Page, code: string, opts: { withModel?: boolean } = {}): Promise<void> {
  const input = page.getByTestId("scan-manual-input");
  const skip = page.getByTestId("scan-modelpick-skip");
  const flash = page.getByTestId("scan-flash");
  await expect(flash).toBeHidden(); // a warning of the reading before (3 s, P-157) is not the answer to this one
  await input.fill(code);
  await input.press("Enter");
  await expect(skip.or(flash)).toBeVisible();
  if (await skip.isVisible()) {
    if (opts.withModel) {
      await page.getByTestId("scan-modelpick-select").selectOption({ index: 1 });
      await page.getByTestId("scan-modelpick-save").click();
    } else {
      await skip.click();
    }
  }
  await expect(flash).toContainText(code);
  await expect(flash).toBeHidden();
}

// The page of a piece, found by its code once the trigger has created it. The search is repeated inside the app,
// never by reloading it: a reload restarts the offline cache load and the photo queue of the session.
export async function openPiece(page: Page, code: string): Promise<string> {
  await page.goto("/items");
  await expect.poll(async () => {
    if (/\/items\/[^/]+$/.test(new URL(page.url()).pathname)) return page.url();
    await page.getByTestId("items-search-input").fill(code);
    await page.getByTestId("items-search-submit").click();
    await page.waitForTimeout(1500);
    return page.url();
  }, { timeout: 60_000 }).toMatch(/\/items\/[^/]+$/);
  return page.url().split("/").pop()!;
}

// Every row of a DataTable (text and link targets), walking through all its pages.
export interface TableRow { text: string; hrefs: string[] }
export async function collectRows(page: Page, tableId: string): Promise<TableRow[]> {
  await expect(page.getByTestId(`${tableId}-count`)).toBeVisible();
  const out: TableRow[] = [];
  for (;;) {
    const rows = page.getByTestId(`${tableId}-row`);
    out.push(...await rows.evaluateAll((trs) => trs.map((tr) => ({
      text: tr.textContent ?? "",
      hrefs: Array.from(tr.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? ""),
    }))));
    const next = page.getByTestId(`${tableId}-next`);
    if (!(await next.isVisible()) || (await next.isDisabled())) return out;
    await next.click();
  }
}

// The first bytes of a file the browser saved (downloads read with the Storage rules, D-35): PK = xlsx, %PDF = pdf.
export async function fileStart(download: Download, n: number): Promise<string> {
  return readFileSync(await download.path()).subarray(0, n).toString("latin1");
}

// A small grey PNG built here, enough for the compressor (imageCompress.js) to decode and re-encode as JPEG.
export function png(size: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const raw = Buffer.alloc(size * (1 + size * 3), 0x80);
  for (let y = 0; y < size; y++) raw[y * (1 + size * 3)] = 0; // filter byte of each row
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
