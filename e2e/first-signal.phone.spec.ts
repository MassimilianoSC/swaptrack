import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, signIn, pickLocation, scanManual, uniqueCode, tr, emulatorFindOne } from "./helpers";
import { SEED } from "./seed";

// P-155 (D-72). A reading gives a signal as soon as the code is seen, before the phone asks the server about the piece:
// before, sound and flash came after up to 4 s of server, and the two windows gave none at all. The first signal is
// white and says only "seen"; green comes only for a reading that was recorded. Own pieces (E2E- codes), Nord warehouse.

// A fake audio output that remembers every tone and how many outputs were made; every green flash is noted as it appears.
async function watchSignals(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __tones: number[]; __contexts: number; __greens: string[]; AudioContext: unknown };
    w.__tones = [];
    w.__contexts = 0;
    w.__greens = [];
    class FakeContext {
      state = "running";
      currentTime = 0;
      destination = {};
      constructor() { w.__contexts += 1; }
      createOscillator() {
        const o = { frequency: { value: 0 }, connect() { /* nothing */ }, start() { w.__tones.push(o.frequency.value); }, stop() { /* nothing */ } };
        return o;
      }
      resume() { return Promise.resolve(); }
      close() { w.__contexts -= 1; return Promise.resolve(); }
    }
    w.AudioContext = FakeContext;
    const note = () => {
      const f = document.querySelector("[data-testid='scan-flash'][data-tone='ok']");
      if (f && w.__greens[w.__greens.length - 1] !== f.textContent) w.__greens.push(f.textContent ?? "");
    };
    new MutationObserver(note).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-tone"] });
  });
}
const tones = (page: Page) => page.evaluate(() => (window as unknown as { __tones: number[] }).__tones);
const contexts = (page: Page) => page.evaluate(() => (window as unknown as { __contexts: number }).__contexts);
const greens = (page: Page) => page.evaluate(() => (window as unknown as { __greens: string[] }).__greens);
const SEEN = 1200;
const LOOK = 440;
const ALARM = [880, 660, 440];
const PRODUCT = "MC400100"; // the material code of RX-100 in the seed catalog

const slowServer = (page: Page) => page.route((url) => url.pathname.includes("google.firestore"), async (r) => {
  await new Promise((ok) => setTimeout(ok, 3000));
  await r.continue().catch(() => undefined);
});
const type = async (page: Page, code: string) => {
  await page.getByTestId("scan-manual-input").fill(code);
  await page.getByTestId("scan-manual-submit").click();
};
async function arrived(page: Page, code: string, flow: "removed" | "new"): Promise<void> {
  await page.goto("/scan?mode=arrive_at_warehouse");
  await page.getByTestId("scan-flow-select").selectOption(flow);
  await scanManual(page, code, { withModel: true });
  await expect(page.getByTestId("scan-session-row").filter({ hasText: code })).toContainText(tr("scan.sent"), { timeout: 60_000 });
  await expect.poll(async () => (await emulatorFindOne("codes", { raw: code }))?.itemId ?? null, { timeout: 90_000 }).not.toBeNull();
}
async function warehouse(page: Page): Promise<void> {
  await watchSignals(page);
  await signIn(page, ACCOUNTS.aspWarehouseNord);
  await pickLocation(page, SEED.nord.warehouse);
}
async function arrivalOfNew(page: Page): Promise<void> {
  await page.goto("/scan?mode=arrive_at_warehouse");
  await page.getByTestId("scan-flow-select").selectOption("new");
  await expect(page.getByTestId("scan-manual-input")).toBeVisible({ timeout: 60_000 });
}

test.describe("Primo segnale alla lettura (telefono)", () => {
  test("con il server lento il segnale arriva subito ed è bianco; il verde solo a lettura registrata", async ({ page }) => {
    test.setTimeout(180_000);
    const code = uniqueCode("FS");
    await warehouse(page);
    await arrivalOfNew(page);
    await slowServer(page);
    const before = (await tones(page)).length;
    await type(page, code);
    await expect(page.getByTestId("scan-decoded")).toHaveText(tr("scan.decoded").replace("{{code}}", code), { timeout: 1_000 });
    expect((await tones(page)).slice(before)).toEqual([SEEN]);
    await expect(page.getByTestId("scan-flash")).toHaveCount(0);
    expect(await greens(page)).toEqual([]);
    // The server is late: the window of the unknown piece comes after, and the reading is recorded only when it closes.
    await page.getByTestId("scan-modelpick-skip").click({ timeout: 30_000 });
    await expect(page.getByTestId("scan-session-row").filter({ hasText: code })).toHaveCount(1);
    expect(await greens(page)).toEqual([`\u2713 ${code}`]);
  });

  test("una lettura che va bene suona una volta sola, con una sola uscita audio per tutte le letture", async ({ page }) => {
    test.setTimeout(180_000);
    await warehouse(page);
    // A fixed "Defective" on pieces the phone does not know: recorded at once, no window.
    await page.goto("/scan?mode=classify");
    await page.getByTestId("scan-newclass-select").selectOption("defective");
    for (const code of [uniqueCode("FS"), uniqueCode("FS"), uniqueCode("FS")]) {
      const from = (await tones(page)).length;
      await scanManual(page, code);
      expect((await tones(page)).slice(from)).toEqual([SEEN]);
    }
    expect(await contexts(page)).toBe(1);
  });

  test("codice prodotto e «già letto»: niente primo segnale e niente verde, solo il giallo con il suo suono", async ({ page }) => {
    test.setTimeout(180_000);
    const code = uniqueCode("FS");
    await warehouse(page);
    await arrivalOfNew(page);
    await scanManual(page, code, { withModel: true });
    const flash = page.getByTestId("scan-flash");
    const greensBefore = await greens(page);

    const from = (await tones(page)).length;
    await type(page, code);
    await expect(flash).toHaveAttribute("data-tone", "warn");
    await expect(flash).toContainText(tr("scan.readAgain").replace("{{code}}", code).split("{{")[0]);
    await expect(page.getByTestId("scan-decoded")).toHaveCount(0);
    expect((await tones(page)).slice(from)).toEqual([LOOK, LOOK]);
    await expect(flash).toBeHidden();

    const from2 = (await tones(page)).length;
    await type(page, PRODUCT);
    await expect(flash).toHaveAttribute("data-tone", "warn");
    await expect(flash).toContainText(tr("scan.productCode"));
    expect((await tones(page)).slice(from2)).toEqual([LOOK, LOOK]);
    expect(await greens(page)).toEqual(greensBefore);
  });

  test("«Difettoso» fisso su un pezzo smontato: bianco, poi rosso, mai verde", async ({ page }) => {
    test.setTimeout(240_000);
    const code = uniqueCode("FS");
    await warehouse(page);
    await arrived(page, code, "removed");
    await page.goto("/scan?mode=classify");
    await page.getByTestId("scan-newclass-select").selectOption("defective");
    const greensBefore = await greens(page);
    const from = (await tones(page)).length;
    await type(page, code);
    const flash = page.getByTestId("scan-flash");
    await expect(flash).toHaveAttribute("data-tone", "danger");
    // P-183: red has its own sound (three falling notes), not the two equal tones of yellow.
    expect((await tones(page)).slice(from)).toEqual([SEEN, ...ALARM]);
    await expect(page.getByTestId("scan-session-row")).toHaveCount(0);
    expect(await greens(page)).toEqual(greensBefore);
  });

  test("«Smista» annullata: bianco e finestra, nessun verde e nessuna lettura", async ({ page }) => {
    test.setTimeout(240_000);
    const code = uniqueCode("FS");
    await warehouse(page);
    await arrived(page, code, "removed");
    await page.goto("/scan?mode=classify");
    await expect(page.getByTestId("scan-manual-input")).toBeVisible({ timeout: 60_000 });
    const greensBefore = await greens(page);
    const from = (await tones(page)).length;
    await type(page, code);
    await expect(page.getByTestId("scan-sort")).toBeVisible();
    expect((await tones(page)).slice(from)).toEqual([SEEN]);
    await page.getByTestId("scan-sort-cancel").click();
    await expect(page.getByTestId("scan-sort")).toHaveCount(0);
    await expect(page.getByTestId("scan-session-row")).toHaveCount(0);
    expect(await greens(page)).toEqual(greensBefore);
  });

  test("un errore mentre si controlla il pezzo: rosso e nessun verde, mai un bip seguito dal silenzio", async ({ page }) => {
    test.setTimeout(180_000);
    await warehouse(page);
    await arrivalOfNew(page);
    const greensBefore = await greens(page);
    // An unpaired surrogate cannot be encoded into a code id: the check of the piece throws.
    await page.getByTestId("scan-manual-input").evaluate((el: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, "E2E\uD800X");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.getByTestId("scan-manual-submit").click();
    const flash = page.getByTestId("scan-flash");
    await expect(flash).toHaveAttribute("data-tone", "danger");
    await expect(flash).toContainText(tr("scan.readingFailed"));
    await expect(page.getByTestId("scan-session-row")).toHaveCount(0);
    expect(await greens(page)).toEqual(greensBefore);
  });

  test("il registro dei tempi compare solo a richiesta e riporta la lettura", async ({ page }) => {
    test.setTimeout(180_000);
    const code = uniqueCode("FS");
    await warehouse(page);
    await arrivalOfNew(page);
    await expect(page.getByTestId("scan-log")).toHaveCount(0);
    await page.goto("/scan?mode=arrive_at_warehouse&scanlog=1");
    await page.getByTestId("scan-flow-select").selectOption("new");
    await expect(page.getByTestId("scan-log")).toBeVisible();
    await type(page, code);
    await page.getByTestId("scan-modelpick-skip").click({ timeout: 30_000 });
    const row = page.getByTestId("scan-log-row").first();
    await expect(row).toContainText(code.slice(-8));
    await expect(row).toContainText(tr("scan.log.window"));
    await expect(row).toContainText(new RegExp(`${tr("scan.log.first")} \\d+`));
  });
});
