import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, tr, emulatorList } from "./helpers";
import { SEED } from "./seed";

// P-100 (with censimento n.11 and n.13): the pages show names, never internal ids, and an ASP never sees the identity of
// another ASP (criterion 1). Seeded data, read only.
const RAW_ID = /\b(loc_|org_|cat_)[A-Za-z0-9_-]+/;

test.describe("Nomi al posto degli id (scrivania)", () => {
  test("ASP Sud sul pezzo in arrivo dalla Nord: «Altra ASP», mai il suo id", async ({ page }) => {
    test.setTimeout(120_000);
    const [line] = await emulatorList(`shipments/${SEED.nord.transferNordSud}/lines`, 1);
    const itemId = line.itemId as string;
    await signIn(page, ACCOUNTS.aspAdminSud);
    await page.goto(`/items/${itemId}`);
    const asp = page.getByTestId("item-asp");
    await expect(asp).toContainText(tr("names.otherAsp"));
    await expect(asp).toContainText("→");
    await expect(page.getByTestId("main-content")).not.toContainText(RAW_ID);
  });

  test("ufficio cliente: nomi in Documenti, Spedizioni, Avvisi, Cruscotto e nella storia del pezzo; codici nel confronto", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, ACCOUNTS.clientOffice);
    const main = page.getByTestId("main-content");
    for (const [path, row] of [["/documents", "documents-table-row"], ["/shipments", "shipments-table-row"], ["/alerts", "alerts-table-row"]] as const) {
      await page.goto(path);
      await expect(page.getByTestId(row).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId(row).first()).not.toContainText("…");
      await expect(main).not.toContainText(RAW_ID);
    }
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-category").first()).toBeVisible({ timeout: 30_000 });
    await expect(main).not.toContainText(RAW_ID);

    // n.13: the history says place, organization and role of each event (never the person).
    await page.goto(`/items/${SEED.nord.itemId}`);
    await expect(page.getByTestId("item-history-who").first()).toContainText(" · ");
    await expect(main).not.toContainText(RAW_ID);

    // n.11: "Compare" lists which codes, not only how many (a seeded DDT with differences).
    await page.goto(`/documents/${SEED.nord.ddtAlertDoc}`);
    await page.getByTestId("document-compare").click();
    await expect(page.getByTestId("document-missing")).not.toHaveText("0");
    await expect(page.getByTestId("document-list-missing")).toBeVisible();
  });
});
