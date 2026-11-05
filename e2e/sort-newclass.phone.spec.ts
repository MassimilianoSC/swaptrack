import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr, emulatorFindOne } from "./helpers";
import { SEED } from "./seed";

// "Sort": the server accepts "Defective" / "Leftover" only for new material at the warehouse (or a piece already
// defective / leftover; shared/stateMachine.ts, classify). For a removed piece they made an anomaly and the piece never
// became sorted, without a word on the phone. Now the window offers them only where they work, and a fixed "Defective"
// on a removed piece records nothing and says why. Own pieces (E2E- codes), Nord warehouse.
async function arrived(page: Page, code: string, flow: "removed" | "new"): Promise<void> {
  await page.goto("/scan?mode=arrive_at_warehouse");
  await page.getByTestId("scan-flow-select").selectOption(flow);
  await scanManual(page, code, { withModel: true });
  await expect(page.getByTestId("scan-session-row").filter({ hasText: code })).toContainText(tr("scan.sent"), { timeout: 60_000 });
  await expect.poll(async () => (await emulatorFindOne("codes", { raw: code }))?.itemId ?? null, { timeout: 90_000 }).not.toBeNull();
}
const type = async (page: Page, code: string) => {
  await page.getByTestId("scan-manual-input").fill(code);
  await page.getByTestId("scan-manual-submit").click();
};

test.describe("Smista: «Difettoso» e «Avanzo» solo per il materiale nuovo (telefono)", () => {
  test("pezzo smontato: nella finestra ci sono le categorie, non «Difettoso» né «Avanzo»", async ({ page }) => {
    test.setTimeout(240_000);
    const code = uniqueCode("NC");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await arrived(page, code, "removed");
    await page.goto("/scan?mode=classify");
    await type(page, code);
    await expect(page.getByTestId("scan-sort")).toBeVisible();
    await expect(page.getByTestId("scan-sort-option-cat_reuse")).toBeVisible();
    await expect(page.getByTestId("scan-sort-defective")).toHaveCount(0);
    await expect(page.getByTestId("scan-sort-leftover")).toHaveCount(0);
  });

  test("pezzo nuovo: nella finestra «Difettoso» e «Avanzo» ci sono", async ({ page }) => {
    test.setTimeout(240_000);
    const code = uniqueCode("NC");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await arrived(page, code, "new");
    await page.goto("/scan?mode=classify");
    await type(page, code);
    await expect(page.getByTestId("scan-sort-defective")).toBeVisible();
    await expect(page.getByTestId("scan-sort-leftover")).toBeVisible();
  });

  test("«Difettoso» fisso su un pezzo smontato: non si registra e la schermata dice perché", async ({ page }) => {
    test.setTimeout(240_000);
    const code = uniqueCode("NC");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await arrived(page, code, "removed");
    await page.goto("/scan?mode=classify");
    await page.getByTestId("scan-newclass-select").selectOption("defective");
    await type(page, code);
    const flash = page.getByTestId("scan-flash");
    await expect(flash).toHaveAttribute("data-tone", "danger");
    await expect(flash).toContainText(tr("scan.newClassNotForRemoved").replace("{{code}}", code).split("«")[0]);
    await expect(page.getByTestId("scan-session-count")).toHaveText("0");
    await expect(page.getByTestId("scan-session-row")).toHaveCount(0);
  });
});
