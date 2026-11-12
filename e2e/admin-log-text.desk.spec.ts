import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, emulatorSetDoc, tr } from "./helpers";

// P-184 (tester, C12): in the admin log a column showed {"kind":"bom","number":"111","version":2}. Expected: plain
// words, never codes. Own data: an ASP and a person of this test, and log entries written in the emulator as the
// server writes them (functions/src/routers/*), all made by that person, so the filter on its name finds only them.
const fill = (key: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{{${k}}}`, String(v)), tr(key));

test.describe("Registro amministrativo in parole (scrivania)", () => {
  test("ogni voce dice oggetto e dettagli a parole, senza codici né parentesi", async ({ page }) => {
    test.setTimeout(120_000);
    const tag = uniqueCode("LOG");
    const orgId = `e2e-${tag.toLowerCase()}`, orgName = `E2E Org ${tag}`;
    const uid = `${orgId}-person`, person = `Nome ${tag}`;
    const now = Date.now();
    await emulatorSetDoc(`organizations/${orgId}`, { name: orgName, type: "asp", language: "it", active: true, createdAt: new Date(now) });
    await emulatorSetDoc(`users/${uid}`, {
      email: `${uid}@swaptrack-demo.test`, firstName: "Nome", lastName: tag, role: "asp_technician", orgId, active: true, deleted: false, language: "it", createdAt: new Date(now),
    });
    const entries: Array<[string, string | null, Record<string, unknown>]> = [
      ["document_saved", `${orgId}-doc`, { kind: "bom", number: tag, version: 2 }],
      ["role_changed", uid, { from: "asp_technician", to: "asp_warehouse" }],
      ["user_created", uid, { role: "asp_technician", orgId }],
      ["organization_language_changed", orgId, { language: "en" }],
      ["settings_changed", "settings/branding", {}],
      ["anomaly_resolved", `${orgId}-anomaly`, { type: "late_event", action: "accept_move" }],
    ];
    for (const [i, [action, target, details]] of entries.entries()) {
      await emulatorSetDoc(`adminLog/${orgId}-${i}`, { actor: uid, action, target, details, at: new Date(now - i * 1000) });
    }

    await signIn(page, ACCOUNTS.clientAdmin);
    await page.goto("/admin/log");
    await page.getByTestId("admin-log-table-filter").fill(tag);
    const rows = page.getByTestId("admin-log-table-row");
    await expect(rows).toHaveCount(entries.length, { timeout: 45_000 });
    const row = (action: string) => rows.filter({ hasText: tr(`adminLog.actions.${action}`) });

    await expect(row("document_saved")).toContainText(fill("adminLog.document", { kind: tr("documents.kinds.bom"), number: tag }));
    await expect(row("document_saved")).toContainText(fill("adminLog.d.version", { version: 2 }));
    await expect(row("role_changed")).toContainText(fill("adminLog.d.roleChange", { from: tr("roles.asp_technician"), to: tr("roles.asp_warehouse") }));
    await expect(row("user_created")).toContainText(fill("adminLog.d.roleOrg", { role: tr("roles.asp_technician"), org: orgName }));
    await expect(row("organization_language_changed")).toContainText(orgName);
    await expect(row("organization_language_changed")).toContainText(fill("adminLog.d.language", { language: tr("adminLog.languages.en") }));
    await expect(row("settings_changed")).toContainText(fill("adminLog.settingsTarget", { name: tr("settings.tabs.branding") }));
    await expect(row("anomaly_resolved")).toContainText(fill("adminLog.d.anomaly", { type: tr("anomalies.types.late_event"), choice: tr("adminLog.choices.accept_move") }));
    for (const r of await rows.all()) await expect(r).toContainText(person);

    // Nothing as it is stored: no braces or JSON quotes, no ids.
    const table = page.getByTestId("admin-log-table");
    for (const code of ["{", "\"", "kind", "asp_technician", "late_event", "accept_move", "settings/", `${orgId}-doc`, `${orgId}-anomaly`, uid]) {
      await expect(table).not.toContainText(code);
    }
  });
});
