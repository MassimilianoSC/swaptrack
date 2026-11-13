import { test, expect, type Page, type Route } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr } from "./helpers";
import { SEED } from "./seed";

// P-199: the client's confirmation of a return that fails (no network, a refusal) keeps its window open with the ticks
// and the extra pieces as they were, so it can be sent again; it closed and the work was lost. Own return (E2E- codes).
async function signOut(page: Page): Promise<void> {
  await page.getByTestId("user-menu-trigger").click();
  await page.getByTestId("user-menu-signout").click();
  await expect(page.getByTestId("signin-submit-button")).toBeVisible({ timeout: 30_000 });
}
const todayRow = (page: Page, code: string) =>
  page.getByTestId("scan-today-row").filter({ hasText: code }).filter({ hasText: tr("scan.modes.return_ship") });

// A sent return from the Nord warehouse with the given pieces; returns its id.
async function sentReturn(page: Page, codes: string[]): Promise<string> {
  await signIn(page, ACCOUNTS.aspWarehouseNord);
  await pickLocation(page, SEED.nord.warehouse);
  await page.goto("/shipments");
  await page.getByTestId("shipments-new-return").click();
  await page.getByTestId("shipments-from-select").selectOption(`loc_${SEED.nord.warehouse}`);
  await page.getByTestId("shipments-to-select").selectOption(`loc_${SEED.clientWarehouse}`);
  await page.getByTestId("shipments-create").click();
  await expect(page).toHaveURL(/\/shipments\/[^/]+$/, { timeout: 30_000 });
  const id = page.url().split("/").pop()!;
  await page.getByTestId("shipment-scan").click();
  for (const c of codes) await scanManual(page, c);
  for (const c of codes) await expect(todayRow(page, c)).toContainText(tr("scan.sent"), { timeout: 60_000 });
  await page.goto(`/shipments/${id}`);
  for (const c of codes) await expect(page.getByTestId("shipment-lines")).toContainText(c, { timeout: 90_000 });
  await page.getByTestId("shipment-send").click();
  await page.getByTestId("shipment-ddt-input").fill(uniqueCode("DDTC"));
  await page.getByTestId("shipment-send-save").click();
  await expect(page.getByTestId("shipment-send")).toHaveCount(0, { timeout: 30_000 });
  await signOut(page);
  return id;
}

test.describe("Conferma del reso che non riesce (scrivania)", () => {
  test("con un errore la finestra resta aperta con spunte e pezzi in più; poi si conferma", async ({ page }) => {
    test.setTimeout(360_000);
    const [a, b, x] = [uniqueCode("RC"), uniqueCode("RC"), uniqueCode("RC")];
    const id = await sentReturn(page, [a, b]);

    await signIn(page, ACCOUNTS.clientWarehouse);
    await page.goto(`/shipments/${id}`);
    await page.getByTestId("shipment-confirm").click();
    const lineB = page.getByTestId("confirm-lines-list").locator("li").filter({ hasText: b }).locator("input[type=checkbox]");
    await lineB.uncheck();
    await page.getByTestId("confirm-extra-input").fill(x);
    await page.getByTestId("confirm-extra-add").click();

    // The confirmation does not reach the server (the app calls the functions at /__functions on the emulators).
    const fns = (url: URL) => url.pathname.startsWith("/__functions");
    const blocked = (r: Route) => (r.request().postData() ?? "").includes("\"op\":\"confirmReturn\"") ? r.abort() : r.fallback();
    await page.route(fns, blocked);
    await page.getByTestId("confirm-save").click();
    await expect(page.getByText(tr("errors.offline")).or(page.getByText(tr("errors.unexpected"))).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("confirm-save")).toBeVisible();
    await expect(lineB).not.toBeChecked();
    await expect(page.getByTestId("confirm-extra-list")).toContainText(x);

    // Sent again with the server reachable: confirmed, the window closes.
    await page.unroute(fns, blocked);
    await page.getByTestId("confirm-save").click();
    await expect(page.getByText(tr("shipments.confirmed")).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("confirm-save")).toHaveCount(0);
    await expect(page.getByTestId("shipment-lines").locator("li").filter({ hasText: b })).toContainText(tr("shipments.missing"), { timeout: 30_000 });
  });
});
