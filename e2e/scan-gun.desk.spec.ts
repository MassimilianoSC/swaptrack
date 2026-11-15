import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, tr, uniqueCode } from "./helpers";
import { SEED } from "./seed";

// Lot 15. P-212 (a): a scanner gun (a keyboard) types into "Gun / ring: read here"; after a button the field takes the
// keys again (after "Photo" the next gun reading was lost), but never from a field being typed in.
// P-215: "Scan" with no place chosen says what to do (it went to the Home in silence).

test.describe("Pistola e «Leggi» senza luogo (scrivania)", () => {
  test("dopo un pulsante la pistola legge ancora; non ruba la selezione a chi scrive", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    const wedge = page.getByTestId("scan-wedge-input");
    await expect(wedge).toBeFocused({ timeout: 30_000 });

    // A tick on a control of the screen, then the gun "types" a code and Enter.
    await page.getByTestId("scan-burst").click();
    // An own new piece: the reading arrives (the "unknown piece" window), closed with "Skip".
    await page.keyboard.type(uniqueCode("GUN"));
    await page.keyboard.press("Enter");
    await page.getByTestId("scan-modelpick-skip").click({ timeout: 15_000 });

    // Typing in the digits field (and searching a DDT): the selection stays there.
    const manual = page.getByTestId("scan-manual-input");
    await manual.click();
    await page.keyboard.type("ABC123");
    await expect(manual).toHaveValue("ABC123");
    await expect(manual).toBeFocused();
    const ddt = page.getByTestId("scan-ddt-search");
    await ddt.click();
    await page.keyboard.type("TD");
    await expect(ddt).toHaveValue("TD");
    await expect(wedge).toHaveValue("");
  });

  test("«Leggi» senza luogo dice di scegliere prima il sito", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspTechnicianNord);
    await page.getByTestId("scan-fab").click();
    await expect(page.getByText(tr("location.chooseSiteFirst")).first()).toBeVisible({ timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/scan/);
  });
});
