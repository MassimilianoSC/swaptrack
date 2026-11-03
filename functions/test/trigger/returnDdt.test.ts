import { describe, it, expect, beforeAll } from "vitest";
import { setupTrigger, ev, LOC, NORD, RUN, T0, type TriggerEnv } from "./env";

// P-114 n.18, SPEC §11.3 "ddt_return: pieces of the shipment vs pieces confirmed by the client". The return DDT
// attached from the shipment page is saved with lines: []. Red before: the comparison had no expected line (every
// confirmed piece "unexpected", nothing "missing"); now the expected lines are the shipment's.
let t: TriggerEnv;
type Docs = typeof import("../../src/routers/documents")["documents"];
type Ships = typeof import("../../src/routers/shipments")["shipments"];
let documents: Docs, shipments: Ships;
const nw = { uid: "tt_nw", role: "asp_warehouse", orgId: NORD, ip: "test", token: { active: true } } as Parameters<Docs["saveDocument"]["handler"]>[0];
const cw = { uid: "tt_cw", role: "client_warehouse", orgId: "org_client", ip: "test", token: {} } as Parameters<Ships["confirmReturn"]["handler"]>[0];

beforeAll(async () => {
  t = await setupTrigger();
  ({ documents } = await import("../../src/routers/documents"));
  ({ shipments } = await import("../../src/routers/shipments"));
});

describe("return DDT attached to a shipment (§11.3)", () => {
  it("compares the shipment's pieces with those the client confirmed", async () => {
    const sh = `sh_TT_retddt_${RUN}`;
    await t.db.collection("shipments").doc(sh).set({ kind: "return", fromLocationId: LOC.nordWh, fromAspId: NORD, toLocationId: LOC.clientWh, toAspId: null, status: "draft", itemCount: 0, documentId: null });
    const ids: string[] = [];
    for (const c of [`SN-${RUN}-RD-A`, `SN-${RUN}-RD-B`]) {
      const first = await t.fire(ev("arrive_at_warehouse", c, { payload: { flow: "removed", categoryId: "cat_t" } }));
      ids.push((await t.db.collection("events").doc(first).get()).get("itemId"));
      await t.fire(ev("return_ship", c, { at: T0 + 1000, payload: { shipmentId: sh } }));
    }
    await t.db.collection("shipments").doc(sh).update({ status: "sent" });
    // The ASP attaches the DDT file from the shipment page: no lines typed.
    const { documentId } = await documents.saveDocument.handler(nw, { kind: "ddt_return", number: `R-${RUN}`, locationId: LOC.nordWh, linesSource: "manual", lines: [], shipmentId: sh }) as { documentId: string };
    await shipments.confirmReturn.handler(cw, { shipmentId: sh, confirmed: [ids[0]], missing: [ids[1]], extra: [] });
    for (const e of (await t.db.collection("events").where("payload.shipmentId", "==", sh).get()).docs) if (!e.get("processedAt")) await t.processEvent(e.id);
    const r = await documents.compareDocument.handler(nw, { documentId }) as { arrived: string[]; missing: string[]; unexpected: string[] };
    expect([r.arrived, r.missing, r.unexpected]).toEqual([[`SN-${RUN}-RD-A`], [`SN-${RUN}-RD-B`], []]);
  });
});
