import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ACCOUNTS, PASSWORD, signIn, tr } from "./helpers";

// P-117 (census of 03/11/2026, section 11): what an admin meets on the admin pages.
// n.30 the ASP admin's action menu only on the rows the server lets it manage (§3.3: warehouse workers and technicians
//      of its own ASP); n.32 every admin log action has a text; n.35 the password fields empty after a change.
// Tests that write use their own data (an own account, an own log entry), created with the Admin SDK on the emulators.
const EMU = (JSON.parse(readFileSync(new URL("../firebase.json", import.meta.url), "utf8")) as { emulators: Record<string, { port: number }> }).emulators;
const ENV = Object.fromEntries(readFileSync(new URL("../.env.development", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
async function admin() {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${EMU.auth.port}`;
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${EMU.firestore.port}`;
  const { initializeApp, getApps } = await import("firebase-admin/app");
  const app = getApps().find((a) => a.name === "e2e-admin-pages") ?? initializeApp({ projectId: ENV.VITE_FIREBASE_PROJECT_ID }, "e2e-admin-pages");
  const { getAuth } = await import("firebase-admin/auth");
  const { getFirestore, Timestamp } = await import("firebase-admin/firestore");
  return { auth: getAuth(app), db: getFirestore(app), Timestamp };
}
// An account of this test only, with the given role (the privacy notice is accepted by signIn).
async function ownAccount(role: string, orgId: string, name: string) {
  const { auth, db } = await admin();
  const email = `e2e.${name}.${Date.now()}@swaptrack-demo.test`;
  const { uid } = await auth.createUser({ email, password: PASSWORD, emailVerified: true });
  const claims = { role, orgId, active: true, disabledAt: null };
  await auth.setCustomUserClaims(uid, claims);
  await db.collection("users").doc(uid).set({ email, firstName: "Prova", lastName: name, language: "it", privacyNoticeVersion: null, privacyAcceptedAt: null, ...claims });
  return { uid, email };
}

test.describe("Pagine di amministrazione (scrivania)", () => {
  test("persone: l'admin di ASP Nord ha il menu azioni solo su magazzinieri e tecnici della sua ASP", async ({ page }) => {
    await signIn(page, ACCOUNTS.aspAdminNord);
    await page.goto("/people");
    const rows = page.getByTestId("users-table-row");
    await expect(rows.first()).toBeVisible();
    const actions = (email: string) => rows.filter({ hasText: email }).locator('[data-testid^="user-actions-"]');
    await expect(actions(ACCOUNTS.aspAdminNord)).toHaveCount(0); // itself, an admin: the server refuses every action
    await expect(actions("asp.warehouse.nord@")).toHaveCount(1);
    await expect(actions("asp.technician.nord@")).toHaveCount(1);
  });

  test("registro: le azioni del server hanno un testo, mai il codice", async ({ page }) => {
    const { db, Timestamp } = await admin();
    const at = Timestamp.now();
    const actions = ["document_saved", "items_merged", "event_location_corrected", "anomaly_resolved"];
    for (const a of actions) await db.collection("adminLog").doc(`e2e-${a}-${Date.now()}`).set({ actor: "e2e", action: a, target: null, at, details: {} });
    await signIn(page, ACCOUNTS.clientAdmin);
    await page.goto("/admin/log");
    const table = page.getByTestId("admin-log-table");
    for (const a of actions) {
      await expect(table).toContainText(tr(`adminLog.actions.${a}`));
      await expect(table).not.toContainText(a);
    }
  });

  test("smistamento: modificando una categoria o una regola il titolo dice «Modifica», non «Nuova»", async ({ page }) => {
    await signIn(page, ACCOUNTS.clientAdmin);
    await page.goto("/admin/sorting");
    await page.getByTestId("sorting-edit-category-cat_refurbish").click();
    await expect(page.getByRole("dialog")).toContainText(tr("sorting.editCategory"));
    await page.keyboard.press("Escape");
    await page.getByTestId("sorting-edit-rule-rule_type_radio").click();
    await expect(page.getByRole("dialog")).toContainText(tr("sorting.editRule"));
    await page.keyboard.press("Escape");
    await page.getByTestId("sorting-new-category").click();
    await expect(page.getByRole("dialog")).toContainText(tr("sorting.newCategory"));
  });

  test("profilo: dopo il cambio della password i due campi sono vuoti", async ({ page }) => {
    const { email } = await ownAccount("asp_warehouse", "org_asp_nord", "profilo");
    await signIn(page, email);
    await page.goto("/profile");
    await page.getByTestId("profile-current-password").fill(PASSWORD);
    await page.getByTestId("profile-new-password").fill("Cambiata2026e2e");
    await page.getByTestId("profile-change-password-button").click();
    await expect(page.getByText(tr("profile.passwordChanged")).first()).toBeVisible();
    await expect(page.getByTestId("profile-current-password")).toHaveValue("");
    await expect(page.getByTestId("profile-new-password")).toHaveValue("");
  });

  test("esportazioni: un export troncato dal server lo dice nella sua riga (n.36)", async ({ page }) => {
    const { uid, email } = await ownAccount("client_office", "org_client", "export");
    const { db, Timestamp } = await admin();
    const id = `e2e-trunc-${Date.now()}`;
    await db.collection("exports").doc(id).set({ scope: "client", filter: {}, language: "it", path: `exports/client/${id}.xlsx`, rowCount: 10000, truncated: true, createdAt: Timestamp.now(), createdBy: uid });
    await db.collection("exports").doc(`${id}-full`).set({ scope: "client", filter: {}, language: "it", path: `exports/client/${id}-full.xlsx`, rowCount: 12, truncated: false, createdAt: Timestamp.now(), createdBy: uid });
    await signIn(page, email);
    await page.goto("/exports");
    await expect(page.getByTestId(`exports-truncated-${id}`)).toContainText(tr("exports.truncatedShort"));
    await expect(page.getByTestId(`exports-truncated-${id}-full`)).toHaveCount(0);
  });
});
