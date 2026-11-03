import { expect, type Page, type Download } from "@playwright/test";
import { readFileSync } from "node:fs";

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

// Scanning screen: type the digits under the barcode (source: manual) and wait for the confirmation flash.
// Enter submits the form (the fixed "Scan" button of the field shell can never sit over a click).
// An unknown piece in a removal or an arrival asks for the model first (SPEC §6.4): skipped, or the first
// model of the catalog is chosen when `withModel` is set.
export async function scanManual(page: Page, code: string, opts: { withModel?: boolean } = {}): Promise<void> {
  const input = page.getByTestId("scan-manual-input");
  await input.fill(code);
  await input.press("Enter");
  const skip = page.getByTestId("scan-modelpick-skip");
  const flash = page.getByTestId("scan-flash");
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
