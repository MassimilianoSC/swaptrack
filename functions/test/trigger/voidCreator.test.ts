import { describe, it, expect, beforeAll } from "vitest";
import { setupTrigger, ev, computeCodeId, NORD, RUN, T0, type TriggerEnv } from "./env";

// P-114 n.22, D-53 ("the replay is the truth", §8.2): undoing the only reading that created a piece leaves no valid
// reading, so the piece does not exist: the item and its codes are deleted in the same transaction, the counters
// go down, the undone event stays in the history. Red before: the item kept its state and its code.
let t: TriggerEnv;
const undo = (target: string, at: number) => t.fire(ev("void", null, { at, payload: { targetEventId: target } }));

// Own project: the test reads the dashboard counters, which other files running in parallel would change.
beforeAll(async () => { t = await setupTrigger("demo-voidcreator-tests"); });
// Pieces of ASP Nord "new | received_at_asp" on the dashboard (statusByFlow, summed over the shards).
const counted = async () => (await t.db.collection("aggregates").where("scope", "==", NORD).where("dimension", "==", "statusByFlow").get())
  .docs.reduce((n, d) => n + ((d.get("counts") ?? {})["new|received_at_asp"] ?? 0), 0);

describe("undoing the reading that created a piece (D-53)", () => {
  it("the piece and its code are gone, the undone event stays; reading the code again makes a new piece", async () => {
    const code = `SN-${RUN}-VOIDC`;
    const before = await counted();
    const created = await t.fire(ev("arrive_at_warehouse", code, { payload: { flow: "new" } }));
    const itemId = (await t.db.collection("events").doc(created).get()).get("itemId") as string;
    expect((await t.db.collection("items").doc(itemId).get()).exists).toBe(true);
    expect(await counted()).toBe(before + 1);
    await undo(created, T0 + 1000);
    expect(await counted()).toBe(before); // the dashboard no longer counts the piece
    expect((await t.db.collection("items").doc(itemId).get()).exists).toBe(false);
    expect((await t.db.collection("codes").doc(computeCodeId(code)).get()).exists).toBe(false);
    expect((await t.db.collection("events").doc(created).get()).data()).toMatchObject({ voided: true, itemId });
    const again = await t.fire(ev("arrive_at_warehouse", code, { at: T0 + 2000, payload: { flow: "new" } }));
    const newItem = (await t.db.collection("events").doc(again).get()).get("itemId") as string;
    expect(newItem).not.toBe(itemId);
    expect((await t.db.collection("items").doc(newItem).get()).get("status")).toBe("received_at_asp");
  });

  it("a piece with another valid reading stays, with the state of that reading", async () => {
    const code = `SN-${RUN}-VOIDK`;
    const first = await t.fire(ev("arrive_at_warehouse", code, { payload: { flow: "removed" } }));
    const itemId = (await t.db.collection("events").doc(first).get()).get("itemId") as string;
    const sorted = await t.fire(ev("classify", code, { at: T0 + 1000, payload: { categoryId: "cat_t" } }));
    await undo(sorted, T0 + 2000);
    expect((await t.db.collection("items").doc(itemId).get()).get("status")).toBe("received_at_asp");
    expect((await t.db.collection("codes").doc(computeCodeId(code)).get()).get("itemId")).toBe(itemId);
  });
});
