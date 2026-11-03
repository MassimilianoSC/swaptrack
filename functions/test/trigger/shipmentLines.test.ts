import { describe, it, expect, beforeAll } from "vitest";
import { setupTrigger, ev, LOC, NORD, RUN, T0, type TriggerEnv } from "./env";

// Path 4 of the demo (§9.3, §12.2 burst mode with "undo last", §8.2 void). A line of a shipment is a piece read
// into it by a return_ship / transfer_out that is not voided; itemCount counts those lines. Red on c49f776: every
// reading added 1 to itemCount (a piece read twice counted twice), and "undo last" left the piece in the shipment,
// where the client would then confirm it as returned although it never left the ASP.
let t: TriggerEnv;
const shipment = async (name: string) => {
  const id = `sh_TT_${name}_${RUN}`;
  await t.db.collection("shipments").doc(id).set({ kind: "return", fromLocationId: LOC.nordWh, fromAspId: NORD, toLocationId: LOC.clientWh, toAspId: null, status: "draft", itemCount: 0, documentId: null });
  return id;
};
const sortedPiece = async (code: string) => {
  const first = await t.fire(ev("arrive_at_warehouse", code, { payload: { flow: "removed", categoryId: "cat_t" } }));
  return (await t.db.collection("events").doc(first).get()).get("itemId") as string;
};
const state = async (sh: string, itemId: string) => ({
  itemCount: (await t.db.collection("shipments").doc(sh).get()).get("itemCount"),
  line: (await t.db.collection("shipments").doc(sh).collection("lines").doc(itemId).get()).exists,
  status: (await t.db.collection("items").doc(itemId).get()).get("status"),
});
const undo = (target: string, at: number) => t.fire(ev("void", null, { at, payload: { targetEventId: target } }));

beforeAll(async () => { t = await setupTrigger(); });

describe("shipment lines and itemCount (§9.3, §8.2)", () => {
  it("a piece read twice into the same shipment is one line, counted once", async () => {
    const sh = await shipment("twice"), code = `SN-${RUN}-L1`;
    const itemId = await sortedPiece(code);
    await t.fire(ev("return_ship", code, { at: T0 + 1000, payload: { shipmentId: sh } }));
    await t.fire(ev("return_ship", code, { at: T0 + 2000, payload: { shipmentId: sh } }));
    expect(await state(sh, itemId)).toEqual({ itemCount: 1, line: true, status: "in_return" });
  });

  it("undo last: the piece leaves the shipment and goes back to its state", async () => {
    const sh = await shipment("undo"), code = `SN-${RUN}-L2`, other = `SN-${RUN}-L3`;
    const itemId = await sortedPiece(code);
    const otherId = await sortedPiece(other);
    await t.fire(ev("return_ship", other, { at: T0 + 1000, payload: { shipmentId: sh } }));
    const wrong = await t.fire(ev("return_ship", code, { at: T0 + 2000, payload: { shipmentId: sh } }));
    await undo(wrong, T0 + 3000);
    expect(await state(sh, itemId)).toEqual({ itemCount: 1, line: false, status: "sorted" });
    expect(await state(sh, otherId)).toEqual({ itemCount: 1, line: true, status: "in_return" });
  });

  it("undo of one of two readings of the same piece: the piece stays in the shipment, counted once", async () => {
    const sh = await shipment("undoOne"), code = `SN-${RUN}-L4`;
    const itemId = await sortedPiece(code);
    await t.fire(ev("return_ship", code, { at: T0 + 1000, payload: { shipmentId: sh } }));
    const again = await t.fire(ev("return_ship", code, { at: T0 + 2000, payload: { shipmentId: sh } }));
    await undo(again, T0 + 3000);
    expect(await state(sh, itemId)).toEqual({ itemCount: 1, line: true, status: "in_return" });
  });
});
