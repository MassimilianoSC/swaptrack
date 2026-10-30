import { describe, it, expect, beforeAll } from "vitest";
import { setupTrigger, ev, LOC, NORD, RUN, T0, type TriggerEnv } from "./env";

// Path 4 of the demo, §9.3: a return shipment confirmed with a missing piece, then confirmed again when the piece
// turns up. Red on 3e24041: the second confirmation sent a return_confirm again for pieces already returned
// (event_after_end_of_flow on each), and an unknown id in `missing` created a phantom line counted by the alert.
let t: TriggerEnv;
type Handlers = typeof import("../../src/routers/shipments")["shipments"];
let shipments: Handlers;
const SH = `sh_TT_ret_${RUN}`;
const ctx = { uid: "tt_cw", role: "client_warehouse", orgId: "org_client", ip: "test", token: {} } as Parameters<Handlers["confirmReturn"]["handler"]>[0];

const processPending = async () => {
  const evs = await t.db.collection("events").where("payload.shipmentId", "==", SH).get();
  for (const e of evs.docs) if (!e.get("processedAt")) await t.processEvent(e.id);
};
const confirmsOf = async (itemId: string) =>
  (await t.db.collection("events").where("payload.shipmentId", "==", SH).get()).docs.filter((e) => e.get("type") === "return_confirm" && e.get("itemId") === itemId);

beforeAll(async () => {
  t = await setupTrigger();
  ({ shipments } = await import("../../src/routers/shipments"));
  await t.db.collection("shipments").doc(SH).set({ kind: "return", fromLocationId: LOC.nordWh, fromAspId: NORD, toLocationId: LOC.clientWh, toAspId: null, status: "draft", itemCount: 0, documentId: null });
});

describe("confirming a return shipment twice (§9.3, path 4)", () => {
  it("a late piece is confirmed once; pieces already returned get no second confirmation; no phantom line", async () => {
    const ids: Record<string, string> = {};
    for (const [n, code] of [["a", `SN-${RUN}-RA`], ["b", `SN-${RUN}-RB`]] as const) {
      const first = await t.fire(ev("arrive_at_warehouse", code, { payload: { flow: "removed", categoryId: "cat_t" } }));
      ids[n] = (await t.db.collection("events").doc(first).get()).get("itemId");
      await t.fire(ev("return_ship", code, { at: T0 + 1000, payload: { shipmentId: SH } }));
    }
    await t.db.collection("shipments").doc(SH).update({ status: "sent" });

    await shipments.confirmReturn.handler(ctx, { shipmentId: SH, confirmed: [ids.a], missing: [ids.b, "not_a_line"], extra: [] });
    await processPending();
    expect((await t.db.collection("shipments").doc(SH).collection("lines").doc("not_a_line").get()).exists).toBe(false);
    expect((await t.db.collection("alerts").doc(`return-${SH}`).get()).data()).toMatchObject({ kind: "ddt_return_difference", count: 1, detail: { missing: 1, extra: 0 } });
    expect((await t.db.collection("items").doc(ids.b).get()).get("status")).toBe("in_return");

    // The missing piece turns up: the client confirms again, the UI sending every line not ticked as missing.
    await shipments.confirmReturn.handler(ctx, { shipmentId: SH, confirmed: [ids.a, ids.b], missing: [], extra: [] });
    await processPending();
    expect(await confirmsOf(ids.a)).toHaveLength(1);
    expect(await confirmsOf(ids.b)).toHaveLength(1);
    for (const id of [ids.a, ids.b]) expect((await t.db.collection("items").doc(id).get()).get("status")).toBe("returned");
    const afterEnd = await t.db.collection("anomalies").where("type", "==", "event_after_end_of_flow").get();
    expect(afterEnd.docs.filter((d) => [ids.a, ids.b].includes(d.get("itemId")))).toEqual([]);
    expect((await t.db.collection("shipments").doc(SH).get()).get("confirmedComplete")).toBe(true);
    // D-29: the open alert of the first confirmation now shows no difference, and stays open.
    expect((await t.db.collection("alerts").doc(`return-${SH}`).get()).data()).toMatchObject({ count: 0, closedAt: null, detail: { missing: 0, extra: 0 } });
  });

  it("D-30: a piece of shipment B found as extra in shipment A: B's line is confirmed elsewhere and B's confirmation skips it", async () => {
    const A = `sh_TT_retA_${RUN}`, B = `sh_TT_retB_${RUN}`, code = `SN-${RUN}-RX`;
    for (const id of [A, B]) await t.db.collection("shipments").doc(id).set({ kind: "return", fromLocationId: LOC.nordWh, fromAspId: NORD, toLocationId: LOC.clientWh, toAspId: null, status: "draft", itemCount: 0, documentId: null });
    const first = await t.fire(ev("arrive_at_warehouse", code, { payload: { flow: "removed", categoryId: "cat_t" } }));
    const itemId = (await t.db.collection("events").doc(first).get()).get("itemId") as string;
    await t.fire(ev("return_ship", code, { at: T0 + 1000, payload: { shipmentId: B } }));
    for (const id of [A, B]) await t.db.collection("shipments").doc(id).update({ status: "sent" });
    const processOf = async (id: string) => {
      for (const e of (await t.db.collection("events").where("payload.shipmentId", "==", id).get()).docs) if (!e.get("processedAt")) await t.processEvent(e.id);
    };

    await shipments.confirmReturn.handler(ctx, { shipmentId: A, confirmed: [], missing: [], extra: [code] });
    await processOf(A);
    expect((await t.db.collection("items").doc(itemId).get()).get("status")).toBe("returned");
    expect((await t.db.collection("shipments").doc(B).collection("lines").doc(itemId).get()).get("confirmedElsewhere")).toBe(A);

    await shipments.confirmReturn.handler(ctx, { shipmentId: B, confirmed: [itemId], missing: [], extra: [] });
    await processOf(B);
    const confirms = (await t.db.collection("events").where("payload.shipmentId", "==", B).get()).docs.filter((e) => e.get("type") === "return_confirm");
    expect(confirms).toHaveLength(0);
    expect((await t.db.collection("shipments").doc(B).get()).get("confirmedComplete")).toBe(true);
  });
});
