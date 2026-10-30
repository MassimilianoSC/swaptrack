import { describe, it, expect, beforeAll } from "vitest";
import { setupTrigger, ev, computeCodeId, NORD, CENTRO, RUN, T0, type TriggerEnv } from "./env";

// PIANO P-49: a document belongs to the ASP of its location, whoever uploads it (§3.3, §11.1: client_admin uploads
// BOMs and DDTs for an ASP). Red on d21fb8f: the server took aspId from the request, the app never sends it, so a
// client upload had aspId null (invisible to the ASP, ignored by the BOM check, stored under documents/client/).
// Also: saving over an existing document of another ASP (known documentId) must be refused.
let t: TriggerEnv;
type Handlers = typeof import("../../src/routers/documents")["documents"];
let documents: Handlers;
const SITE = `loc_TT-SITO-DOCASP-${RUN}`, SITE_C = `loc_TT-SITO-DOCASP-C-${RUN}`;
const loc = (code: string, aspId: string) => ({ code, name: code, type: "site", aspId, active: true, region: "Test" });
const ctxOf = (role: string, orgId: string) => ({ uid: `tt_${role}`, role, orgId, ip: "test", token: {} }) as Parameters<Handlers["saveDocument"]["handler"]>[0];
const CA = () => ctxOf("client_admin", "org_client");
const install = (codeRaw: string) => ({ kind: "serial" as const, codeRaw, direction: "install" as const });

beforeAll(async () => {
  t = await setupTrigger();
  ({ documents } = await import("../../src/routers/documents"));
  await t.db.collection("locations").doc(SITE).set(loc(`TT-SITO-DOCASP-${RUN}`, NORD));
  await t.db.collection("locations").doc(SITE_C).set(loc(`TT-SITO-DOCASP-C-${RUN}`, CENTRO));
});

describe("a document belongs to the ASP of its location (§3.3, §11.2)", () => {
  it("client_admin uploads a BOM for a Nord site: the document, its expected codes and the BOM check are Nord's", async () => {
    const a = `SN-${RUN}-DA`, b = `SN-${RUN}-DB`;
    const r = await documents.saveDocument.handler(CA(), { kind: "bom", number: `B-${RUN}`, locationId: SITE, linesSource: "manual", lines: [install(a), install(b)] }) as { documentId: string };
    const doc = (await t.db.collection("documents").doc(r.documentId).get()).data()!;
    expect(doc.aspId).toBe(NORD);
    expect((await t.db.collection("expectedCodes").doc(`${computeCodeId(a)}_${r.documentId}`).get()).get("aspId")).toBe(NORD);

    // The BOM check of the site finds it: one of two installed, one missing.
    await t.db.collection("documents").doc(r.documentId).update({ createdAt: new Date(T0 - 60_000) });
    await t.fire(ev("install_at_site", a, { locationId: SITE }));
    const { bomCheckForSite } = await import("../../src/shared/bomCheck");
    await bomCheckForSite(SITE, NORD);
    const alert = (await t.db.collection("alerts").doc(`bom-${r.documentId}`).get()).data();
    expect(alert).toMatchObject({ kind: "bom_difference", aspId: NORD, detail: { missing: 1 } });
  });

  it("an aspId sent by the client is ignored: the location decides", async () => {
    const r = await documents.saveDocument.handler(CA(), { kind: "bom", number: `B2-${RUN}`, aspId: CENTRO, locationId: SITE, linesSource: "manual", lines: [] } as never) as { documentId: string };
    expect((await t.db.collection("documents").doc(r.documentId).get()).get("aspId")).toBe(NORD);
  });

  it("an ASP saves only at its own locations, and never over a document of another ASP", async () => {
    const nordAdmin = ctxOf("asp_admin", NORD);
    await expect(documents.saveDocument.handler(nordAdmin, { kind: "bom", number: `B3-${RUN}`, locationId: SITE_C, linesSource: "manual", lines: [] }))
      .rejects.toMatchObject({ code: "permission-denied" });
    const centro = await documents.saveDocument.handler(ctxOf("asp_admin", CENTRO), { kind: "bom", number: `B4-${RUN}`, locationId: SITE_C, linesSource: "manual", lines: [install(`SN-${RUN}-DC`)] }) as { documentId: string };
    await expect(documents.saveDocument.handler(nordAdmin, { documentId: centro.documentId, kind: "bom", number: `B4-${RUN}`, locationId: SITE, linesSource: "manual", lines: [] }))
      .rejects.toMatchObject({ code: "permission-denied" });
    const after = (await t.db.collection("documents").doc(centro.documentId).get()).data()!;
    expect(after).toMatchObject({ aspId: CENTRO, locationId: SITE_C, version: 1 });
  });

  it("D-29: a DDT checked again after the missing piece arrived: the open ddt_in alert goes to count 0", async () => {
    const WH = `loc_TT-MAG-DOCDDT-${RUN}`, a = `SN-${RUN}-DDA`, b = `SN-${RUN}-DDB`;
    await t.db.collection("locations").doc(WH).set({ ...loc(`TT-MAG-DOCDDT-${RUN}`, NORD), type: "asp_warehouse" });
    const nw = ctxOf("asp_warehouse", NORD);
    const r = await documents.saveDocument.handler(nw, { kind: "ddt_in", number: `D-${RUN}`, locationId: WH, linesSource: "manual",
      lines: [{ kind: "serial", codeRaw: a }, { kind: "serial", codeRaw: b }] }) as { documentId: string };
    const model = { modelId: `mdl_TT_dd_${RUN}` };
    await t.db.collection("models").doc(model.modelId).set({ materialCode: `MC-DD-${RUN}`, model: "TT", manufacturer: "Acme", equipmentType: "radio", active: true });
    await t.fire(ev("arrive_at_warehouse", a, { locationId: WH, payload: { flow: "new", ddtId: r.documentId, ...model } }));
    await documents.markDocumentChecked.handler(nw, { documentId: r.documentId });
    expect((await t.db.collection("alerts").doc(`ddt-${r.documentId}`).get()).get("count")).toBe(1);
    await t.fire(ev("arrive_at_warehouse", b, { locationId: WH, at: T0 + 1000, payload: { flow: "new", ddtId: r.documentId, ...model } }));
    await documents.markDocumentChecked.handler(nw, { documentId: r.documentId });
    expect((await t.db.collection("alerts").doc(`ddt-${r.documentId}`).get()).data()).toMatchObject({ count: 0, closedAt: null, detail: { missing: 0 } });
  });

  it("a return DDT is attached only to a shipment of the same ASP", async () => {
    const WH = `loc_TT-MAG-DOCASP-${RUN}`, SH_C = `sh_TT_docasp_c_${RUN}`;
    await t.db.collection("locations").doc(WH).set({ ...loc(`TT-MAG-DOCASP-${RUN}`, NORD), type: "asp_warehouse" });
    await t.db.collection("shipments").doc(SH_C).set({ kind: "return", fromAspId: CENTRO, fromLocationId: "x", toAspId: null, status: "draft", itemCount: 0 });
    await expect(documents.saveDocument.handler(ctxOf("asp_warehouse", NORD), { kind: "ddt_return", number: `R-${RUN}`, locationId: WH, linesSource: "manual", lines: [], shipmentId: SH_C }))
      .rejects.toMatchObject({ code: "permission-denied" });
    expect((await t.db.collection("shipments").doc(SH_C).get()).get("documentId")).toBeUndefined();
  });
});
