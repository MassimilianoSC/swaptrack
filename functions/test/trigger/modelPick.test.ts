import { describe, it, expect, beforeAll } from "vitest";
import { setupTrigger, ev, LOC, RUN, T0, type TriggerEnv } from "./env";

// The model chosen in «Unknown piece» (payload.modelId) only fills a piece without a model; it never replaces the model
// the server already knows (the phone may not know the piece yet: a removal not processed, an old cache, a slow
// network). writeItem in trigger.ts: the catalog of the event is applied only when the item has no modelId.
let t: TriggerEnv;
const A = `mdl_TT_mp_a_${RUN}`, B = `mdl_TT_mp_b_${RUN}`;
const item = async (eventId: string) => {
  const id = (await t.db.collection("events").doc(eventId).get()).get("itemId") as string;
  return (await t.db.collection("items").doc(id).get()).data()!;
};

beforeAll(async () => {
  t = await setupTrigger();
  for (const [id, mc] of [[A, `MC-MPA-${RUN}`], [B, `MC-MPB-${RUN}`]]) {
    await t.db.collection("models").doc(id).set({ materialCode: mc, model: id.endsWith(A.slice(-6)) ? "Model A" : "Model B", manufacturer: "Acme", equipmentType: "Radio unit", active: true });
  }
});

describe("the model picked on the phone (payload.modelId)", () => {
  it("does not replace the model the piece already has", async () => {
    const code = `SN-${RUN}-MP-KNOWN`;
    const first = await t.fire(ev("arrive_at_warehouse", code, { locationId: LOC.nordWh, payload: { flow: "new", modelId: A } }));
    expect(await item(first)).toMatchObject({ modelId: A, needsModel: false });
    // Another reading, where the phone did not know the piece and the worker picked another model.
    const again = await t.fire(ev("arrive_at_warehouse", code, { at: T0 + 1000, locationId: LOC.nordWh2, payload: { flow: "new", modelId: B } }));
    expect(await item(again)).toMatchObject({ modelId: A, model: "Model A", needsModel: false, currentLocationId: LOC.nordWh2 });
  });

  it("fills a piece that has no model yet", async () => {
    const code = `SN-${RUN}-MP-EMPTY`;
    const removal = await t.fire(ev("remove_at_site", code));
    expect(await item(removal)).toMatchObject({ modelId: null, needsModel: true });
    const arrival = await t.fire(ev("arrive_at_warehouse", code, { at: T0 + 1000, locationId: LOC.nordWh, payload: { flow: "removed", modelId: B } }));
    expect(await item(arrival)).toMatchObject({ modelId: B, needsModel: false });
  });
});
