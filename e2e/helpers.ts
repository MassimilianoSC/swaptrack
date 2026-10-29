import { expect, type Page } from "@playwright/test";
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

// Field roles: choose a site or a warehouse by its code in the site picker (home).
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

// Runs an action that calls window.open (downloads) and returns the URL instead of opening a tab.
export async function captureOpenedUrl(page: Page, action: () => Promise<void>): Promise<string> {
  await page.evaluate(() => {
    const w = window as unknown as { __e2eOpened: string | null; open: (u?: string | URL) => Window | null };
    w.__e2eOpened = null;
    w.open = (u?: string | URL) => { w.__e2eOpened = String(u); return null; };
  });
  await action();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __e2eOpened: string | null }).__e2eOpened), { timeout: 30_000 }).not.toBeNull();
  return page.evaluate(() => (window as unknown as { __e2eOpened: string }).__e2eOpened);
}
