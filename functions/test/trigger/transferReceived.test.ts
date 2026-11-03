import { describe, it, expect, beforeAll } from "vitest";
import { setupTrigger, ev, LOC, NORD, RUN, T0, type TriggerEnv } from "./env";

// P-114 n.16, SPEC §9.4: "The shipment becomes received when all lines have arrived". Red before: arrivals only set
// lines.arrivedAt, the shipment stayed "sent" for ever (and the 7-day transfer check kept looking at it).
let t: TriggerEnv;
const transfer = async (name: string) => {
  const id = `sh_TT_rcv_${name}_${RUN}`;
  await t.db.collection("shipments").doc(id).set({ kind: "transfer", fromLocationId: LOC.nordWh, fromAspId: NORD, toLocationId: LOC.nordWh2, toAspId: NORD, status: "draft", itemCount: 0, receivedAt: null });
  return id;
};
const piece = (code: string) => t.fire(ev("arrive_at_warehouse", code, { payload: { flow: "new" } }));
const shipment = async (id: string) => (await t.db.collection("shipments").doc(id).get()).data()!;

beforeAll(async () => { t = await setupTrigger(); });

describe("a transfer becomes received when all its pieces have arrived (§9.4)", () => {
  it("one piece of two arrived: still sent; both arrived: received, with the date", async () => {
    const sh = await transfer("two");
    const [a, b] = [`SN-${RUN}-RCV-A`, `SN-${RUN}-RCV-B`];
    for (const c of [a, b]) { await piece(c); await t.fire(ev("transfer_out", c, { at: T0 + 1000, payload: { shipmentId: sh } })); }
    await t.db.collection("shipments").doc(sh).update({ status: "sent" });
    await t.fire(ev("arrive_at_warehouse", a, { at: T0 + 2000, locationId: LOC.nordWh2, payload: { shipmentId: sh } }));
    expect(await shipment(sh)).toMatchObject({ status: "sent", receivedAt: null });
    await t.fire(ev("arrive_at_warehouse", b, { at: T0 + 3000, locationId: LOC.nordWh2, payload: { shipmentId: sh } }));
    const s = await shipment(sh);
    expect(s.status).toBe("received");
    expect(s.receivedAt).not.toBeNull();
  });
  it("a draft (never sent) does not become received", async () => {
    const sh = await transfer("draft");
    const c = `SN-${RUN}-RCV-D`;
    await piece(c);
    await t.fire(ev("transfer_out", c, { at: T0 + 1000, payload: { shipmentId: sh } }));
    await t.fire(ev("arrive_at_warehouse", c, { at: T0 + 2000, locationId: LOC.nordWh2, payload: { shipmentId: sh } }));
    expect((await shipment(sh)).status).toBe("draft");
  });
});
