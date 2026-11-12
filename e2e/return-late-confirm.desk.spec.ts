import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, emulatorSetDoc, tr } from "./helpers";
import { SEED } from "./seed";

// P-186 (tester, A9): a return confirmed with a missing piece and an extra one. SPEC §9.3: the extra piece is
// confirmed with an alert, the shipment is not complete, and a second confirmation is for the missing pieces only.
// Red before: the second «Confirm» opened the first window again with every line ticked (one click gave the missing
// piece as arrived; unticking a confirmed piece did nothing; an extra piece could be typed again), the extra pieces
// were nowhere on the shipment, and the status said only «Confirmed». Own data: a sent return of this test written
// in the emulator (two lines, E2E- codes), confirmed by the client warehouse in the app.
test.describe("Reso confermato con un mancante e un pezzo in più (scrivania)", () => {
  test("la seconda conferma è solo per i mancanti; i pezzi in più si vedono; lo stato dice che ci sono differenze", async ({ page }) => {
    test.setTimeout(180_000);
    const tag = uniqueCode("RLC");
    const S = `e2e-${tag.toLowerCase()}`;
    const [a, b, x] = [`${tag}-A`, `${tag}-B`, `${tag}-X`];
    const [la, lb] = [`${S}-a`, `${S}-b`];
    const now = new Date();
    await emulatorSetDoc(`shipments/${S}`, {
      kind: "return", fromLocationId: `loc_${SEED.nord.warehouse}`, fromAspId: "org_asp_nord", toLocationId: `loc_${SEED.clientWarehouse}`, toAspId: null,
      status: "sent", ddtNumber: tag, itemCount: 2, documentId: null, createdAt: now, sentAt: now, confirmedAt: null, confirmedComplete: null,
    });
    for (const [id, code] of [[la, a], [lb, b]]) {
      await emulatorSetDoc(`shipments/${S}/lines/${id}`, { codeRaw: code, model: null, addedAt: now, fromAspId: "org_asp_nord", toAspId: null, kind: "return" });
    }

    await signIn(page, ACCOUNTS.clientWarehouse);
    await page.goto(`/shipments/${S}`);
    // First confirmation: A arrived, B missing, X in more.
    await page.getByTestId("shipment-confirm").click();
    await page.getByTestId(`confirm-line-${lb}`).uncheck();
    await page.getByTestId("confirm-extra-input").fill(x);
    await page.getByTestId("confirm-extra-add").click();
    await page.getByTestId("confirm-save").click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 60_000 });

    // Soft checks: on the code before, every defect shows in one run (each is a separate red).
    // (c) the status says the return is not complete; (b) the extra piece is on the shipment.
    await expect.soft(page.getByText(tr("shipments.confirmedWithDifferences")).first()).toBeVisible({ timeout: 60_000 });
    await expect.soft(page.getByTestId("shipment-extra-lines")).toContainText(x);

    // (a) the second confirmation: only the missing piece, not ticked, no extra pieces.
    const confirm = page.getByTestId("shipment-confirm");
    await expect.soft(confirm).toHaveText(tr("shipments.confirmLate"));
    await confirm.click();
    await expect.soft(page.getByTestId(`confirm-line-${lb}`)).not.toBeChecked();
    await expect.soft(page.getByTestId(`confirm-line-${la}`)).toHaveCount(0);
    await expect.soft(page.getByTestId("confirm-extra-input")).toHaveCount(0);
    await expect.soft(page.getByTestId("confirm-save")).toBeDisabled(); // a click without ticking confirms nothing
    await page.getByTestId(`confirm-line-${lb}`).check();
    await page.getByTestId("confirm-save").click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 60_000 });

    // B confirmed; nothing left to confirm; still with differences (X was in more).
    await expect.soft(page.getByTestId("shipment-lines").locator("li").filter({ hasText: b })).toContainText(tr("shipments.confirmedLine"), { timeout: 60_000 });
    await expect.soft(page.getByTestId("shipment-confirm")).toHaveCount(0);
    await expect.soft(page.getByText(tr("shipments.confirmedWithDifferences")).first()).toBeVisible();

    // (c) in the list too.
    await page.goto("/shipments");
    await page.getByTestId("shipments-table-filter").fill(tag);
    await expect.soft(page.getByTestId(`shipment-status-${S}`)).toHaveText(tr("shipments.confirmedWithDifferences"), { timeout: 45_000 });
  });
});
