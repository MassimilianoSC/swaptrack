import { test, expect, type Route } from "@playwright/test";
import { ACCOUNTS, signIn, tr } from "./helpers";

// P-202: Settings › Privacy, "Ask everyone to accept again" goes back off once saved: it stayed ticked, and a second save
// in the same visit asked everyone again. The save is answered here without the server: a real new version of the
// privacy notice would stop every other test at the notice.
test.describe("Impostazioni › Privacy (scrivania)", () => {
  test("«Chiedi a tutti di accettare di nuovo» torna spenta dopo il salvataggio", async ({ page }) => {
    test.setTimeout(120_000);
    const saved: string[] = [];
    const fake = async (r: Route) => {
      const body = r.request().postData() ?? "";
      if (r.request().method() !== "POST" || !body.includes("\"op\":\"saveSettings\"")) return r.fallback();
      saved.push(body);
      await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { ok: true } }) });
    };
    // The app calls the functions at /__functions on the emulators (src/lib/data/firebase.ts).
    await page.route((url) => url.pathname.startsWith("/__functions"), fake);
    await signIn(page, ACCOUNTS.clientAdmin);
    await page.goto("/admin/settings");
    await page.getByTestId("settings-tab-privacy").click();
    const bump = page.getByTestId("settings-privacy-bump");
    await bump.check();
    await page.getByTestId("settings-privacy-save").click();
    await expect(page.getByText(tr("common.saved")).first()).toBeVisible({ timeout: 30_000 });
    expect(saved.length).toBe(1);
    expect(saved[0]).toContain("\"bumpVersion\":true");
    await expect(bump).not.toBeChecked();
  });
});
