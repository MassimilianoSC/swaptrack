import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, uniqueCode, tr, emulatorSetDoc } from "./helpers";
import { SEED } from "./seed";

// P-164: a "Search DDT" box next to the DDT menu of "Scan": the menu keeps the open DDTs whose number matches (case,
// spaces, dashes and slashes do not count), with the date each was uploaded; nothing is chosen by the search (P-24);
// the DDT chosen stays in the menu; "No DDT with «…»" when nothing matches. A closed DDT is never in the menu. Own DDTs
// of the Nord warehouse (E2E- numbers), written in the emulator.
async function ownDdt(number: string, status = "open"): Promise<string> {
  const id = `e2e-${uniqueCode("DDS").toLowerCase()}`;
  const now = new Date();
  await emulatorSetDoc(`documents/${id}`, {
    kind: "ddt_in", number, aspId: SEED.nord.orgId, locationId: `loc_${SEED.nord.warehouse}`, files: [],
    lines: [], linesSource: "manual", version: 1, status, createdAt: now, updatedAt: now, history: [], duplicateOf: null, shipmentId: null,
  });
  return id;
}
const options = (page: Page) => page.getByTestId("scan-ddt-select").locator("option");

test.describe("Ricerca nel menù dei DDT (telefono)", () => {
  test("cerco con spazi e barre al posto dei trattini: restano i DDT giusti, con la data; la scelta resta mia", async ({ page }) => {
    test.setTimeout(180_000);
    const base = uniqueCode("DS"); // E2E-DS-…
    const [a1, a2, b1] = [`${base}/A-1`, `${base}/A-2`, `${base}/B-1`];
    const [idA1, idA2, idB1] = [await ownDdt(a1), await ownDdt(a2), await ownDdt(b1)];
    const closed = await ownDdt(`${base}/A-3`, "closed");
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await pickLocation(page, SEED.nord.warehouse);
    await page.goto("/scan?mode=arrive_at_warehouse");
    const select = page.getByTestId("scan-ddt-select");
    await expect(select.locator(`option[value="${idB1}"]`)).toHaveCount(1, { timeout: 60_000 });
    await expect(select.locator(`option[value="${closed}"]`)).toHaveCount(0);
    // The date of the upload next to the number.
    const today = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
    await expect(select.locator(`option[value="${idA1}"]`)).toHaveText(`DDT ${a1} · ${today}`);

    // "e2e ds … / a" in place of "E2E-DS-…/A": the two A, not B, and nothing chosen.
    await page.getByTestId("scan-ddt-search").fill(`${base.toLowerCase().replace(/-/g, " ")} / a`);
    await expect(options(page)).toHaveCount(3); // "No DDT (arrival only)" and the two A
    await expect(select.locator(`option[value="${idA1}"]`)).toHaveCount(1);
    await expect(select.locator(`option[value="${idA2}"]`)).toHaveCount(1);
    await expect(select).toHaveValue("");
    await expect(page.getByTestId("scan-ddt-nomatch")).toHaveCount(0);

    // Chosen, then a search that finds nothing: it says so, and the chosen DDT stays in the menu.
    await select.selectOption(idA2);
    await page.getByTestId("scan-ddt-search").fill("zzz-nessuno");
    await expect(page.getByTestId("scan-ddt-nomatch")).toHaveText(tr("scan.ddt.noMatch").replace("{{query}}", "zzz-nessuno"));
    await expect(select).toHaveValue(idA2);
    await expect(select.locator(`option[value="${idA2}"]`)).toHaveCount(1);

    // An empty search shows them all again.
    await page.getByTestId("scan-ddt-search").fill("");
    await expect(select.locator(`option[value="${idB1}"]`)).toHaveCount(1);
    await expect(page.getByTestId("scan-ddt-nomatch")).toHaveCount(0);
  });
});
