import { z } from "zod";
import { randomUUID } from "crypto";
import { FieldValue, Timestamp, Transaction } from "firebase-admin/firestore";
import { db } from "../core/admin";
import { fail } from "../core/errors";
import { makeRouter, op, Ctx } from "../core/router";
import { adminLog } from "../core/adminLog";
import { isClientRole } from "../shared/roles";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { NORM_VERSION } = require("../codeId.node.js");

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function loadItem(ctx: Ctx, itemId: string, tx?: Transaction): Promise<Doc> {
  const ref = db.collection("items").doc(itemId);
  const s = tx ? await tx.get(ref) : await ref.get();
  if (!s.exists) fail("not-found", "item_not_found");
  const it = s.data()!;
  // R7: own ASP means currentAspId or pendingAspId.
  if (!isClientRole(ctx.role) && it.currentAspId !== ctx.orgId && it.pendingAspId !== ctx.orgId) fail("not-found", "item_not_found");
  return it;
}

// Server events (source "server"), applied by the replay (§8.2).
export async function serverEvent(ctx: Ctx, type: string, locationId: string, aspId: string | null, payload: Doc, scannedAt = Timestamp.now(), codeRaw: string | null = null) {
  const id = randomUUID();
  await db.collection("events").doc(id).set({
    type, source: "server", engine: null, codeRaw, codeId: null, normVersion: NORM_VERSION, locationId, aspId, orgId: ctx.orgId,
    userId: ctx.uid, scannedAt, clockOffsetMs: 0, offsetMeasuredAt: null, payload, createdAt: FieldValue.serverTimestamp(),
  });
  return id;
}

// Batch commits for N docs (updates / sets). Firestore batch limit 500.
async function commitInBatches(refs: Array<[FirebaseFirestore.DocumentReference, Doc, "set" | "update"]>) {
  for (let i = 0; i < refs.length; i += 450) {
    const batch = db.batch();
    refs.slice(i, i + 450).forEach(([ref, data, kind]) => (kind === "set" ? batch.set(ref, data, { merge: true }) : batch.update(ref, data)));
    await batch.commit();
  }
}

const items = {
  editItem: op({
    roles: ["client_admin", "asp_admin", "asp_warehouse"],
    schema: z.object({ itemId: z.string(), modelId: z.string().nullable().optional(), condition: z.string().max(200).nullable().optional(), extra: z.record(z.unknown()).optional() }),
    handler: async (ctx, d) => {
      await loadItem(ctx, d.itemId);
      const upd: Doc = {};
      if (d.modelId !== undefined) {
        const m = d.modelId ? (await db.collection("models").doc(d.modelId).get()).data() : null;
        if (d.modelId && !m) fail("not-found", "model_not_found");
        Object.assign(upd, { modelId: d.modelId, materialCode: m?.materialCode ?? null, model: m?.model ?? null, manufacturer: m?.manufacturer ?? null, equipmentType: m?.equipmentType ?? null, needsModel: !d.modelId });
      }
      if (d.condition !== undefined) upd.condition = d.condition;
      if (d.extra) upd.extra = d.extra;
      await db.collection("items").doc(d.itemId).update(upd);
    },
  }),
  forceState: op({
    roles: ["client_admin", "asp_admin"],
    schema: z.object({ itemId: z.string(), status: z.string().optional(), aspId: z.string().optional(), locationId: z.string().optional(), reason: z.string().min(1).max(300), anomalyId: z.string().optional() }),
    handler: async (ctx, d) => {
      const it = await loadItem(ctx, d.itemId);
      if (d.aspId && ctx.role !== "client_admin") fail("permission-denied", "forbidden");
      if (ctx.role === "asp_admin" && it.currentAspId !== ctx.orgId) fail("permission-denied", "forbidden");
      await serverEvent(ctx, "force_state", d.locationId ?? it.currentLocationId, d.aspId ?? it.currentAspId, { targetItemId: d.itemId, status: d.status ?? null, aspId: d.aspId ?? null, locationId: d.locationId ?? null, reason: d.reason });
      if (d.anomalyId) await db.collection("anomalies").doc(d.anomalyId).update({ resolution: "forced", resolvedAt: FieldValue.serverTimestamp(), resolvedBy: ctx.uid });
    },
  }),
  // §6.5 Merge: canonical item keeps its id; the merged one gets mergedInto; codes and events are re-pointed.
  // The trigger always follows mergedInto; a merge_chain_suspicious anomaly is raised after 5 hops.
  mergeItems: op({
    roles: ["client_admin", "asp_admin"],
    schema: z.object({ fromItemId: z.string(), intoItemId: z.string(), reason: z.string().min(1).max(300) }),
    handler: async (ctx, d) => {
      if (d.fromItemId === d.intoItemId) fail("invalid-argument", "invalid_data");
      const into = await db.runTransaction(async (tx) => {
        const from = await loadItem(ctx, d.fromItemId, tx);
        const into = await loadItem(ctx, d.intoItemId, tx);
        if (from.mergedInto || into.mergedInto) fail("failed-precondition", "already_merged");
        // asp_admin: both must be in own ASP.
        if (ctx.role === "asp_admin" && (from.currentAspId !== ctx.orgId || into.currentAspId !== ctx.orgId)) fail("permission-denied", "forbidden");
        tx.update(db.collection("items").doc(d.fromItemId), { mergedInto: d.intoItemId, mergedAt: FieldValue.serverTimestamp(), mergedBy: ctx.uid });
        return into;
      });
      // Re-point codes and events outside the transaction (unbounded reads).
      const codes = await db.collection("codes").where("itemId", "==", d.fromItemId).get();
      await commitInBatches(codes.docs.map((c) => [c.ref, { itemId: d.intoItemId, aspId: into.currentAspId, pendingAspId: into.pendingAspId ?? null }, "update"]));
      const evs = await db.collection("events").where("itemId", "==", d.fromItemId).get();
      await commitInBatches(evs.docs.map((e) => [e.ref, { itemId: d.intoItemId }, "update"]));
      // Server event that forces replay of the canonical item with the newly-pointed events (§8.2).
      await serverEvent(ctx, "force_state", into.currentLocationId, into.currentAspId, { targetItemId: d.intoItemId, reason: `merge:${d.fromItemId}` });
      await adminLog(ctx.uid!, "items_merged", d.intoItemId, { from: d.fromItemId, reason: d.reason });
      return { ok: true, codes: codes.size, events: evs.size };
    },
  }),
  // §6.5 Location correction: the event keeps the original values in `correction`; the item state is recomputed by replay.
  correctEventLocation: op({
    roles: ["client_admin", "asp_admin"],
    schema: z.object({ eventId: z.string(), locationId: z.string(), reason: z.string().min(1).max(300) }),
    handler: async (ctx, d) => {
      const result = await db.runTransaction(async (tx) => {
        const e = (await tx.get(db.collection("events").doc(d.eventId))).data();
        if (!e) fail("not-found", "event_not_found");
        if (ctx.role === "asp_admin" && e!.aspId !== ctx.orgId) fail("permission-denied", "forbidden");
        const newLoc = (await tx.get(db.collection("locations").doc(d.locationId))).data();
        if (!newLoc) fail("not-found", "location_not_found");
        if (e!.locationId === d.locationId) fail("invalid-argument", "invalid_data");
        const correction = { previousLocationId: e!.locationId, correctedBy: ctx.uid, correctedAt: FieldValue.serverTimestamp(), reason: d.reason };
        tx.update(db.collection("events").doc(d.eventId), { locationId: d.locationId, correction });
        return { itemId: (e!.itemId as string) ?? null, newLocationId: d.locationId, newAspId: (newLoc!.aspId as string) ?? e!.aspId };
      });
      // Recompute the item state by writing a benign force_state (the trigger replays all events).
      if (result.itemId) {
        const it = await loadItem(ctx, result.itemId);
        await serverEvent(ctx, "force_state", it.currentLocationId, it.currentAspId, { targetItemId: result.itemId, reason: `location_correction:${d.eventId}` });
      }
      await adminLog(ctx.uid!, "event_location_corrected", d.eventId, { reason: d.reason });
    },
  }),
  // R11: projection without userId; events of other organizations shown as "another organization".
  itemHistory: op({
    roles: ["client_admin", "client_office", "asp_admin", "asp_warehouse"],
    schema: z.object({ itemId: z.string() }),
    handler: async (ctx, d) => {
      await loadItem(ctx, d.itemId);
      const evs = await db.collection("events").where("itemId", "==", d.itemId).get();
      const client = isClientRole(ctx.role);
      return {
        events: evs.docs.map((x) => {
          const e = x.data();
          const own = client || e.aspId === ctx.orgId;
          return { id: x.id, type: e.type, scannedAt: (e.scannedAtEffective ?? e.scannedAt)?.toMillis?.() ?? null, source: e.source,
            locationId: own ? e.locationId : null, aspId: own ? e.aspId ?? null : null, organization: own ? e.aspId ?? "client" : "another", voided: !!e.voided, corrected: !!e.correction,
            payload: own ? e.payload ?? {} : {} };
        }).sort((a, b) => (a.scannedAt ?? 0) - (b.scannedAt ?? 0)),
      };
    },
  }),
  revealEventAuthor: op({
    roles: ["client_admin", "asp_admin"],
    rate: [20, 3600],
    schema: z.object({ eventId: z.string() }),
    handler: async (ctx, d) => {
      const e = (await db.collection("events").doc(d.eventId).get()).data();
      if (!e || (ctx.role === "asp_admin" && e.aspId !== ctx.orgId)) fail("not-found", "event_not_found");
      // §R11: who asked, which event, when; never the revealed name.
      await db.collection("accessLog").add({ actor: ctx.uid, eventId: d.eventId, at: FieldValue.serverTimestamp() });
      const u = e!.userId ? (await db.collection("users").doc(e!.userId).get()).data() : null;
      return { name: u && !u.deleted ? `${u.firstName} ${u.lastName}` : null };
    },
  }),
  attachPhotos: op({
    roles: ["asp_admin", "asp_warehouse", "asp_technician"],
    schema: z.object({ eventId: z.string(), paths: z.array(z.string().max(300)).min(1).max(5) }),
    handler: async (ctx, d) => {
      const e = (await db.collection("events").doc(d.eventId).get()).data();
      if (!e || e.userId !== ctx.uid) fail("not-found", "event_not_found");
      const prefix = `photos/${ctx.orgId}/${d.eventId}/`;
      if (d.paths.some((p) => !p.startsWith(prefix))) fail("invalid-argument", "invalid_data");
      if (e!.itemId) await db.collection("items").doc(e!.itemId).update({ photoPaths: FieldValue.arrayUnion(...d.paths) });
      await db.collection("events").doc(d.eventId).update({ photoPaths: d.paths });
    },
  }),
};

export const itemsRouter = makeRouter("items", items);
export { adminLog };
