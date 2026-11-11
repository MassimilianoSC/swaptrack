import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, tr } from "./helpers";

// P-181: a refusal of the server reached the user as «Errore imprevisto. Riprova.» (the Firebase client adds the HTTP
// status to the code: "email_exists [409]"). Inviting an e-mail that already has an account (a seed account) must say
// so. Nothing is created: the server refuses before writing.
test.describe("Errori del server con il loro testo (scrivania)", () => {
  test("invitare un'e-mail che ha già un account dice che esiste già, non «Errore imprevisto»", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.clientAdmin);
    await page.goto("/admin/users");
    await page.getByTestId("users-invite-button").click();
    await page.getByTestId("invite-org-select").selectOption("org_asp_nord", { timeout: 30_000 });
    await page.getByTestId("invite-role-select").selectOption("asp_technician");
    await page.getByTestId("invite-first-name").fill("Prova");
    await page.getByTestId("invite-last-name").fill("Già invitata");
    await page.getByTestId("invite-email").fill(ACCOUNTS.aspWarehouseNord);
    await page.getByTestId("invite-submit").click();
    await expect(page.getByText(tr("errors.email_exists"))).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(tr("errors.unexpected"))).toHaveCount(0);
  });
});
