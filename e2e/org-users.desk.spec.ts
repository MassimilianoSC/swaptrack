import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, emulatorSetDoc, tr } from "./helpers";

// P-180 (tester): the users inside each organization. In «Organizations» each row says how many users the organization
// has (active of total, the deleted ones left out) and a click on the row opens its users only, with «Invite user»
// already set on that organization. Own data: an ASP of the test with two active users and one deactivated, written in
// the emulator (no Auth accounts needed: the pages read the profiles).
test.describe("Organizzazioni e i loro utenti (scrivania)", () => {
  test("ogni organizzazione dice quanti utenti ha; il clic apre solo i suoi, con l'invito già su di lei", async ({ page }) => {
    test.setTimeout(180_000);
    const tag = uniqueCode("ORG").toLowerCase();
    const orgId = `e2e-${tag}`, name = `E2E Org ${tag}`;
    const now = new Date();
    await emulatorSetDoc(`organizations/${orgId}`, { name, type: "asp", language: "it", active: true, createdAt: now });
    const people = [["a", true, false], ["b", true, false], ["c", false, false], ["d", true, true]] as const; // d: deleted
    for (const [k, active, deleted] of people) {
      await emulatorSetDoc(`users/${orgId}-${k}`, {
        email: `${orgId}-${k}@swaptrack-demo.test`, firstName: `Nome${k}`, lastName: `E2E ${tag}`, role: "asp_technician", orgId,
        active, deleted, language: "it", createdAt: now, ...(active ? {} : { disabledAt: now.getTime() }),
      });
    }

    await signIn(page, ACCOUNTS.clientAdmin);
    await page.goto("/admin/organizations");
    await page.getByTestId("orgs-table-filter").fill(name);
    const row = page.getByTestId("orgs-table-row").filter({ hasText: name });
    await expect(row).toHaveCount(1, { timeout: 45_000 });
    // Two active of three (the deleted one does not count).
    const count = tr("orgs.userCount").replace("{{active}}", "2").replace("{{total}}", "3");
    await expect(page.getByTestId(`org-users-${orgId}`)).toHaveText(count, { timeout: 30_000 });

    // A click on the row (its name) opens the users of that organization only.
    await row.locator("td").first().click();
    await expect(page).toHaveURL(new RegExp(`/admin/users\\?org=${orgId}$`));
    await expect(page.getByTestId("page-title")).toHaveText(tr("users.ofOrg").replace("{{name}}", name));
    const rows = page.getByTestId("users-table-row");
    await expect(rows).toHaveCount(3, { timeout: 30_000 });
    for (const k of ["a", "b", "c"]) await expect(rows.filter({ hasText: `${orgId}-${k}@` })).toHaveCount(1);
    await expect(rows.filter({ hasText: ACCOUNTS.clientAdmin })).toHaveCount(0);
    await expect(page.getByTestId("users-table-sort-org")).toHaveCount(0); // one organization: no column for it

    // «Invite user» starts on that organization.
    await page.getByTestId("users-invite-button").click();
    await expect(page.getByTestId("invite-org-select")).toHaveValue(orgId);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Back to the organizations; «Users» in the menu still lists everyone, with the organization column.
    await page.getByTestId("page-back").click();
    await expect(page).toHaveURL(/\/admin\/organizations$/);
    await page.getByTestId("nav-admin-users").click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByTestId("users-table-sort-org")).toHaveCount(1);
    await expect(page.getByTestId("page-title")).toHaveText(tr("nav.users"));
  });
});
