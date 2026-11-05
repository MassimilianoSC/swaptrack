import { test, expect } from "@playwright/test";
import { tr, emulatorPatchSetting } from "./helpers";

// D-70: the Google and Microsoft sign-in buttons show the provider's logo (inline SVG, original colours) on the left of
// the text; the logo is decorative, so the button's accessible name stays the text. The two providers are switched on
// for the test only and switched off again.
test.describe("Accesso con Google e Microsoft: logo del fornitore (scrivania)", () => {
  test("i pulsanti hanno il logo e il loro nome resta il testo", async ({ page }) => {
    await emulatorPatchSetting("auth", { google: true, microsoft: true });
    try {
      await page.goto("/signin");
      for (const [id, key, logo] of [["signin-google-button", "auth.withGoogle", "logo-google"], ["signin-microsoft-button", "auth.withMicrosoft", "logo-microsoft"]] as const) {
        const button = page.getByTestId(id);
        await expect(button).toBeVisible({ timeout: 30_000 });
        const svg = button.locator(`svg[data-testid="${logo}"]`);
        await expect(svg).toHaveCount(1);
        await expect(svg).toHaveAttribute("aria-hidden", "true");
        await expect(page.getByRole("button", { name: tr(key), exact: true })).toBeVisible();
        // On the left of the text: the logo starts before the text does.
        const [logoBox, buttonBox] = [await svg.boundingBox(), await button.boundingBox()];
        expect(logoBox!.x - buttonBox!.x).toBeLessThan(buttonBox!.width / 2);
      }
    } finally {
      await emulatorPatchSetting("auth", { google: false, microsoft: false });
    }
  });
});
