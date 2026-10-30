import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { setupTrigger, ev, NORD, UID, RUN, T0, type TriggerEnv } from "./env";

// PIANO P-22 (server side), SPEC §7.3 and §4.8. Red on 7e2f59c: photos attached before the trigger processed the
// event never reached the item; a second batch of photos of the same event replaced the first on the event; a user
// in the grace period could not attach the photos of scans made before the deactivation (the router refused it).
let t: TriggerEnv;
type Items = typeof import("../../src/routers/items")["items"];
let items: Items;
type Ctx = Parameters<Items["attachPhotos"]["handler"]>[0];
const ctxOf = (uid: string, token: Record<string, unknown> = { active: true }) => ({ uid, role: "asp_warehouse", orgId: NORD, ip: "test", token }) as Ctx;
const path = (eventId: string, n: number) => `photos/${NORD}/${eventId}/${n}.jpg`;
const write = async (data: Record<string, unknown>) => { const id = randomUUID(); await t.db.collection("events").doc(id).set(data); return id; };

beforeAll(async () => {
  t = await setupTrigger();
  items = (await import("../../src/routers/items")).items;
});

describe("attachPhotos (§7.3)", () => {
  it("photos attached before the event is processed reach the item when the trigger processes it", async () => {
    const id = await write(ev("arrive_at_warehouse", `SN-${RUN}-PH1`, { payload: { flow: "new" } }));
    await items.attachPhotos.handler(ctxOf(UID.nw), { eventId: id, paths: [path(id, 1)] });
    await t.processEvent(id);
    const e = (await t.db.collection("events").doc(id).get()).data()!;
    expect((await t.db.collection("items").doc(e.itemId).get()).get("photoPaths")).toEqual([path(id, 1)]);
  });
  it("a second batch of photos of the same event adds to the first, on the event and on the item", async () => {
    const id = await t.fire(ev("arrive_at_warehouse", `SN-${RUN}-PH2`, { payload: { flow: "new" } }));
    await items.attachPhotos.handler(ctxOf(UID.nw), { eventId: id, paths: [path(id, 1)] });
    await items.attachPhotos.handler(ctxOf(UID.nw), { eventId: id, paths: [path(id, 2)] });
    const e = (await t.db.collection("events").doc(id).get()).data()!;
    expect(e.photoPaths).toEqual([path(id, 1), path(id, 2)]);
    expect((await t.db.collection("items").doc(e.itemId).get()).get("photoPaths")).toEqual([path(id, 1), path(id, 2)]);
  });
  it("§4.8: a user in the grace period attaches photos of scans made before the deactivation, not after", async () => {
    expect(items.attachPhotos.grace).toBe(true);
    const disabledAt = T0 + 60_000;
    const grace = ctxOf(UID.nw, { active: false, disabledAt });
    const before = await t.fire(ev("arrive_at_warehouse", `SN-${RUN}-PH3`, { at: T0, payload: { flow: "new" } }));
    await items.attachPhotos.handler(grace, { eventId: before, paths: [path(before, 1)] });
    expect((await t.db.collection("events").doc(before).get()).get("photoPaths")).toEqual([path(before, 1)]);
    const after = await t.fire(ev("arrive_at_warehouse", `SN-${RUN}-PH4`, { at: T0 + 120_000, payload: { flow: "new" } }));
    await expect(items.attachPhotos.handler(grace, { eventId: after, paths: [path(after, 1)] })).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("never another user's event, never a path outside the own ASP and event", async () => {
    const id = await t.fire(ev("arrive_at_warehouse", `SN-${RUN}-PH5`, { payload: { flow: "new" } }));
    await expect(items.attachPhotos.handler(ctxOf("tt_someone_else"), { eventId: id, paths: [path(id, 1)] })).rejects.toMatchObject({ code: "not-found" });
    await expect(items.attachPhotos.handler(ctxOf(UID.nw), { eventId: id, paths: [`photos/org_asp_centro/${id}/1.jpg`] })).rejects.toMatchObject({ code: "invalid-argument" });
  });
});
