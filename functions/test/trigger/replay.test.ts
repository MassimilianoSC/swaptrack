import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { setupTrigger, ev, computeCodeId, LOC, NORD, CENTRO, RUN, T0, type TriggerEnv } from "./env";

// PIANO P-11, criterion 2 ("never a piece doubled or lost; an offline scan always arrives"): the trigger and the
// replay of §8.2 on the Firestore emulator, through processEvent (what onEventCreated calls).
let t: TriggerEnv;
beforeAll(async () => { t = await setupTrigger(); });

const HOUR = 3600 * 1000;
const event = async (id: string) => (await t.db.collection("events").doc(id).get()).data()!;
const itemOf = async (eventId: string) => (await t.db.collection("items").doc((await event(eventId)).itemId).get()).data()!;
const itemsWithCode = async (code: string) => {
  const evs = await t.db.collection("events").where("codeId", "==", computeCodeId(code)).get();
  return new Set(evs.docs.map((d) => d.get("itemId")).filter(Boolean));
};
const anomalyTypes = async (eventId: string) => (await t.db.collection("anomalies").where("eventId", "==", eventId).get()).docs.map((d) => d.get("type"));
// Writes the event without processing it, as a phone does when it syncs.
const write = async (data: Record<string, unknown>) => { const id = randomUUID(); await t.db.collection("events").doc(id).set(data); return id; };

describe("the same unknown code from two devices (§8.2, R3)", () => {
  it("two removals synced at the same moment create one piece and one code", async () => {
    const code = `SN-${RUN}-TWO`;
    const a = await write(ev("remove_at_site", code, { at: T0 }));
    const b = await write(ev("remove_at_site", code, { at: T0 + 60_000, userId: "tt_nt2" }));
    await Promise.all([t.processEvent(a), t.processEvent(b)]);
    const [ea, eb] = [await event(a), await event(b)];
    expect(ea.processedAt && eb.processedAt).toBeTruthy();
    expect(ea.itemId).toBe(eb.itemId);
    expect(await itemsWithCode(code)).toEqual(new Set([ea.itemId]));
    expect((await t.db.collection("codes").doc(computeCodeId(code)).get()).get("itemId")).toBe(ea.itemId);
    expect((await t.db.collection("items").doc(ea.itemId).get()).data()).toMatchObject({ status: "removed_at_site", siteOfOrigin: LOC.nordSite });
  });
});

describe("an offline removal synced after the arrival (§8.2 late event)", () => {
  it("the 10:00 removal takes its place before the 18:00 arrival and fills siteOfOrigin", async () => {
    const code = `SN-${RUN}-LATE`;
    const arrival = await t.fire(ev("arrive_at_warehouse", code, { at: T0 + 8 * HOUR, payload: { flow: "removed" } }));
    expect((await itemOf(arrival)).siteOfOrigin).toBeNull();
    // Scanned at 10:00, reached the server at 19:00.
    const removal = await t.fire(ev("remove_at_site", code, { at: T0, createdAt: new Date(T0 + 9 * HOUR) }));
    expect((await event(removal)).itemId).toBe((await event(arrival)).itemId);
    expect(await itemOf(arrival)).toMatchObject({ status: "received_at_asp", flow: "removed", siteOfOrigin: LOC.nordSite, currentLocationId: LOC.nordWh });
    expect(await anomalyTypes(removal)).toEqual([]);
  });
});

describe("the same event delivered twice (R5, retry of the trigger)", () => {
  it("one after the other and at the same time: one piece, one state, no anomaly", async () => {
    const code = `SN-${RUN}-TWICE`;
    const id = await write(ev("arrive_at_warehouse", code, { payload: { flow: "new" } }));
    await Promise.all([t.processEvent(id), t.processEvent(id)]);
    await t.processEvent(id);
    const e = await event(id);
    expect(e.outcome).toBe("ok");
    expect(await itemsWithCode(code)).toEqual(new Set([e.itemId]));
    expect(await itemOf(id)).toMatchObject({ status: "received_at_asp", lastEventId: id });
    expect(await anomalyTypes(id)).toEqual([]);
  });
});

describe("void (§8.2 undo)", () => {
  it("after the target was processed: the piece goes back to the state before it", async () => {
    const code = `SN-${RUN}-VAFTER`;
    await t.fire(ev("arrive_at_warehouse", code, { payload: { flow: "removed" } }));
    const sort = await t.fire(ev("classify", code, { at: T0 + 1000, payload: { categoryId: "cat_t" } }));
    expect((await itemOf(sort)).status).toBe("sorted");
    const v = await t.fire(ev("void", null, { at: T0 + 2000, payload: { targetEventId: sort } }));
    expect((await event(v)).outcome).toBe("ok");
    expect((await event(sort)).voided).toBe(true);
    expect(await itemOf(sort)).toMatchObject({ status: "received_at_asp" });
  });
  it("before the target was processed (both synced together, void first): the target is skipped", async () => {
    const code = `SN-${RUN}-VBEFORE`;
    const arrival = await t.fire(ev("arrive_at_warehouse", code, { payload: { flow: "removed" } }));
    const sort = await write(ev("classify", code, { at: T0 + 1000, payload: { categoryId: "cat_t" } }));
    await t.fire(ev("void", null, { at: T0 + 2000, payload: { targetEventId: sort } }));
    await t.processEvent(sort);
    expect(await event(sort)).toMatchObject({ voided: true, outcome: "voided" });
    expect(await itemOf(arrival)).toMatchObject({ status: "received_at_asp", lastEventId: arrival });
  });
  it("a void of someone else's scan is refused: void_not_allowed, nothing changes", async () => {
    const code = `SN-${RUN}-VOTHER`;
    const arrival = await t.fire(ev("arrive_at_warehouse", code, { payload: { flow: "new" } }));
    const v = await t.fire(ev("void", null, { at: T0 + 1000, userId: "tt_someone_else", payload: { targetEventId: arrival } }));
    expect((await event(v)).outcome).toBe("rejected");
    expect(await anomalyTypes(v)).toEqual(["void_not_allowed"]);
    expect((await event(arrival)).voided).toBeUndefined();
    expect((await itemOf(arrival)).status).toBe("received_at_asp");
  });
});

describe("relabel (§6.5)", () => {
  it("the new label finds the same piece; the old label is inactive", async () => {
    const oldCode = `SN-${RUN}-RLOLD`, newCode = `SN-${RUN}-RLNEW`;
    const first = await t.fire(ev("arrive_at_warehouse", oldCode, { payload: { flow: "removed" } }));
    const itemId = (await event(first)).itemId;
    await t.fire(ev("relabel", newCode, { at: T0 + 1000, payload: { oldCodeRaw: oldCode } }));
    const sort = await t.fire(ev("classify", newCode, { at: T0 + 2000, payload: { categoryId: "cat_t" } }));
    expect((await event(sort)).itemId).toBe(itemId);
    expect((await itemOf(sort)).status).toBe("sorted");
    expect((await t.db.collection("codes").doc(computeCodeId(oldCode)).get()).data()).toMatchObject({ active: false, replacedBy: computeCodeId(newCode) });
  });
  it("relabel of an unknown old label is refused, no piece is created", async () => {
    const r = await t.fire(ev("relabel", `SN-${RUN}-RLN2`, { payload: { oldCodeRaw: `SN-${RUN}-RLNONE` } }));
    expect(await event(r)).toMatchObject({ outcome: "rejected" });
    expect(await anomalyTypes(r)).toEqual(["unknown_code_where_known_expected"]);
    expect((await t.db.collection("codes").doc(computeCodeId(`SN-${RUN}-RLN2`)).get()).exists).toBe(false);
  });
});

describe("a piece of another ASP (§9.2 code_of_another_asp, R7)", () => {
  it("Centro scans a Nord piece: the event stays, state and ASP do not change, the anomaly does not name Nord", async () => {
    const code = `SN-${RUN}-OTHER`;
    const first = await t.fire(ev("arrive_at_warehouse", code, { payload: { flow: "new" } }));
    const before = await itemOf(first);
    const scan = await t.fire(ev("arrive_at_warehouse", code, { at: T0 + HOUR, locationId: LOC.centroWh, aspId: CENTRO, orgId: CENTRO, userId: "tt_mw", payload: { flow: "new" } }));
    expect((await event(scan)).itemId).toBe((await event(first)).itemId);
    expect(await anomalyTypes(scan)).toEqual(["code_of_another_asp"]);
    const anomaly = (await t.db.collection("anomalies").doc(`${scan}_code_of_another_asp`).get()).data()!;
    expect(anomaly.aspId).toBe(CENTRO);
    expect(JSON.stringify(anomaly)).not.toContain(NORD);
    expect(await itemOf(first)).toMatchObject({ status: before.status, currentAspId: NORD, currentLocationId: LOC.nordWh });
  });
});

