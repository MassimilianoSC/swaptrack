import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, tr } from "./helpers";

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
});
