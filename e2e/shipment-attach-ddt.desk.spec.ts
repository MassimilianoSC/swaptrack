import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, uniqueCode, tr, emulatorRead } from "./helpers";
import { SEED } from "./seed";

// P-200: "Attach DDT file" on a return without a DDT number asks for the number first (it was made up as "R-xxxxxx" and
// became the shipment's DDT number); a second file is a new version of the same document (every file made a new one);
// a number changed in "Send" renames the document too, so document and shipment always carry the same number.
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% ${name}\n%%EOF\n`) });

test.describe("File DDT di un reso (scrivania)", () => {
  test("il numero DDT si chiede prima; gli allegati dopo aggiornano lo stesso documento; «Invia» tiene i numeri uguali", async ({ page }) => {
    test.setTimeout(240_000);
    const [n1, n2] = [uniqueCode("DDTA"), uniqueCode("DDTB")];
    await signIn(page, ACCOUNTS.aspWarehouseNord);
    await page.goto("/shipments");
    await page.getByTestId("shipments-new-return").click();
    await page.getByTestId("shipments-from-select").selectOption(`loc_${SEED.nord.warehouse}`);
    await page.getByTestId("shipments-to-select").selectOption(`loc_${SEED.clientWarehouse}`);
    await page.getByTestId("shipments-create").click();
    await expect(page).toHaveURL(/\/shipments\/[^/]+$/, { timeout: 30_000 });
    const id = page.url().split("/").pop()!;

    // First file: the DDT number is asked, then the document is made with it.
    await page.getByTestId("shipment-attach-ddt").setInputFiles(pdf("ddt-1.pdf"));
    await page.getByTestId("shipment-attach-number").fill(n1);
    await page.getByTestId("shipment-attach-save").click();
    await expect(page.getByText(tr("documents.attached")).first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await emulatorRead(`shipments/${id}`)).ddtNumber, { timeout: 30_000 }).toBe(n1);
    const docId = (await emulatorRead(`shipments/${id}`)).documentId as string;
    expect((await emulatorRead(`documents/${docId}`)).number).toBe(n1);

    // Second file: no question, the same document gets it (a new version, both files).
    await page.getByTestId("shipment-attach-ddt").setInputFiles(pdf("ddt-2.pdf"));
    await expect(page.getByTestId("shipment-attach-number")).toHaveCount(0);
    await expect.poll(async () => ((await emulatorRead(`documents/${docId}`)).files as unknown[] | undefined)?.length ?? 0, { timeout: 30_000 }).toBe(2);
    expect((await emulatorRead(`shipments/${id}`)).documentId).toBe(docId);

    // "Send": the number is already there; changed, the document takes the new one too.
    await page.getByTestId("shipment-send").click();
    await expect(page.getByTestId("shipment-ddt-input")).toHaveValue(n1);
    await page.getByTestId("shipment-ddt-input").fill(n2);
    await page.getByTestId("shipment-send-save").click();
    await expect(page.getByTestId("shipment-send")).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(async () => (await emulatorRead(`documents/${docId}`)).number, { timeout: 30_000 }).toBe(n2);
    expect((await emulatorRead(`shipments/${id}`)).ddtNumber).toBe(n2);
    expect(((await emulatorRead(`documents/${docId}`)).files as unknown[]).length).toBe(2);
  });
});
