import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, tr, uniqueCode } from "./helpers";

// D-58 B3: a document or a piece that cannot be read says why ("not available without network", "document not found"),
// never "Loading" for ever. The pages are opened inside the app (no reload without network).
const openInApp = (page: Page, path: string) => page.evaluate((p) => { history.pushState({}, "", p); dispatchEvent(new PopStateEvent("popstate")); }, path);

test.describe("Pagine che non si possono leggere (scrivania)", () => {
  test("documento inesistente con la rete: «non trovato»; senza rete documento e pezzo: «non disponibile»", async ({ page, context }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspAdminNord);
    await openInApp(page, "/documents/e2e-documento-che-non-esiste");
    await expect(page.getByText(tr("errors.document_not_found"))).toBeVisible({ timeout: 30_000 });

    await context.setOffline(true);
    await openInApp(page, "/documents/e2e-altro-documento-mai-letto");
    await expect(page.getByText(tr("errors.offlineUnavailable"))).toBeVisible({ timeout: 30_000 });
    await openInApp(page, "/items/e2e-pezzo-mai-letto");
    await expect(page.getByText(tr("errors.offlineUnavailable"))).toBeVisible({ timeout: 30_000 });
    await context.setOffline(false);
  });

  // D-58 B1 and B2: without network the desk pages say that the data may be old, and the code search says "not
  // available without network" instead of "not found" (a code never read cannot be checked). Back online: "not found".
  test("senza rete: striscia «Sei offline» e ricerca per codice «non disponibile»; con la rete «non trovato»", async ({ page, context }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspAdminNord);
    await openInApp(page, "/items");
    await expect(page.getByTestId("items-search-input")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("desk-offline-strip")).toHaveCount(0);
    const code = uniqueCode("OFF");

    await context.setOffline(true);
    await expect(page.getByTestId("desk-offline-strip")).toHaveText(tr("status.offlineStrip"));
    await page.getByTestId("items-search-input").fill(code);
    await page.getByTestId("items-search-submit").click();
    await expect(page.getByText(tr("errors.offlineUnavailable"))).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(tr("items.notFound"))).toHaveCount(0);

    await context.setOffline(false);
    await expect(page.getByTestId("desk-offline-strip")).toHaveCount(0);
    await page.getByTestId("items-search-submit").click();
    await expect(page.getByText(tr("items.notFound"))).toBeVisible({ timeout: 30_000 });
  });
});
