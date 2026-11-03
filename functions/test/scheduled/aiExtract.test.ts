import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { setupScheduled, type ScheduledEnv } from "./env";

// D-45 / D-46: extractDocument on the emulators (project demo-*: the fixed fake model, no network). Whoever may upload
// the document may use it; the switch is off by default; one daily counter per user; the model only proposes lines,
// nothing is saved.
let env: ScheduledEnv;
type Handlers = typeof import("../../src/routers/documents")["documents"];
let documents: Handlers;
type Ai = typeof import("../../src/core/aiExtract");
let ai: Ai;
type Ctx = Parameters<Handlers["saveDocument"]["handler"]>[0];
const NORD = "org_asp_nord", CENTRO = "org_asp_centro";
const WH = "loc_TT-MAG-AI", WH_C = "loc_TT-MAG-AI-C", SITE = "loc_TT-SITO-AI";
const ctxOf = (role: string, orgId: string, uid = `tt_ai_${role}_${orgId}`) => ({ uid, role, orgId, ip: "test", token: {} }) as Ctx;
const nw = ctxOf("asp_warehouse", NORD), cw = ctxOf("asp_warehouse", CENTRO), ca = ctxOf("client_admin", "org_client");
const pdf = { base64: Buffer.from("%PDF-1.4 ddt").toString("base64"), contentType: "application/pdf" };
const csv = { base64: Buffer.from("serial\nSN-1").toString("base64"), contentType: "text/csv" };
const features = (v: Record<string, unknown>) => env.admin.db.collection("settings").doc("features").set(v);
const save = async (ctx: Ctx, kind: "ddt_in" | "bom", locationId: string, files: Array<typeof pdf>) =>
  ((await documents.saveDocument.handler(ctx, { kind, number: `AI-${kind}-${Math.random()}`, locationId, linesSource: "manual", lines: [], files })) as { documentId: string }).documentId;
const extract = (ctx: Ctx, documentId: string) => documents.extractDocument.handler(ctx, { documentId }) as Promise<{ lines: unknown[]; warnings: string[]; pages: number }>;

beforeAll(async () => {
  env = await setupScheduled("demo-aiextract-tests");
  await env.clear();
  documents = (await import("../../src/routers/documents")).documents;
  ai = await import("../../src/core/aiExtract");
  const loc = (code: string, type: string, aspId: string) => ({ code, name: code, type, aspId, active: true });
  await env.admin.db.collection("locations").doc(WH).set(loc("TT-MAG-AI", "asp_warehouse", NORD));
  await env.admin.db.collection("locations").doc(WH_C).set(loc("TT-MAG-AI-C", "asp_warehouse", CENTRO));
  await env.admin.db.collection("locations").doc(SITE).set(loc("TT-SITO-AI", "site", NORD));
});
beforeEach(async () => { ai.setModelForTests(null); await features({ aiDocumentExtraction: true }); });

describe("extractDocument (D-45, D-46)", () => {
  it("off by default: feature_disabled", async () => {
    const id = await save(nw, "ddt_in", WH, [pdf]);
    await env.admin.db.collection("settings").doc("features").delete();
    await expect(extract(nw, id)).rejects.toMatchObject({ code: "failed-precondition", message: "feature_disabled" });
  });

  it("proposes lines (fake model on the emulators) and saves nothing", async () => {
    const id = await save(nw, "ddt_in", WH, [pdf]);
    const r = await extract(nw, id);
    expect(r).toEqual({ lines: [{ kind: "serial", codeRaw: "AI-DEMO-0001", materialCode: null }, { kind: "serial", codeRaw: "AI-DEMO-0002", materialCode: null }], warnings: ["demo_extraction"], pages: 1 });
    const doc = (await env.admin.db.collection("documents").doc(id).get()).data()!;
    expect([doc.version, doc.lines]).toEqual([1, []]);
  });

  it("a BOM gets directions; client_admin may read a document of an ASP", async () => {
    const id = await save(ca, "bom", SITE, [pdf]);
    const r = await extract(ca, id);
    expect(r.lines).toEqual([
      { kind: "serial", codeRaw: "AI-DEMO-0001", materialCode: null, direction: "remove" },
      { kind: "serial", codeRaw: "AI-DEMO-0002", materialCode: null, direction: "install" },
    ]);
  });

  it("never a document of another ASP; never a document without pages it can read", async () => {
    const centro = await save(cw, "ddt_in", WH_C, [pdf]);
    await expect(extract(nw, centro)).rejects.toMatchObject({ code: "permission-denied" });
    const onlyCsv = await save(nw, "ddt_in", WH, [csv]);
    await expect(extract(nw, onlyCsv)).rejects.toMatchObject({ code: "invalid-argument", message: "unsupported_file_type" });
    await expect(extract(nw, "no-such-document")).rejects.toMatchObject({ code: "not-found", message: "document_not_found" });
  });

  it("a page it cannot read is skipped and reported", async () => {
    const id = await save(nw, "ddt_in", WH, [pdf, csv]);
    const r = await extract(nw, id);
    expect([r.pages, r.warnings]).toEqual([1, ["demo_extraction", "ai_file_skipped"]]);
  });

  it("daily limit per user (aiDailyLimit): the reading over the limit is refused, another user still reads", async () => {
    await features({ aiDocumentExtraction: true, aiDailyLimit: 2 });
    const user = ctxOf("asp_warehouse", NORD, `tt_ai_limit_${Date.now()}`);
    const other = ctxOf("asp_warehouse", NORD, `tt_ai_other_${Date.now()}`);
    const id = await save(user, "ddt_in", WH, [pdf]);
    await extract(user, id);
    await extract(user, id);
    await expect(extract(user, id)).rejects.toMatchObject({ code: "resource-exhausted", message: "ai_daily_limit" });
    await expect(extract(other, id)).resolves.toMatchObject({ pages: 1 });
  });

  it("a malformed answer proposes nothing; a failing model is ai_unavailable", async () => {
    const id = await save(nw, "ddt_in", WH, [pdf]);
    ai.setModelForTests(async () => ({ rows: "nonsense" }));
    expect(await extract(nw, id)).toEqual({ lines: [], warnings: ["ai_no_lines"], pages: 1 });
    ai.setModelForTests(async () => { throw new Error("boom"); });
    await expect(extract(nw, id)).rejects.toMatchObject({ code: "failed-precondition", message: "ai_unavailable" });
  });
});

// D-49: the label of a piece, photographed by the worker; the photo is not stored here (it follows the reading).
describe("extractLabel (D-49)", () => {
  const jpeg = (size = 64) => Buffer.alloc(size, 7).toString("base64");
  const label = (ctx: Ctx, base64: string, contentType = "image/jpeg") =>
    documents.extractLabel.handler(ctx, { base64, contentType }) as Promise<{ codes: Array<{ code: string; uncertainAt: number[] }>; warnings: string[] }>;
  const nt = ctxOf("asp_technician", NORD, `tt_ai_label_${Date.now()}`);

  it("only who records readings; proposes the fixed codes on the emulators, with the doubtful character", async () => {
    expect([...documents.extractLabel.roles as readonly string[]].sort()).toEqual(["asp_admin", "asp_technician", "asp_warehouse"]);
    expect(await label(nt, jpeg())).toEqual({ codes: [{ code: "AI-LABEL-0001", uncertainAt: [] }, { code: "AI-LABEL-0O01", uncertainAt: [10] }], warnings: ["demo_extraction"] });
  });

  it("refuses other file types and photos over 1 MB; off when the switch is off", async () => {
    await expect(label(nt, jpeg(), "application/pdf")).rejects.toMatchObject({ code: "invalid-argument", message: "unsupported_file_type" });
    await expect(label(nt, jpeg(1024 * 1024 + 1))).rejects.toMatchObject({ code: "invalid-argument", message: "file_too_large" });
    await features({ aiDocumentExtraction: false });
    await expect(label(nt, jpeg())).rejects.toMatchObject({ code: "failed-precondition", message: "feature_disabled" });
  });

  it("documents and labels share one daily counter per user", async () => {
    await features({ aiDocumentExtraction: true, aiDailyLimit: 2 });
    const user = ctxOf("asp_warehouse", NORD, `tt_ai_shared_${Date.now()}`);
    const id = await save(user, "ddt_in", WH, [pdf]);
    await extract(user, id);
    await label(user, jpeg());
    await expect(label(user, jpeg())).rejects.toMatchObject({ code: "resource-exhausted", message: "ai_daily_limit" });
  });
});
