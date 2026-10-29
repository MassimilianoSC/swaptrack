import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr } from "./helpers";
import { SEED } from "./seed";

// Demo path 2 (DA_FARE P-6), burst part (P-20, REGISTRO D-11): many pieces in a row at the ASP warehouse
// without leaving the camera. Writes its own pieces (E2E- codes) as the Nord warehouse worker.
// The DDT part of the path (document, arrived / missing / unexpected, "checked") comes in a later commit.
test.describe("Percorso 2 — raffica in magazzino (telefono)", () => {
  test("tre letture: «3» e tre righe sotto la fotocamera; annulla l'ultima: «2» e un void", async ({ page }) => {
    test.setTimeout(150_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("new");
    const codes = [uniqueCode("B"), uniqueCode("B"), uniqueCode("B")];
    for (const c of codes) await scanManual(page, c);

    const count = page.getByTestId("scan-session-count");
    const rows = page.getByTestId("scan-session-row");
    await expect(count).toHaveText("3");
    await expect(rows).toHaveCount(3);
    // Newest first; every row shows the code and its outcome.
    await expect(rows.nth(0)).toContainText(codes[2]);
    await expect(rows.nth(2)).toContainText(codes[0]);
    const outcome = new RegExp(`${tr("scan.sent")}|${tr("scan.waiting")}`);
    for (let i = 0; i < 3; i++) await expect(rows.nth(i)).toContainText(outcome);
    // The list never covers the camera: it sits below the video box.
    const video = await page.getByTestId("scan-video").boundingBox();
    const list = await page.getByTestId("scan-session").boundingBox();
    expect(video && list && list.y >= video.y + video.height).toBe(true);

    // Undo the last reading: its row goes, the counter drops, a void is written and the server marks the reading as undone.
    await page.getByTestId("scan-undo").click();
    await expect(count).toHaveText("2");
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId("scan-session")).not.toContainText(codes[2]);
    const undone = page.getByTestId("scan-today-row").filter({ hasText: codes[2] });
    await expect(undone.getByTestId("scan-today-voided")).toBeVisible({ timeout: 60_000 });
    // All three readings reached the server.
    for (const c of codes) await expect(page.getByTestId("scan-today-row").filter({ hasText: c })).toContainText(tr("scan.sent"), { timeout: 60_000 });
  });
});
