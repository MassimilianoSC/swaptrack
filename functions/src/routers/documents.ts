import { z } from "zod";
import { randomUUID } from "crypto";
import { FieldValue, Timestamp, Transaction } from "firebase-admin/firestore";
import { db, bucket } from "../core/admin";
import { fail } from "../core/errors";
import { makeRouter, op, Ctx } from "../core/router";
import { adminLog } from "../core/adminLog";
import { isClientRole } from "../shared/roles";
import { alertId } from "../shared/alertIds";
import { compareDocument, type DocKind, type Line, type EventFact } from "../shared/documents";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { computeCodeId, normalizeBarcode } = require("../codeId.node.js");

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const DOC_KINDS = ["ddt_in", "ddt_return", "bom"] as const;
const DOC_FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx", "text/csv": "csv",
};
const FILE_MAX = 5 * 1024 * 1024; // 5 MB per file (§7.3)

// §3.3: a document belongs to the ASP of its location, whoever uploads it (client_admin uploads BOMs and DDTs
// for an ASP). Returns that aspId; an ASP role writes only at its own locations.
async function ensureCanWrite(ctx: Ctx, kind: DocKind, locationId: string): Promise<string> {
  const loc = (await db.collection("locations").doc(locationId).get()).data();
  if (!loc) fail("not-found", "location_not_found");
  const expectType = kind === "bom" ? "site" : "asp_warehouse";
  if (loc!.type !== expectType || !loc!.aspId) fail("invalid-argument", "invalid_data");
  if (!isClientRole(ctx.role) && loc!.aspId !== ctx.orgId) fail("permission-denied", "forbidden");
  return loc!.aspId as string;
}

async function storeFiles(aspId: string, kind: DocKind, documentId: string, files: Array<{ base64: string; contentType: string }>): Promise<string[]> {
  const paths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ext = DOC_FILE_TYPES[f.contentType];
    if (!ext) fail("invalid-argument", "unsupported_file_type");
    const bytes = Buffer.from(f.base64, "base64");
    if (bytes.length > FILE_MAX) fail("invalid-argument", "file_too_large");
    // DECISIONS b5 / D29 (step 4 revision): kind is in the path so storage.rules gate reads by kind.
    const path = `documents/${aspId}/${kind}/${documentId}/${i + 1}.${ext}`;
    await bucket().file(path).save(bytes, { contentType: f.contentType, resumable: false });
    paths.push(path);
  }
  return paths;
}

async function writeExpectedCodes(tx: Transaction, kind: DocKind, documentId: string, aspId: string | null, locationId: string, lines: Line[]) {
  for (const line of lines) {
    if (line.kind !== "serial") continue;
    const codeId = line.codeId || (computeCodeId(line.codeRaw) as string);
    tx.set(db.collection("expectedCodes").doc(`${codeId}_${documentId}`), {
      codeId, documentId, kind, aspId, locationId, materialCode: line.materialCode ?? null, modelId: line.modelId ?? null, direction: line.direction ?? null,
    });
  }
}

async function fillModelsForAsp(aspId: string | null, lines: Line[]): Promise<void> {
  if (!aspId) return;
  const serials = lines.filter((l): l is Line & { kind: "serial" } => l.kind === "serial" && (!!l.modelId || !!l.materialCode));
  for (const line of serials) {
    const codeId = line.codeId || (computeCodeId(line.codeRaw) as string);
    const code = await db.collection("codes").doc(codeId).get();
    if (!code.exists || code.get("aspId") !== aspId) continue;
    const itemId = code.get("itemId") as string | undefined;
    if (!itemId) continue;
    const item = await db.collection("items").doc(itemId).get();
    if (!item.exists || !item.get("needsModel")) continue;
    let modelId = line.modelId ?? null;
    if (!modelId && line.materialCode) {
      const q = await db.collection("models").where("materialCode", "==", normalizeBarcode(line.materialCode)).limit(1).get();
      if (!q.empty) modelId = q.docs[0].id;
    }
    if (!modelId) continue;
    const m = (await db.collection("models").doc(modelId).get()).data();
    if (!m) continue;
    await db.collection("items").doc(itemId).update({ modelId, materialCode: m.materialCode, model: m.model, manufacturer: m.manufacturer, equipmentType: m.equipmentType, needsModel: false });
  }
}

const lineSchema = z.union([
  z.object({ kind: z.literal("serial"), codeRaw: z.string().trim().min(1).max(300), codeId: z.string().optional(), materialCode: z.string().optional().nullable(), modelId: z.string().optional().nullable(), direction: z.enum(["remove", "install"]).optional() }),
  z.object({ kind: z.literal("quantity"), materialCode: z.string().optional().nullable(), modelId: z.string().optional().nullable(), quantity: z.number().int().min(1).max(100000), direction: z.enum(["remove", "install"]).optional() }),
]);

const fileSchema = z.object({ base64: z.string().max(8_000_000), contentType: z.string().max(100) });

// Exported for the emulator tests (functions/test), which call the handlers in-process.
export const documents = {
  // §11.2: creates or replaces a document (new version). Writes expectedCodes and fills models for pieces of that ASP.
  saveDocument: op({
    roles: ["asp_admin", "asp_warehouse", "client_admin"],
    schema: z.object({
      documentId: z.string().optional(),
      kind: z.enum(DOC_KINDS),
      number: z.string().trim().min(1).max(120),
      locationId: z.string().min(1),
      linesSource: z.enum(["excel", "manual"]),
      lines: z.array(lineSchema).max(5000),
      files: z.array(fileSchema).max(10).optional(),
      shipmentId: z.string().optional(),
    }),
    handler: async (ctx, d) => {
      const aspId = await ensureCanWrite(ctx, d.kind, d.locationId);
      const ref = d.documentId ? db.collection("documents").doc(d.documentId) : db.collection("documents").doc();
      const prev = (await ref.get()).data();
      // A new version never moves a document to another ASP or kind: its history would become readable there.
      // Documents saved before P-49 by a client role have aspId null and take the ASP of their location.
      if (prev && (prev.kind !== d.kind || (prev.aspId != null && prev.aspId !== aspId))) fail("permission-denied", "forbidden");
      if (d.shipmentId && (await db.collection("shipments").doc(d.shipmentId).get()).get("fromAspId") !== aspId) fail("permission-denied", "forbidden");
      const normalized = d.lines.map((l): Line => l.kind === "serial"
        ? { kind: "serial", codeRaw: l.codeRaw, codeId: l.codeId || (computeCodeId(l.codeRaw) as string), materialCode: l.materialCode ?? null, modelId: l.modelId ?? null, direction: l.direction }
        : { kind: "quantity", materialCode: l.materialCode ?? null, modelId: l.modelId ?? null, quantity: l.quantity, direction: l.direction });
      // Duplicate number for the same kind + ASP (warn only, UI shows previous).
      const duplicates = await db.collection("documents").where("kind", "==", d.kind).where("aspId", "==", aspId).where("number", "==", d.number).limit(5).get();
      const dup = duplicates.docs.find((x) => x.id !== ref.id);
      let paths: string[] = [];
      if (d.files && d.files.length) paths = await storeFiles(aspId, d.kind, ref.id, d.files);
      const history = Array.isArray(prev?.history) ? prev!.history : [];
      if (prev) history.push({ at: Timestamp.now(), by: ctx.uid, lines: prev.lines, files: prev.files });
      await db.runTransaction(async (tx) => {
        tx.set(ref, {
          kind: d.kind, number: d.number, aspId, locationId: d.locationId, files: paths.length ? paths : (prev?.files ?? []),
          lines: normalized, linesSource: d.linesSource, version: (prev?.version ?? 0) + 1,
          status: prev?.status ?? "open", createdAt: prev?.createdAt ?? FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
          history, duplicateOf: dup?.id ?? null, shipmentId: d.shipmentId ?? prev?.shipmentId ?? null,
        }, { merge: true });
        await writeExpectedCodes(tx, d.kind, ref.id, aspId, d.locationId, normalized);
      });
      if (d.shipmentId && d.kind === "ddt_return") {
        await db.collection("shipments").doc(d.shipmentId).update({ documentId: ref.id, ddtNumber: d.number });
      }
      await fillModelsForAsp(aspId, normalized);
      await adminLog(ctx.uid!, "document_saved", ref.id, { kind: d.kind, number: d.number, version: (prev?.version ?? 0) + 1 });
      return { documentId: ref.id, duplicateOf: dup?.id ?? null };
    },
  }),

  // §11.3: compares and (optionally) raises the ddt_in alert when the DDT is marked checked.
  compareDocument: op({
    roles: ["client_admin", "client_office", "client_warehouse", "asp_admin", "asp_warehouse"],
    schema: z.object({ documentId: z.string() }),
    handler: async (ctx, d) => {
      const doc = (await db.collection("documents").doc(d.documentId).get()).data();
      if (!doc) fail("not-found", "document_not_found");
      if (!isClientRole(ctx.role) && doc!.aspId !== ctx.orgId) fail("permission-denied", "forbidden");
      const kind = doc!.kind as DocKind;
      const lines = (doc!.lines as Line[]) ?? [];
      let evs: FirebaseFirestore.QueryDocumentSnapshot[];
      if (kind === "ddt_in") {
        const atWarehouse = await db.collection("events").where("locationId", "==", doc!.locationId).where("type", "==", "arrive_at_warehouse").get();
        evs = atWarehouse.docs;
      } else if (kind === "ddt_return") {
        evs = (await db.collection("events").where("payload.shipmentId", "==", doc!.shipmentId ?? "").get()).docs.filter((x) => x.get("type") === "return_confirm");
      } else {
        evs = (await db.collection("events").where("locationId", "==", doc!.locationId).get()).docs.filter((x) => ["remove_at_site", "install_at_site"].includes(x.get("type") as string));
      }
      // §8.2: a voided scan ("undo last") is out of the replay, so it is out of the comparison too.
      evs = evs.filter((x) => !x.get("voided"));
      const facts: EventFact[] = await Promise.all(evs.map(async (x) => {
        const e = x.data();
        const item = e.itemId ? (await db.collection("items").doc(e.itemId).get()).data() : null;
        return { type: e.type, codeId: e.codeId ?? null, materialCode: item?.materialCode ?? null, modelId: item?.modelId ?? null,
          itemModelKnown: !!item && !item.needsModel, ddtId: e.payload?.ddtId ?? null, aspId: e.aspId ?? null, locationId: e.locationId ?? null };
      }));
      const result = compareDocument(kind, d.documentId, lines, facts);
      return result;
    },
  }),

  // §11.3 "when": alerts for ddt_in are created only when the user marks the DDT checked.
  markDocumentChecked: op({
    roles: ["asp_admin", "asp_warehouse", "client_admin"],
    schema: z.object({ documentId: z.string() }),
    handler: async (ctx, d) => {
      const ref = db.collection("documents").doc(d.documentId);
      const doc = (await ref.get()).data();
      if (!doc) fail("not-found", "document_not_found");
      if (!isClientRole(ctx.role) && doc!.aspId !== ctx.orgId) fail("permission-denied", "forbidden");
      await ref.update({ status: "checked", checkedAt: FieldValue.serverTimestamp(), checkedBy: ctx.uid });
      // Raise or update the alert if the comparison shows differences.
      const kind = doc!.kind as DocKind;
      if (kind === "ddt_in" || kind === "bom") {
        const compared = await (documents.compareDocument as unknown as { handler: (c: Ctx, d: Doc) => Promise<ReturnType<typeof compareDocument>> }).handler(ctx, { documentId: d.documentId } as Doc);
        const diffs = compared.totals.missing + compared.totals.unexpected + compared.totals.arrivedModelUnknown + (compared.quantities.reduce((n, q) => n + Math.abs(q.expected - q.counted), 0));
        const id = kind === "ddt_in" ? alertId.ddt(d.documentId) : alertId.bom(d.documentId);
        const kindCode = kind === "ddt_in" ? "ddt_in_difference" : "bom_difference";
        if (diffs > 0) {
          await db.collection("alerts").doc(id).set({
            kind: kindCode, aspId: doc!.aspId ?? null, locationId: doc!.locationId, documentId: d.documentId, shipmentId: null,
            detail: compared.totals, count: diffs, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
            seenAt: null, closedAt: null, closedNote: null,
          }, { merge: true });
        }
      }
    },
  }),

  closeDocument: op({
    roles: ["asp_admin", "client_admin"],
    schema: z.object({ documentId: z.string() }),
    handler: async (ctx, d) => {
      const ref = db.collection("documents").doc(d.documentId);
      const doc = (await ref.get()).data();
      if (!doc) fail("not-found", "document_not_found");
      if (!isClientRole(ctx.role) && doc!.aspId !== ctx.orgId) fail("permission-denied", "forbidden");
      await ref.update({ status: "closed", closedAt: FieldValue.serverTimestamp(), closedBy: ctx.uid });
    },
  }),

  // §11.2: saved column mappings per (kind, aspId). client_admin can save `{kind}_client` default.
  saveDocumentMapping: op({
    roles: ["asp_admin", "asp_warehouse", "client_admin"],
    schema: z.object({ kind: z.enum(DOC_KINDS), scope: z.string().min(1), mapping: z.record(z.string().max(200)) }),
    handler: async (ctx, d) => {
      const id = `${d.kind}_${d.scope}`;
      if (d.scope === "client" && ctx.role !== "client_admin") fail("permission-denied", "forbidden");
      if (d.scope !== "client" && !isClientRole(ctx.role) && d.scope !== ctx.orgId) fail("permission-denied", "forbidden");
      await db.collection("documentMappings").doc(id).set({ kind: d.kind, scope: d.scope, mapping: d.mapping, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    },
  }),
};

export const documentsRouter = makeRouter("documents", documents);
export { randomUUID };
