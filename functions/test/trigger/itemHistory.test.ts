import { describe, it, expect, beforeAll } from "vitest";
import { setupTrigger, ev, NORD, RUN, T0, type TriggerEnv } from "./env";

// P-94, SPEC §13.2: the history of a piece shows "every event with time, location, organization and role", never
// the person (R11: only revealEventAuthor, logged). Red on 50600fa: itemHistory returned ids only and no role.
let t: TriggerEnv;
type Items = typeof import("../../src/routers/items")["items"];
let items: Items;
type Ctx = Parameters<Items["itemHistory"]["handler"]>[0];
const office = { uid: "tt_co", role: "client_office", orgId: "org_client", ip: "test", token: {} } as Ctx;
const WORKER = `tt_hist_w_${RUN}`, TECH = `tt_hist_t_${RUN}`;

beforeAll(async () => {
  t = await setupTrigger();
  items = (await import("../../src/routers/items")).items;
  // Own users with a name, so the test can check the name never leaves the server.
  await t.db.collection("users").doc(WORKER).set({ role: "asp_warehouse", orgId: NORD, active: true, disabledAt: null, firstName: "Ottavio", lastName: "Quintavalle" });
  await t.db.collection("users").doc(TECH).set({ role: "asp_technician", orgId: NORD, active: true, disabledAt: null, firstName: "Rosalba", lastName: "Fumagalli" });
  await t.db.collection("organizations").doc(NORD).set({ name: "ASP Nord", type: "asp" }, { merge: true });
});

describe("itemHistory: organization and role, never the person (§13.2, R11)", () => {
  it("each event has the location and organization names and the role of who scanned", async () => {
    const code = `SN-${RUN}-HI`;
    const removal = await t.fire(ev("remove_at_site", code, { userId: TECH }));
    await t.fire(ev("arrive_at_warehouse", code, { at: T0 + 60_000, userId: WORKER }));
    const itemId = (await t.db.collection("events").doc(removal).get()).get("itemId") as string;
    const r = await items.itemHistory.handler(office, { itemId }) as { events: Array<Record<string, unknown>> };
    expect(r.events.map((e) => ({ type: e.type, role: e.role, organizationName: e.organizationName, locationName: e.locationName }))).toEqual([
      { type: "remove_at_site", role: "asp_technician", organizationName: "ASP Nord", locationName: "TT-SITO-NORD" },
      { type: "arrive_at_warehouse", role: "asp_warehouse", organizationName: "ASP Nord", locationName: "TT-MAG-NORD" },
    ]);
    const json = JSON.stringify(r);
    for (const secret of ["Ottavio", "Quintavalle", "Rosalba", "Fumagalli", WORKER, TECH]) expect(json).not.toContain(secret);
  });
});
