import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation } from "./helpers";
import { SEED } from "./seed";

// P-155 (D-72): the video of the scanning screen was a 16:9 strip (197 px high on a 390×844 phone, with a frame 79 px
// high): a third of what the camera sees, and the label had to be fitted into a slit. On a phone held upright it now
// takes the free height of the first screen, and the frame is as large as in the previous app (about 288×176). The
// commands stay in the first screen with room for "Read the next" (P-134). Nothing is written.
const SCREEN = { width: 390, height: 844 };
test.use({ viewport: SCREEN });
const NEXT_BUTTON = 72; // "Read the next" and its gap appear between the video and the commands after a camera reading

const box = async (page: Page, testId: string) => (await page.getByTestId(testId).boundingBox())!;
async function commandsInFirstScreen(page: Page): Promise<void> {
  for (const id of ["scan-undo", "scan-photo-button"]) {
    const b = await box(page, id);
    expect(b.y + b.height + NEXT_BUTTON, id).toBeLessThanOrEqual(SCREEN.height);
  }
}

test.describe("Video più alto nella schermata di lettura (telefono in verticale)", () => {
  test("Smonta: il video occupa più di metà schermo e il mirino è grande; i comandi restano nel primo schermo", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspTechnicianNord);
    await pickLocation(page, SEED.nord.site);
    await page.goto("/scan?mode=remove_at_site");
    await expect(page.getByTestId("scan-manual-input")).toBeAttached({ timeout: 60_000 });
    const video = await box(page, "scan-video-box");
    expect(video.height).toBeGreaterThan(SCREEN.height / 2);
    const aim = await box(page, "scan-aim");
    expect(aim.width).toBeGreaterThanOrEqual(280);
    expect(aim.height).toBeGreaterThanOrEqual(170);
    await commandsInFirstScreen(page);
  });

  test("Arrivo smontato con smistamento, la schermata più piena: il video cresce e i comandi restano nel primo schermo", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    await page.getByTestId("scan-flow-select").selectOption("removed");
    await page.getByTestId("scan-sort-now").check();
    await expect(async () => {
      const video = await box(page, "scan-video-box");
      expect(video.height).toBeGreaterThan(220);
      await commandsInFirstScreen(page);
    }).toPass({ timeout: 15_000 });
  });

  test("in orizzontale il video resta 16:9", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, ACCOUNTS.aspTechnicianNord);
    await pickLocation(page, SEED.nord.site);
    await page.goto("/scan?mode=remove_at_site");
    await expect(page.getByTestId("scan-manual-input")).toBeAttached({ timeout: 60_000 });
    await page.setViewportSize({ width: SCREEN.height, height: SCREEN.width });
    await expect(async () => {
      const video = await box(page, "scan-video-box");
      expect(video.height / video.width).toBeGreaterThan(0.54);
      expect(video.height / video.width).toBeLessThan(0.58);
    }).toPass({ timeout: 15_000 });
  });
});
