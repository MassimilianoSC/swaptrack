import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, tr } from "./helpers";

// P-222 (tester): the menu in areas. Open side bar: the title of an area with at least two entries for the role
// (Operations, To check, Registry, Configuration for the client admin), each entry under its area; reduced side bar:
// no titles, a thin line between areas; the ☰ menu of a narrow screen: the same areas. Reads only.
test.describe("Menu ad aree (scrivania)", () => {
  test("amministratore cliente: titoli delle aree con le loro voci; barra ridotta con le sole linee; menu ☰ uguale", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.clientAdmin);
    const bar = page.getByTestId("sidebar");
    for (const area of ["operations", "check", "registry", "config"]) {
      await expect(bar.getByTestId(`nav-area-${area}`)).toHaveText(tr(`nav.areas.${area}`), { timeout: 30_000 });
    }
    for (const single of ["dashboard", "documents", "reports", "guide", "home"]) await expect(bar.getByTestId(`nav-area-${single}`)).toHaveCount(0);
    // Each entry under its area.
    await expect(bar.getByTestId("nav-group-operations").getByTestId("nav-items")).toHaveCount(1);
    await expect(bar.getByTestId("nav-group-operations").getByTestId("nav-shipments")).toHaveCount(1);
    await expect(bar.getByTestId("nav-group-check").getByTestId("nav-anomalies")).toHaveCount(1);
    await expect(bar.getByTestId("nav-group-registry").getByTestId("nav-admin-organizations")).toHaveCount(1);
    await expect(bar.getByTestId("nav-group-config").getByTestId("nav-admin-log")).toHaveCount(1);

    // Reduced: no titles, one line between each two areas (nine areas for this role).
    await page.getByTestId("sidebar-toggle").click();
    await expect(bar.locator("[data-testid^='nav-area-']:not([data-testid='nav-area-sep'])")).toHaveCount(0);
    await expect(bar.getByTestId("nav-area-sep")).toHaveCount(8);
    await page.getByTestId("sidebar-toggle").click();
    await expect(bar.getByTestId("nav-area-operations")).toBeVisible();

    // The ☰ menu of a narrow screen shows the same areas.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("topbar-menu-button").click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByTestId("nav-area-registry")).toHaveText(tr("nav.areas.registry"));
    await expect(drawer.getByTestId("nav-group-registry").getByTestId("nav-admin-users")).toHaveCount(1);
  });

  test("magazzino ASP: solo le aree con più voci proprie hanno il titolo", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    const bar = page.getByTestId("sidebar");
    await expect(bar.getByTestId("nav-area-operations")).toHaveText(tr("nav.areas.operations"), { timeout: 30_000 });
    await expect(bar.getByTestId("nav-area-check")).toHaveText(tr("nav.areas.check"));
    for (const none of ["registry", "config", "dashboard", "reports"]) await expect(bar.getByTestId(`nav-area-${none}`)).toHaveCount(0);
  });
});
