import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr } from "./helpers";
import { SEED } from "./seed";

// P-59 (SPEC §9.2, D-30): a piece sent in one return and confirmed by the client as an extra piece of another one: the
// line of the first return says "confirmed in another return" and leads to it. Own pieces and returns (E2E- codes).
async function signOut(page: Page): Promise<void> {
  await page.getByTestId("user-menu-trigger").click();
  await page.getByTestId("user-menu-signout").click();
  await expect(page.getByTestId("signin-submit-button")).toBeVisible({ timeout: 30_000 });
}
const todayRow = (page: Page, code: string, mode: string) =>
  page.getByTestId("scan-today-row").filter({ hasText: code }).filter({ hasText: tr(`scan.modes.${mode}`) });

// A sent return from the Nord warehouse with one piece; returns its id.
async function sentReturn(page: Page, code: string): Promise<string> {
  await page.goto("/shipments");
  await page.getByTestId("shipments-new-return").click();
  await page.getByTestId("shipments-from-select").selectOption(`loc_${SEED.nord.warehouse}`);
  await page.getByTestId("shipments-to-select").selectOption(`loc_${SEED.clientWarehouse}`);
  await page.getByTestId("shipments-create").click();
  await expect(page).toHaveURL(/\/shipments\/[^/]+$/, { timeout: 30_000 });
  const id = page.url().split("/").pop()!;
  await page.getByTestId("shipment-scan").click();
  await scanManual(page, code);
  await expect(todayRow(page, code, "return_ship")).toContainText(tr("scan.sent"), { timeout: 60_000 });
  await page.goto(`/shipments/${id}`);
  await expect(page.getByTestId("shipment-lines")).toContainText(code, { timeout: 90_000 });
  await page.getByTestId("shipment-send").click();
  await page.getByTestId("shipment-ddt-input").fill(uniqueCode("DDTE"));
  await page.getByTestId("shipment-send-save").click();
  await expect(page.getByTestId("shipment-send")).toHaveCount(0, { timeout: 30_000 });
  return id;
}

test.describe("Reso — pezzo confermato in un altro reso (scrivania)", () => {
  test("A nel reso 1, confermato come pezzo in più del reso 2: nel reso 1 la riga lo dice e porta al reso 2", async ({ page }) => {
    test.setTimeout(360_000);
    const [a, b] = [uniqueCode("E"), uniqueCode("E")];

    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-category-select").selectOption(SEED.sorting.radioCategoryId);
    for (const c of [a, b]) await scanManual(page, c, { withModel: true });
    for (const c of [a, b]) await expect(todayRow(page, c, "arrive_at_warehouse")).toContainText(tr("scan.sent"), { timeout: 60_000 });
    const r1 = await sentReturn(page, a);
    const r2 = await sentReturn(page, b);
    await signOut(page);

    // The client warehouse confirms return 2 with A as an extra piece.
    await signIn(page, ACCOUNTS.clientWarehouse);
    await page.goto(`/shipments/${r2}`);
    await page.getByTestId("shipment-confirm").click();
    await page.getByTestId("confirm-extra-input").fill(a);
    await page.getByTestId("confirm-extra-add").click();
    await page.getByTestId("confirm-save").click();
    await expect(page.getByText(tr("shipments.confirmed")).first()).toBeVisible({ timeout: 60_000 });

    // Return 1: A's line says it was confirmed in another return, and leads to return 2.
    await expect.poll(async () => {
      await page.goto(`/shipments/${r1}`);
      await expect(page.getByTestId("shipment-lines")).toContainText(a);
      return page.getByTestId("shipment-lines").locator("li").filter({ hasText: a }).locator("[data-testid^='shipment-line-elsewhere-']").count();
    }, { timeout: 90_000, intervals: [3000] }).toBe(1);
    const badge = page.getByTestId("shipment-lines").locator("li").filter({ hasText: a }).locator("[data-testid^='shipment-line-elsewhere-']");
    await expect(badge).toContainText(tr("shipments.confirmedElsewhere"));
    await expect(badge).toHaveAttribute("href", `/shipments/${r2}`);
  });
});
