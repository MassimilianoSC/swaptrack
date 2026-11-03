import { describe, it, expect, beforeAll } from "vitest";
import { setupScheduled, type ScheduledEnv } from "./env";

// P-105 (point 1), SPEC §11.2: "A document is never deleted: it is corrected, creating a new version and keeping the
// previous one in history". Red on ffc339e: the files of a new version were stored at the same paths as the previous
// version's (1.pdf, 2.jpg…), so history pointed at the new content and the old pages were lost.
let env: ScheduledEnv;
type Handlers = typeof import("../../src/routers/documents")["documents"];
let documents: Handlers;
const WH = "loc_TT-MAG-DOCVER";
const ctx = { uid: "tt_dv", role: "asp_warehouse", orgId: "org_asp_nord", ip: "test", token: {} } as Parameters<Handlers["saveDocument"]["handler"]>[0];
const pdf = (text: string) => ({ base64: Buffer.from(`%PDF-1.4 ${text}`).toString("base64"), contentType: "application/pdf" });
const read = async (path: string) => (await env.admin.bucket().file(path).download())[0].toString();

beforeAll(async () => {
  env = await setupScheduled("demo-docversion-tests");
  await env.clear();
  documents = (await import("../../src/routers/documents")).documents;
  await env.admin.db.collection("locations").doc(WH).set({ code: "TT-MAG-DOCVER", name: "TT-MAG-DOCVER", type: "asp_warehouse", aspId: "org_asp_nord", active: true });
});

describe("document versions keep their own files (§11.2)", () => {
  it("a new version that replaces the pages leaves the previous version's pages readable in history", async () => {
    const base = { kind: "ddt_in" as const, number: "DDT-VER-1", locationId: WH, linesSource: "manual" as const, lines: [] };
    const { documentId } = await documents.saveDocument.handler(ctx, { ...base, files: [pdf("first version")] }) as { documentId: string };
    await documents.saveDocument.handler(ctx, { ...base, documentId, keepFiles: [], files: [pdf("second version")] });
    const doc = (await env.admin.db.collection("documents").doc(documentId).get()).data()!;
    expect(doc.version).toBe(2);
    expect(doc.files).toHaveLength(1);
    expect(await read(doc.files[0])).toContain("second version");
    expect(await read(doc.history[0].files[0])).toContain("first version");
    expect(doc.files[0]).not.toBe(doc.history[0].files[0]);
  });
});

// D-47: pages are added to the current version unless the page says which ones to keep (keepFiles); a page left out
// stays in history (never deleted); at most 10 files in all. Red on 6b36997: a new version kept only its new files.
describe("adding and keeping pages (D-47)", () => {
  const base = (number: string) => ({ kind: "ddt_in" as const, number, locationId: WH, linesSource: "manual" as const, lines: [] });
  const load = async (id: string) => (await env.admin.db.collection("documents").doc(id).get()).data()!;

  it("without keepFiles the new pages are added to the previous ones", async () => {
    const { documentId } = await documents.saveDocument.handler(ctx, { ...base("DDT-ADD"), files: [pdf("page 1"), pdf("page 2")] }) as { documentId: string };
    await documents.saveDocument.handler(ctx, { ...base("DDT-ADD"), documentId, files: [pdf("page 3")] });
    const doc = await load(documentId);
    expect(doc.files).toHaveLength(3);
    expect(await Promise.all(doc.files.map(read))).toEqual(["%PDF-1.4 page 1", "%PDF-1.4 page 2", "%PDF-1.4 page 3"]);
  });

  it("keepFiles removes a wrong page from the current version, which stays in history", async () => {
    const { documentId } = await documents.saveDocument.handler(ctx, { ...base("DDT-KEEP"), files: [pdf("good"), pdf("wrong")] }) as { documentId: string };
    const first = await load(documentId);
    await documents.saveDocument.handler(ctx, { ...base("DDT-KEEP"), documentId, keepFiles: [first.files[0]], files: [pdf("retaken")] });
    const doc = await load(documentId);
    expect(await Promise.all(doc.files.map(read))).toEqual(["%PDF-1.4 good", "%PDF-1.4 retaken"]);
    expect(await read(doc.history[0].files[1])).toBe("%PDF-1.4 wrong");
  });

  it("refuses a kept file that is not a page of the document, and more than 10 files in all", async () => {
    const { documentId } = await documents.saveDocument.handler(ctx, { ...base("DDT-LIMIT"), files: Array.from({ length: 9 }, (_, i) => pdf(`p${i}`)) }) as { documentId: string };
    await expect(documents.saveDocument.handler(ctx, { ...base("DDT-LIMIT"), documentId, keepFiles: ["documents/org_asp_centro/ddt_in/x/1-1.pdf"] }))
      .rejects.toMatchObject({ code: "invalid-argument", message: "invalid_data" });
    await expect(documents.saveDocument.handler(ctx, { ...base("DDT-LIMIT"), documentId, files: [pdf("p9"), pdf("p10")] }))
      .rejects.toMatchObject({ code: "invalid-argument", message: "invalid_data" });
    expect((await load(documentId)).version).toBe(1);
  });
});
