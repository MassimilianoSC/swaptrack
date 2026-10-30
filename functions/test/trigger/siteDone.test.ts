import { describe, it, expect, beforeAll } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { setupTrigger, ev, computeCodeId, NORD, RUN, T0, type TriggerEnv } from "./env";

// Path 1 of the demo, PIANO P-57: a technician's phone back online sends its scans and the site_done together; the
// triggers run in parallel. Red on 3e24041: the site_done ran the BOM check before the installation was processed
// (no item yet → "model unknown") and raised a false bom_difference that nothing corrected later.
let t: TriggerEnv;
const MODEL = `mdl_TT_${RUN}`;
const site = (n: string) => `loc_TT-SITO-DONE-${n}-${RUN}`;
const write = async (data: Record<string, unknown>) => { const id = randomUUID(); await t.db.collection("events").doc(id).set(data); return id; };
const now = () => Timestamp.now();

async function siteWithBom(n: string, code: string) {
  await t.db.collection("locations").doc(site(n)).set({ code: site(n), name: site(n), type: "site", aspId: NORD, active: true, region: "Test" });
  await t.db.collection("documents").doc(`bom_done_${n}_${RUN}`).set({ kind: "bom", number: `B-${n}`, aspId: NORD, locationId: site(n), status: "open", version: 1,
    createdAt: Timestamp.fromMillis(T0 - 60_000), lines: [{ kind: "serial", codeRaw: code, codeId: computeCodeId(code), direction: "install" }] });
}
const alertOf = async (n: string) => (await t.db.collection("alerts").doc(`bom-bom_done_${n}_${RUN}`).get()).data();

beforeAll(async () => {
  t = await setupTrigger();
  await t.db.collection("models").doc(MODEL).set({ materialCode: `MC-${RUN}`, model: "TT", manufacturer: "Acme", equipmentType: "radio", active: true });
});

describe("site_done waits for the scans of the site (§11.3, P-57)", () => {
  it("the installation is processed while the site_done waits: one check of the complete site, no false alert", async () => {
    const code = `SN-${RUN}-DONE0`;
    await siteWithBom("0", code);
    const install = await write(ev("install_at_site", code, { locationId: site("0"), payload: { modelId: MODEL }, createdAt: now() }));
    const done = await write(ev("site_done", null, { locationId: site("0"), at: T0 + 1000, createdAt: now() }));
    await Promise.all([t.processEvent(done), new Promise((r) => setTimeout(r, 1000)).then(() => t.processEvent(install))]);
    expect((await t.db.collection("events").doc(done).get()).get("outcome")).toBe("ok");
    expect(await alertOf("0")).toBeUndefined();
  });
  it("the installation is still not processed after the wait: transient error (retry), then the complete check", async () => {
    const code = `SN-${RUN}-DONE1`;
    await siteWithBom("1", code);
    const install = await write(ev("install_at_site", code, { locationId: site("1"), payload: { modelId: MODEL }, createdAt: now() }));
    const done = await write(ev("site_done", null, { locationId: site("1"), at: T0 + 1000, createdAt: now() }));
    await expect(t.processEvent(done)).rejects.toThrow(/still being processed/);
    expect(await alertOf("1")).toBeUndefined();
    expect((await t.db.collection("events").doc(done).get()).data()).toMatchObject({ bomCheckWaits: 1 });
    expect((await t.db.collection("events").doc(done).get()).get("processedAt")).toBeUndefined();
    // The retry after the installation was processed.
    await t.processEvent(install);
    await t.processEvent(done);
    expect((await t.db.collection("events").doc(done).get()).get("outcome")).toBe("ok");
    expect(await alertOf("1")).toBeUndefined();
  });
  it("D-29: the technician comes back and installs the missing piece: the open BOM alert goes to count 0, still open", async () => {
    const code = `SN-${RUN}-DONE4`;
    await siteWithBom("4", code);
    const { bomCheckForSite } = await import("../../src/shared/bomCheck");
    await bomCheckForSite(site("4"), NORD);
    expect((await alertOf("4"))!.count).toBe(1);
    await t.fire(ev("install_at_site", code, { locationId: site("4"), payload: { modelId: MODEL } }));
    await bomCheckForSite(site("4"), NORD);
    expect(await alertOf("4")).toMatchObject({ count: 0, closedAt: null, detail: { missing: 0 } });
  });
  it("the wait is bounded: 10 minutes after the event reached the server, the check runs with what is there", async () => {
    const code = `SN-${RUN}-DONE2`;
    await siteWithBom("2", code);
    await write(ev("install_at_site", code, { locationId: site("2"), payload: { modelId: MODEL }, createdAt: now() }));
    const done = await write(ev("site_done", null, { locationId: site("2"), at: T0 + 1000, createdAt: Timestamp.fromMillis(Date.now() - 11 * 60_000) }));
    await t.processEvent(done);
    expect((await t.db.collection("events").doc(done).get()).get("outcome")).toBe("ok");
  });
  it("the wait is bounded: after 10 attempts, the check runs with what is there", async () => {
    const code = `SN-${RUN}-DONE3`;
    await siteWithBom("3", code);
    await write(ev("install_at_site", code, { locationId: site("3"), payload: { modelId: MODEL }, createdAt: now() }));
    const done = await write({ ...ev("site_done", null, { locationId: site("3"), at: T0 + 1000, createdAt: now() }), bomCheckWaits: 10 });
    await t.processEvent(done);
    expect((await t.db.collection("events").doc(done).get()).get("outcome")).toBe("ok");
  });
});

