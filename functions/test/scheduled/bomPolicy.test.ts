import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { createRequire } from "node:module";
import { setupScheduled, type ScheduledEnv } from "./env";

// P-114 n.19 and n.15, SPEC §11.3 and §14 (fieldPolicy). Own project: these tests change settings/fieldPolicy.
// n.19 red before: the "Compare" button and "mark checked" counted readings made at the site before the BOM existed,
//   while the automatic check (bomCheck) counts only those since the BOM date.
// n.15 red before: with "accept silently" a piece found at the site but not in the BOM still raised the BOM alert.
const { computeCodeId } = createRequire(import.meta.url)("../../src/codeId.node.js") as { computeCodeId: (raw: string) => string };
let env: ScheduledEnv;
type Handlers = typeof import("../../src/routers/documents")["documents"];
let documents: Handlers;
let bomCheckForSite: (locationId: string, aspId: string) => Promise<void>;
const NORD = "org_asp_nord", SITE = "loc_TT-SITO-POLICY";
const BOM_AT = Date.UTC(2026, 9, 10, 8);
const ca = { uid: "tt_ca", role: "client_admin", orgId: "org_client", ip: "test", token: {} } as Parameters<Handlers["compareDocument"]["handler"]>[0];
let n = 0;
const install = (code: string, at: number) => env.admin.db.collection("events").doc(`ev_pol_${n++}`).set({
  type: "install_at_site", codeRaw: code, codeId: computeCodeId(code), locationId: SITE, aspId: NORD, scannedAt: Timestamp.fromMillis(at), voided: false, payload: {},
});
const bom = (id: string, codes: string[]) => env.admin.db.collection("documents").doc(id).set({
  kind: "bom", number: id, aspId: NORD, locationId: SITE, status: "open", version: 1, createdAt: Timestamp.fromMillis(BOM_AT),
  lines: codes.map((c) => ({ kind: "serial", codeRaw: c, codeId: computeCodeId(c), direction: "install" })),
});
const alertOf = async (id: string) => (await env.admin.db.collection("alerts").doc(`bom-${id}`).get()).data();

beforeAll(async () => {
  env = await setupScheduled("demo-bompolicy-tests");
  documents = (await import("../../src/routers/documents")).documents;
  ({ bomCheckForSite } = await import("../../src/shared/bomCheck"));
});
beforeEach(async () => {
  await env.clear();
  await env.admin.db.collection("locations").doc(SITE).set({ code: "TT-SITO-POLICY", name: "Sito", type: "site", aspId: NORD, active: true });
});

describe("n.19: the manual comparison of a BOM counts the readings since the BOM, as the automatic one", () => {
  it("a piece installed at the site before the BOM is neither unexpected nor arrived, in Compare and in mark checked", async () => {
    await bom("bom_p19", ["SN-P19-A"]);
    await install("SN-P19-OLD", BOM_AT - 86_400_000); // a day before the BOM: not part of it
    await install("SN-P19-A", BOM_AT + 60_000);
    const r = await documents.compareDocument.handler(ca, { documentId: "bom_p19" }) as { totals: Record<string, number> };
    expect(r.totals).toMatchObject({ arrived: 1, missing: 0, unexpected: 0 });
    await documents.markDocumentChecked.handler(ca, { documentId: "bom_p19" });
    expect(await alertOf("bom_p19")).toBeUndefined();
  });
});

describe("n.15: fieldPolicy «accept silently»: a piece at the site but not in the BOM raises no alert; missing pieces still do", () => {
  it("accept_and_alert (default): the extra piece is an alert", async () => {
    await bom("bom_p15a", ["SN-P15-A"]);
    await install("SN-P15-A", BOM_AT + 60_000);
    await install("SN-P15-X", BOM_AT + 120_000);
    await bomCheckForSite(SITE, NORD);
    expect(await alertOf("bom_p15a")).toMatchObject({ count: 1, detail: { unexpected: 1 } });
  });
  it("accept_silently: no alert for the extra piece, in the automatic check and in mark checked", async () => {
    await env.admin.db.collection("settings").doc("fieldPolicy").set({ pieceAtSiteNotInBom: "accept_silently" });
    await bom("bom_p15s", ["SN-P15-B"]);
    await install("SN-P15-B", BOM_AT + 60_000);
    await install("SN-P15-Y", BOM_AT + 120_000);
    await bomCheckForSite(SITE, NORD);
    expect(await alertOf("bom_p15s")).toBeUndefined();
    await documents.markDocumentChecked.handler(ca, { documentId: "bom_p15s" });
    expect(await alertOf("bom_p15s")).toBeUndefined();
  });
  it("accept_silently: a missing piece is still an alert, counted without the extra ones", async () => {
    await env.admin.db.collection("settings").doc("fieldPolicy").set({ pieceAtSiteNotInBom: "accept_silently" });
    await bom("bom_p15m", ["SN-P15-C", "SN-P15-D"]);
    await install("SN-P15-C", BOM_AT + 60_000);
    await install("SN-P15-Z", BOM_AT + 120_000);
    await bomCheckForSite(SITE, NORD);
    expect(await alertOf("bom_p15m")).toMatchObject({ count: 1, detail: { missing: 1, unexpected: 0, unexpectedCodes: [] } });
  });
});
