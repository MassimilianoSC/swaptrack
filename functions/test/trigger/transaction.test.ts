import { describe, it, expect, beforeAll } from "vitest";
import { setupTrigger, ev, computeCodeId, LOC, SH, RUN, T0, type TriggerEnv } from "./env";

// PIANO P-16: inside the trigger transaction every read must come before every write
// (@google-cloud/firestore refuses a get after a set). Three paths used to break that order:
// return_ship / transfer_out with a shipment, a replaced label read again, and a long merge chain.
// Red on 7625662: processEvent rejects with "Firestore transactions require all reads to be executed before all writes."
let t: TriggerEnv;
beforeAll(async () => { t = await setupTrigger(); });

const anomaliesOf = async (eventId: string) => (await t.db.collection("anomalies").where("eventId", "==", eventId).get()).docs.map((d) => d.data());

describe("transfer_out and return_ship with a shipment (§9.3, §9.4)", () => {
  it("return_ship: the event is processed, the shipment line is created and itemCount incremented", async () => {
    const code = `SN-${RUN}-RET`;
    await t.fire(ev("arrive_at_warehouse", code, { payload: { flow: "removed" } }));
    await t.fire(ev("classify", code, { at: T0 + 1000, payload: { categoryId: "cat_t" } }));
    const id = await t.fire(ev("return_ship", code, { at: T0 + 2000, payload: { shipmentId: SH.ret } }));
    const e = (await t.db.collection("events").doc(id).get()).data()!;
    expect(e.processedAt).toBeTruthy();
    expect(e.outcome).toBe("ok");
    const item = (await t.db.collection("items").doc(e.itemId).get()).data()!;
    expect(item).toMatchObject({ status: "in_return", previousStatus: "sorted", shipmentId: SH.ret, sortingCategoryId: "cat_t" });
    const line = await t.db.collection("shipments").doc(SH.ret).collection("lines").doc(e.itemId).get();
    expect(line.exists).toBe(true);
    expect(line.data()).toMatchObject({ codeRaw: code, kind: "return", fromAspId: "org_asp_nord" });
    expect((await t.db.collection("shipments").doc(SH.ret).get()).get("itemCount")).toBeGreaterThanOrEqual(1);
    expect(await anomaliesOf(id)).toEqual([]);
  });
  it("transfer_out: the event is processed, the piece is in_transfer and the line exists", async () => {
    const code = `SN-${RUN}-TR`;
    await t.fire(ev("arrive_at_warehouse", code, { payload: { flow: "new" } }));
    const id = await t.fire(ev("transfer_out", code, { at: T0 + 1000, payload: { shipmentId: SH.tr } }));
    const e = (await t.db.collection("events").doc(id).get()).data()!;
    expect(e.outcome).toBe("ok");
    expect((await t.db.collection("items").doc(e.itemId).get()).data()).toMatchObject({ status: "in_transfer", shipmentId: SH.tr, previousStatus: "received_at_asp" });
    expect((await t.db.collection("shipments").doc(SH.tr).collection("lines").doc(e.itemId).get()).exists).toBe(true);
  });
});

describe("a replaced label read again (§6.5 relabel, old_label_used)", () => {
  it("the event is processed with exactly one old_label_used anomaly, also when processed twice (R5)", async () => {
    const oldCode = `SN-${RUN}-OLD`, newCode = `SN-${RUN}-NEW`;
    const first = await t.fire(ev("arrive_at_warehouse", oldCode));
    const itemId = (await t.db.collection("events").doc(first).get()).get("itemId") as string;
    await t.fire(ev("relabel", newCode, { at: T0 + 1000, payload: { oldCodeRaw: oldCode } }));
    expect((await t.db.collection("codes").doc(computeCodeId(oldCode)).get()).data()).toMatchObject({ active: false, replacedBy: computeCodeId(newCode), itemId });
    expect((await t.db.collection("codes").doc(computeCodeId(newCode)).get()).data()).toMatchObject({ active: true, itemId });
    const id = await t.fire(ev("arrive_at_warehouse", oldCode, { at: T0 + 2000 }));
    const e = (await t.db.collection("events").doc(id).get()).data()!;
    expect(e.processedAt).toBeTruthy();
    expect(e.itemId).toBe(itemId);
    expect(e.outcome).toBe("ok");
    let anomalies = await anomaliesOf(id);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({ type: "old_label_used", itemId });
    // Idempotent: a second delivery of the same event changes nothing.
    await t.processEvent(id);
    anomalies = await anomaliesOf(id);
    expect(anomalies).toHaveLength(1);
  });
});

describe("a merge chain of five hops (§6.5, merge_chain_suspicious)", () => {
  it("the event is processed on the last item of the chain, with one anomaly", async () => {
    const code = `SN-${RUN}-MERGE`;
    const ids = [1, 2, 3, 4, 5, 6].map((n) => `it_TT_${RUN}_m${n}`);
    for (let i = 0; i < ids.length; i++) {
      await t.db.collection("items").doc(ids[i]).set({
        status: "received_at_asp", statusSince: null, flow: "new", previousFlow: null, previousStatus: null, currentLocationId: LOC.nordWh, currentLocationType: "asp_warehouse",
        currentAspId: "org_asp_nord", pendingAspId: null, shipmentId: null, sortingCategoryId: null, siteOfOrigin: null, siteOfInstallation: null,
        lastEventId: null, lastScannedAt: null, modelId: null, needsModel: true, photoPaths: [], extra: {}, condition: null, mergedInto: i < ids.length - 1 ? ids[i + 1] : null,
      });
    }
    await t.db.collection("codes").doc(computeCodeId(code)).set({ raw: code, norm: code, normVersion: 1, itemId: ids[0], aspId: "org_asp_nord", pendingAspId: null, active: true, replacedBy: null });
    const id = await t.fire(ev("arrive_at_warehouse", code));
    const e = (await t.db.collection("events").doc(id).get()).data()!;
    expect(e.processedAt).toBeTruthy();
    expect(e.itemId).toBe(ids[5]);
    const anomalies = await anomaliesOf(id);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({ type: "merge_chain_suspicious" });
  });
});
