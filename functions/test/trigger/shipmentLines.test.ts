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

// P-206 / D-80: a reading with the id of a shipment of the other kind. Red before: a transfer_out with the id of a
// return put the piece «in transfer» and a line in the return; an arrival with the id of a return wrote arrivedAt in
// a line of the return. Now the reading stays (never refused), the piece does not enter the shipment, no line is
// written, and the reading opens shipment_kind_mismatch.
describe("readings with the id of a shipment of the other kind (P-206)", () => {
  const mismatchOf = async (eventId: string) =>
    (await t.db.collection("anomalies").where("eventId", "==", eventId).get()).docs.map((d) => d.get("type"));
  it("transfer_out into a return: no line, the piece stays sorted, shipment_kind_mismatch", async () => {
    const ret = await shipment("kind_ret"), code = `SN-${RUN}-K1`;
    const itemId = await sortedPiece(code);
    const e = await t.fire(ev("transfer_out", code, { at: T0 + 1000, payload: { shipmentId: ret } }));
    expect(await state(ret, itemId)).toEqual({ itemCount: 0, line: false, status: "sorted" });
    expect(await mismatchOf(e)).toEqual(["shipment_kind_mismatch"]);
  });
  it("arrival with the id of a return: an arrival without shipment, no arrivedAt line in the return", async () => {
    const ret = await shipment("kind_arr"), code = `SN-${RUN}-K2`;
    const first = await t.fire(ev("arrive_at_warehouse", code, { payload: { flow: "new", shipmentId: ret } }));
    const itemId = (await t.db.collection("events").doc(first).get()).get("itemId") as string;
    expect(await state(ret, itemId)).toEqual({ itemCount: 0, line: false, status: "received_at_asp" });
    expect(await mismatchOf(first)).toEqual(["shipment_kind_mismatch"]);
  });
});
