import { describe, it, expect, beforeAll } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { setupTrigger, ev, computeCodeId, NORD, UID, RUN, T0, type TriggerEnv } from "./env";

// PIANO P-48: a voided scan ("undo last", §8.2) must not count in the document comparison (§11.3), as it does
// not count in the replay. Red on d21fb8f: compareDocument and bomCheckForSite counted the voided event.
// Own locations per run: the comparison reads every event of the location, other files write at the shared ones.
let t: TriggerEnv;
const WH = `loc_TT-MAG-VOID-${RUN}`, SITE = `loc_TT-SITO-VOID-${RUN}`;
const loc = (code: string, type: string) => ({ code, name: code, type, aspId: NORD, active: true, region: "Test" });
const serial = (codeRaw: string, direction?: "install" | "remove") =>
  ({ kind: "serial", codeRaw, codeId: computeCodeId(codeRaw), materialCode: null, modelId: null, ...(direction ? { direction } : {}) });

beforeAll(async () => {
  t = await setupTrigger();
  await t.db.collection("locations").doc(WH).set(loc(`TT-MAG-VOID-${RUN}`, "asp_warehouse"));
  await t.db.collection("locations").doc(SITE).set(loc(`TT-SITO-VOID-${RUN}`, "site"));
});

describe("a voided scan does not count in the document comparison (§8.2, §11.3)", () => {
  it("ddt_in: an arrival read by mistake and undone is neither arrived nor unexpected", async () => {
    const ddt = `ddt_void_${RUN}`, a = `SN-${RUN}-VA`, b = `SN-${RUN}-VB`, wrong = `SN-${RUN}-VX`;
    await t.db.collection("documents").doc(ddt).set({ kind: "ddt_in", number: `D-${RUN}`, aspId: NORD, locationId: WH, status: "open", lines: [serial(a), serial(b)] });
    await t.fire(ev("arrive_at_warehouse", a, { locationId: WH, payload: { flow: "new", ddtId: ddt } }));
    const mistake = await t.fire(ev("arrive_at_warehouse", wrong, { locationId: WH, at: T0 + 1000, payload: { flow: "new", ddtId: ddt } }));
    await t.fire(ev("void", null, { locationId: WH, at: T0 + 2000, payload: { targetEventId: mistake } }));
    expect((await t.db.collection("events").doc(mistake).get()).get("voided")).toBe(true);

    const { documents } = await import("../../src/routers/documents");
    const ctx = { uid: UID.nw, role: "asp_warehouse", orgId: NORD, ip: "test", token: {} } as const;
    const r = await documents.compareDocument.handler(ctx, { documentId: ddt });
    expect(r.totals).toMatchObject({ arrived: 1, missing: 1, unexpected: 0 });
  });

  it("bom: an installation read by mistake and undone raises no unexpected piece at site_done", async () => {
    const bom = `bom_void_${RUN}`, a = `SN-${RUN}-BA`, wrong = `SN-${RUN}-BX`;
    await t.db.collection("documents").doc(bom).set({ kind: "bom", number: `B-${RUN}`, aspId: NORD, locationId: SITE, status: "open", version: 1,
      createdAt: Timestamp.fromMillis(T0 - 60_000), lines: [serial(a, "install")] });
    await t.fire(ev("install_at_site", a, { locationId: SITE }));
    const mistake = await t.fire(ev("install_at_site", wrong, { locationId: SITE, at: T0 + 1000 }));
    await t.fire(ev("void", null, { locationId: SITE, userId: UID.nt, at: T0 + 2000, payload: { targetEventId: mistake } }));
    expect((await t.db.collection("events").doc(mistake).get()).get("voided")).toBe(true);

    const { bomCheckForSite } = await import("../../src/shared/bomCheck");
    await bomCheckForSite(SITE, NORD);
    const alert = (await t.db.collection("alerts").doc(`bom-${bom}`).get()).data();
    expect(alert?.detail?.unexpected ?? 0).toBe(0);
  });
});
