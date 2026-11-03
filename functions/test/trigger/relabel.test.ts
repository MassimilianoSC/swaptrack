import { describe, it, expect, beforeAll } from "vitest";
import { setupTrigger, ev, computeCodeId, LOC, NORD, CENTRO, UID, RUN, T0, type TriggerEnv } from "./env";

// Censimento n.37, SPEC §6.5 and §9.2: the relabel as the field screen will write it. The worker reads the old label of
// a known piece, then the new one (camera, gun or typed): one `relabel` event with codeRaw = new, payload.oldCodeRaw =
// old, at the selected place. "Undo last" on that screen writes a `void` of it.
// Red before: "undo last" left the old label replaced and the new one active (the void only replayed the item); a relabel
// by another ASP rewrote the codes of a piece that is not its own, with no anomaly (§9.2 "another ASP's piece").
let t: TriggerEnv;
const event = async (id: string) => (await t.db.collection("events").doc(id).get()).data()!;
const code = async (raw: string) => (await t.db.collection("codes").doc(computeCodeId(raw)).get()).data();
const anomalyTypes = async (eventId: string) =>
  (await t.db.collection("anomalies").where("eventId", "==", eventId).get()).docs.map((d) => d.get("type") as string).sort();

beforeAll(async () => {
  t = await setupTrigger();
});

describe("relabel from the field screen (§6.5)", () => {
  it("at a site: the technician reads the old label, then the new one; the piece keeps state and place, the next reading of the new label finds it", async () => {
    const oldCode = `SN-${RUN}-RLS-OLD`, newCode = `SN-${RUN}-RLS-NEW`;
    const first = await t.fire(ev("install_at_site", oldCode));
    const itemId = (await event(first)).itemId as string;
    const rl = await t.fire(ev("relabel", newCode, { at: T0 + 1000, locationId: LOC.nordSite, userId: UID.nt, source: "manual", payload: { oldCodeRaw: oldCode } }));
    expect(await event(rl)).toMatchObject({ outcome: "ok", itemId });
    expect(await anomalyTypes(rl)).toEqual([]);
    expect((await t.db.collection("items").doc(itemId).get()).data()).toMatchObject({ status: "installed", currentLocationId: LOC.nordSite, currentAspId: NORD });
    expect(await code(oldCode)).toMatchObject({ active: false, replacedBy: computeCodeId(newCode), itemId });
    expect(await code(newCode)).toMatchObject({ active: true, replacedBy: null, itemId, aspId: NORD });
    const removal = await t.fire(ev("remove_at_site", newCode, { at: T0 + 2000 }));
    expect((await event(removal)).itemId).toBe(itemId);
  });

  it("the new label already active on another piece: no change, conflicting_creation", async () => {
    const a = `SN-${RUN}-RLC-A`, b = `SN-${RUN}-RLC-B`;
    await t.fire(ev("arrive_at_warehouse", a, { payload: { flow: "removed" } }));
    const other = (await event(await t.fire(ev("arrive_at_warehouse", b, { payload: { flow: "removed" } })))).itemId;
    const rl = await t.fire(ev("relabel", b, { at: T0 + 1000, payload: { oldCodeRaw: a } }));
    expect(await event(rl)).toMatchObject({ outcome: "rejected" });
    expect(await anomalyTypes(rl)).toEqual(["conflicting_creation"]);
    expect(await code(a)).toMatchObject({ active: true, replacedBy: null });
    expect(await code(b)).toMatchObject({ active: true, itemId: other });
  });

  it("«undo last» right after a relabel puts the old label back and drops the new one", async () => {
    const oldCode = `SN-${RUN}-RLU-OLD`, newCode = `SN-${RUN}-RLU-NEW`;
    const first = await t.fire(ev("arrive_at_warehouse", oldCode, { payload: { flow: "removed" } }));
    const itemId = (await event(first)).itemId as string;
    const rl = await t.fire(ev("relabel", newCode, { at: T0 + 1000, payload: { oldCodeRaw: oldCode } }));
    const undo = await t.fire(ev("void", null, { at: T0 + 2000, payload: { targetEventId: rl } }));
    expect(await event(undo)).toMatchObject({ outcome: "ok" });
    expect(await code(oldCode)).toMatchObject({ active: true, replacedBy: null, itemId });
    expect(await code(newCode)).toBeUndefined();
    expect((await t.db.collection("items").doc(itemId).get()).data()).toMatchObject({ status: "received_at_asp" });
    // The old label is the piece's label again: reading it is not "old label used".
    const again = await t.fire(ev("arrive_at_warehouse", oldCode, { at: T0 + 3000, payload: { flow: "removed" } }));
    expect(await anomalyTypes(again)).toEqual([]);
  });

  it("another ASP cannot relabel a piece that is not its own: anomaly code_of_another_asp, labels unchanged", async () => {
    const oldCode = `SN-${RUN}-RLA-OLD`, newCode = `SN-${RUN}-RLA-NEW`;
    const first = await t.fire(ev("arrive_at_warehouse", oldCode, { payload: { flow: "removed" } }));
    const itemId = (await event(first)).itemId as string;
    const rl = await t.fire(ev("relabel", newCode, { at: T0 + 1000, locationId: LOC.centroWh, aspId: CENTRO, orgId: CENTRO, userId: "tt_mw", payload: { oldCodeRaw: oldCode } }));
    expect(await anomalyTypes(rl)).toEqual(["code_of_another_asp"]);
    expect(await code(oldCode)).toMatchObject({ active: true, replacedBy: null, itemId, aspId: NORD });
    expect(await code(newCode)).toBeUndefined();
    expect((await t.db.collection("items").doc(itemId).get()).data()).toMatchObject({ currentAspId: NORD, currentLocationId: LOC.nordWh });
  });
});
