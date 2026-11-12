import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, tr } from "./helpers";

// P-190 (tester, A11): «Exports» and «Reports» in one page. One menu entry, two tabs; the old address /reports opens
// the reports tab. The roles do not change: the client office and the ASP admin both see the page. Reads only.
test.describe("Esportazioni e rapporti in una pagina (scrivania)", () => {
  test("una sola voce di menu, due schede; /reports apre la scheda dei rapporti", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.clientOffice);
    await expect(page.getByTestId("nav-exports")).toContainText(tr("nav.exportsReports"));
    await expect(page.getByTestId("nav-reports")).toHaveCount(0);

    await page.getByTestId("nav-exports").click();
    await expect(page).toHaveURL(/\/exports$/);
    await expect(page.getByTestId("page-title")).toHaveText(tr("nav.exportsReports"));
    await expect(page.getByTestId("exports-create")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("reports-generate")).toHaveCount(0);

    await page.getByTestId("exports-tab-reports").click();
    await expect(page).toHaveURL(/\/exports\?tab=reports$/);
    await expect(page.getByTestId("reports-generate")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("exports-create")).toHaveCount(0);

    await page.goto("/reports");
    await expect(page).toHaveURL(/\/exports\?tab=reports$/);
    await expect(page.getByTestId("exports-tab-reports")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("reports-generate")).toBeVisible({ timeout: 30_000 });
  });

  test("l'amministratore ASP vede la stessa voce e le due schede", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspAdminNord);
    await expect(page.getByTestId("nav-exports")).toContainText(tr("nav.exportsReports"));
    await page.getByTestId("nav-exports").click();
    await expect(page.getByTestId("exports-create")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("exports-tab-reports").click();
    await expect(page.getByText(tr("reports.subtitle"))).toBeVisible({ timeout: 30_000 });
  });
});
