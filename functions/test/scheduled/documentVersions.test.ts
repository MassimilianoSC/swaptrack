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
  it("a new version with new pages leaves the previous version's pages readable in history", async () => {
    const base = { kind: "ddt_in" as const, number: "DDT-VER-1", locationId: WH, linesSource: "manual" as const, lines: [] };
    const { documentId } = await documents.saveDocument.handler(ctx, { ...base, files: [pdf("first version")] }) as { documentId: string };
    await documents.saveDocument.handler(ctx, { ...base, documentId, files: [pdf("second version")] });
    const doc = (await env.admin.db.collection("documents").doc(documentId).get()).data()!;
    expect(doc.version).toBe(2);
    expect(await read(doc.files[0])).toContain("second version");
    expect(await read(doc.history[0].files[0])).toContain("first version");
    expect(doc.files[0]).not.toBe(doc.history[0].files[0]);
  });
});
