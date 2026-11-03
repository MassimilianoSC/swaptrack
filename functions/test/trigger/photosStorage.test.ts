import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { setupTrigger, ev, NORD, UID, RUN, T0, type TriggerEnv } from "./env";
import { setup as setupRules, allow, deny, GRACE_AT, type Env as RulesEnv, type Uid } from "../rules/env";

// PIANO P-22 (server side), SPEC §7.3 and §4.8: the photo of an offline scan, end to end on the Storage emulator.
// The file is uploaded as the app does it (photoQueue.ts: photos/{aspId}/{eventId}/{n}.jpg, image/jpeg) with the
// user's token and the real Storage rules, then attached with attachPhotos; the trigger runs in-process.
// photos.test.ts covers attachPhotos alone; here every path also exists in Storage and is read under the rules.
let t: TriggerEnv;
let r: RulesEnv;
type Items = typeof import("../../src/routers/items")["items"];
let items: Items;
type Ctx = Parameters<Items["attachPhotos"]["handler"]>[0];
const ctxOf = (token: Record<string, unknown> = { active: true }) => ({ uid: UID.nw, role: "asp_warehouse", orgId: NORD, ip: "test", token }) as Ctx;
const photoPath = (eventId: string, n: number) => `photos/${NORD}/${eventId}/${n}.jpg`;
// A JPEG as the compressor sends it: only the start and end markers matter to the rules (type and size).
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, ...new Array(64).fill(7), 0xff, 0xd9]);
const upload = (uid: Uid, path: string) => r.ctx(uid).storage().ref(path).put(JPEG, { contentType: "image/jpeg" }).then((s) => s);
const meta = (uid: Uid, path: string) => r.ctx(uid).storage().ref(path).getMetadata();
const write = async (data: Record<string, unknown>) => { const id = randomUUID(); await t.db.collection("events").doc(id).set(data); return id; };
const photosOf = async (eventId: string) => {
  const e = (await t.db.collection("events").doc(eventId).get()).data()!;
  return { event: e.photoPaths as string[], item: (await t.db.collection("items").doc(e.itemId).get()).get("photoPaths") as string[] };
};

beforeAll(async () => {
  t = await setupTrigger();
  r = await setupRules("photos-p22", { storage: true });
  items = (await import("../../src/routers/items")).items;
});
afterAll(() => r.env.cleanup());

describe("P-22: photo of an offline scan, Storage and attachPhotos", () => {
  it("photo uploaded after the event was processed: on the piece, stored as JPEG, readable by the client and the own ASP only", async () => {
    const id = await t.fire(ev("arrive_at_warehouse", `SN-${RUN}-P22A`, { payload: { flow: "new" } }));
    const p = photoPath(id, 1);
    await allow(upload("nw", p));
    await items.attachPhotos.handler(ctxOf(), { eventId: id, paths: [p] });
    expect(await photosOf(id)).toEqual({ event: [p], item: [p] });
    expect((await allow(meta("co", p))).contentType).toBe("image/jpeg");
    await allow(meta("nt", p));
    await deny(meta("mw", p));
  });

  it("photo uploaded and attached before the trigger ran: the trigger brings it to the piece", async () => {
    const id = await write(ev("arrive_at_warehouse", `SN-${RUN}-P22B`, { payload: { flow: "new" } }));
    const p = photoPath(id, 1);
    await allow(upload("nw", p));
    await items.attachPhotos.handler(ctxOf(), { eventId: id, paths: [p] });
    await t.processEvent(id);
    expect((await photosOf(id)).item).toEqual([p]);
    await allow(meta("ca", p));
  });

  it("§4.8: a user deactivated after the scan still uploads and attaches its photo; not for a scan made after", async () => {
    const grace = ctxOf({ active: false, disabledAt: GRACE_AT });
    const before = await t.fire(ev("arrive_at_warehouse", `SN-${RUN}-P22C1`, { at: GRACE_AT - 60_000, payload: { flow: "new" } }));
    const p = photoPath(before, 1);
    await allow(upload("nwGrace", p));
    await items.attachPhotos.handler(grace, { eventId: before, paths: [p] });
    expect((await photosOf(before)).item).toEqual([p]);
    const after = await t.fire(ev("arrive_at_warehouse", `SN-${RUN}-P22C2`, { at: GRACE_AT + 60_000, payload: { flow: "new" } }));
    await expect(items.attachPhotos.handler(grace, { eventId: after, paths: [photoPath(after, 1)] })).rejects.toMatchObject({ code: "permission-denied" });
    await deny(upload("inactive", photoPath(after, 2)));
  });

  it("second round: a later photo of the same event adds to the first; the same attach repeated keeps one copy", async () => {
    const id = await t.fire(ev("arrive_at_warehouse", `SN-${RUN}-P22D`, { at: T0, payload: { flow: "new" } }));
    const [p1, p2] = [photoPath(id, 1), photoPath(id, 2)];
    await allow(upload("nw", p1));
    await items.attachPhotos.handler(ctxOf(), { eventId: id, paths: [p1] });
    // The queue retried after a cut: the same file uploaded and attached again.
    await allow(upload("nw", p1));
    await items.attachPhotos.handler(ctxOf(), { eventId: id, paths: [p1] });
    await allow(upload("nw", p2));
    await items.attachPhotos.handler(ctxOf(), { eventId: id, paths: [p2] });
    expect(await photosOf(id)).toEqual({ event: [p1, p2], item: [p1, p2] });
    await allow(meta("co", p2));
  });
});
