import { test, expect, type Page, type Route } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, tr, emulatorSetDoc } from "./helpers";
import { SEED } from "./seed";

// P-207 (census of the roles, group 3): pages that never said what went wrong.
// 1) a shipment that does not exist, or another ASP's: "Shipment not found." with "Back" (it stayed on "Loading…");
// 2) "Forgot password?" offline: "You are offline…" (it said the e-mail was on its way);
// 3) "Invite user" and "New ASP" open empty again after an invitation (they kept the person just invited);
// 4) "Sorting" with the server not reached: the error with "Retry" (it stayed on "Loading…" or showed empty lists).
// Nothing shared is written: the invitations are answered here without the server; the other tests only read.
const fns = (url: URL) => url.pathname.startsWith("/__functions");
async function answer(page: Page, op: string, result: unknown): Promise<void> {
  await page.route(fns, async (r: Route) => {
    if (r.request().method() !== "POST" || !(r.request().postData() ?? "").includes(`"op":"${op}"`)) return r.fallback();
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result }) });
  });
}

test.describe("Stati d'errore e finestre che si riaprono vuote (scrivania)", () => {
  test("spedizione inesistente o di un'altra ASP: «Spedizione non trovata.» e «Indietro»", async ({ page }) => {
    test.setTimeout(120_000);
    // Another ASP's shipment, own data: a Centro transfer draft, which the rules do not let the Nord read.
    const centro = `e2e-${uniqueCode("shc").toLowerCase()}`;
    await emulatorSetDoc(`shipments/${centro}`, {
      kind: "transfer", fromAspId: SEED.centro.orgId, toAspId: SEED.centro.orgId, fromLocationId: `loc_${SEED.centro.warehouse}`, toLocationId: "loc_MAG-CENTRO-02",
      status: "draft", itemCount: 0, ddtNumber: null, documentId: null, createdBy: "e2e", createdAt: new Date(), sentAt: null, confirmedAt: null, receivedAt: null, confirmedComplete: null,
    });
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    for (const id of [`missing-${uniqueCode("SH").toLowerCase()}`, centro]) {
      await page.goto(`/shipments/${id}`);
      await expect(page.getByText(tr("errors.shipment_not_found"))).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("page-back")).toBeVisible();
    }
  });

  test("«Password dimenticata?» senza rete: dice che manca la rete, non che l'e-mail parte", async ({ page, context }) => {
    test.setTimeout(60_000);
    await page.goto("/forgot");
    await page.getByTestId("forgot-email-input").fill(`${uniqueCode("pw").toLowerCase()}@example.test`);
    await context.setOffline(true);
    await page.getByTestId("forgot-submit-button").click();
    await expect(page.getByTestId("forgot-error")).toHaveText(tr("errors.offline"), { timeout: 30_000 });
    await expect(page.getByTestId("forgot-sent-message")).toHaveCount(0);
    await context.setOffline(false);
  });

  test("«Invita utente» e «Nuova ASP» si riaprono vuote dopo un invito", async ({ page }) => {
    test.setTimeout(120_000);
    await answer(page, "inviteUser", { delivered: "email" });
    await answer(page, "createAsp", { admin: { delivered: "email" } });
    await signIn(page, ACCOUNTS.clientAdmin);

    await page.goto("/admin/users");
    await page.getByTestId("users-invite-button").click();
    await page.getByTestId("invite-org-select").selectOption({ index: 1 });
    await page.getByTestId("invite-role-select").selectOption({ index: 1 });
    await page.getByTestId("invite-first-name").fill("Prova");
    await page.getByTestId("invite-last-name").fill("Invito");
    await page.getByTestId("invite-email").fill(`${uniqueCode("inv").toLowerCase()}@example.test`);
    await page.getByTestId("invite-submit").click();
    await expect(page.getByTestId("invite-submit")).toHaveCount(0, { timeout: 30_000 });
    await page.keyboard.press("Escape"); // the result window
    await page.getByTestId("users-invite-button").click();
    await expect(page.getByTestId("invite-first-name")).toHaveValue("");
    await expect(page.getByTestId("invite-email")).toHaveValue("");
    await expect(page.getByTestId("invite-role-select")).toHaveValue("");
    await page.keyboard.press("Escape");

    await page.goto("/admin/organizations");
    await page.getByTestId("orgs-create-asp-button").click();
    await page.getByTestId("create-asp-name").fill(`ASP ${uniqueCode("P")}`);
    await page.getByTestId("create-asp-admin-first").fill("Prova");
    await page.getByTestId("create-asp-admin-last").fill("Admin");
    await page.getByTestId("create-asp-admin-email").fill(`${uniqueCode("asp").toLowerCase()}@example.test`);
    await page.getByTestId("create-asp-submit").click();
    await expect(page.getByTestId("create-asp-submit")).toHaveCount(0, { timeout: 30_000 });
    await page.keyboard.press("Escape");
    await page.getByTestId("orgs-create-asp-button").click();
    await expect(page.getByTestId("create-asp-name")).toHaveValue("");
    await expect(page.getByTestId("create-asp-admin-email")).toHaveValue("");
  });

  test("«Smistamento» senza il server: il messaggio d'errore con «Riprova»", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.clientAdmin);
    await page.route((url) => url.pathname.includes("google.firestore"), (r) => r.abort());
    await page.goto("/admin/sorting");
    await expect(page.getByText(tr("errors.load_failed")).or(page.getByText(tr("errors.offlineUnavailable"))).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("state-error-retry")).toBeVisible();
    await expect(page.getByTestId("sorting-new-category")).toHaveCount(0);
  });
});
