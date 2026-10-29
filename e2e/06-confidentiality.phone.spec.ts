import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, tr } from "./helpers";
import { SEED } from "./seed";

// Demo path 6 (DA_FARE P-6), on the phone: the technician of ASP Centro can pick only the sites of Centro (SPEC §5).
// Read-only: nothing is written.
test.describe("Percorso 6 — riservatezza: tecnico di Centro (telefono)", () => {
  test("il selettore dei siti non ha i siti di Nord", async ({ page }) => {
    await signIn(page, ACCOUNTS.aspTechnicianCentro);
    await expect(page.getByTestId("shell-field")).toBeVisible();
    await page.goto("/");
    const search = page.getByTestId("site-picker-search");
    await search.fill(SEED.nord.site);
    await expect(page.getByText(tr("common.noResults")).first()).toBeVisible();
    await expect(page.getByTestId("site-picker-item")).toHaveCount(0);
    await search.fill(SEED.centro.site);
    await expect(page.getByTestId("site-picker-item").filter({ hasText: SEED.centro.site })).toBeVisible();
  });
});
