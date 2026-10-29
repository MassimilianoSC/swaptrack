import { z } from "zod";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../core/admin";
import { fail } from "../core/errors";
import { makeRouter, op } from "../core/router";
import { serverEvent } from "./items";

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ASP_WH = ["asp_admin", "asp_warehouse"] as const;

async function loc(id: string): Promise<Doc> {
  const l = (await db.collection("locations").doc(id).get()).data();
  if (!l) fail("not-found", "location_not_found");
  return l!;
}

const shipments = {
  // §9.3 return drafts (ASP warehouse roles); §9.4 transfers: within the ASP by ASP roles, between ASPs by client_admin only.
  createShipment: op({
    roles: ["asp_admin", "asp_warehouse", "client_admin"],
    schema: z.object({ kind: z.enum(["return", "transfer"]), fromLocationId: z.string(), toLocationId: z.string() }),
    handler: async (ctx, d) => {
      const from = await loc(d.fromLocationId), to = await loc(d.toLocationId);
      if (from.type !== "asp_warehouse") fail("invalid-argument", "invalid_data");
      if (d.kind === "return" && (to.type !== "client_warehouse" || ctx.role === "client_admin" || from.aspId !== ctx.orgId)) fail("permission-denied", "forbidden");
      if (d.kind === "transfer") {
        if (to.type !== "asp_warehouse") fail("invalid-argument", "invalid_data");
        const between = from.aspId !== to.aspId;
        if (between && ctx.role !== "client_admin") fail("permission-denied", "forbidden");
        if (!between && from.aspId !== ctx.orgId) fail("permission-denied", "forbidden");
      }
      // R7: the shipment document carries no names of locations or organizations.
      const ref = await db.collection("shipments").add({
        kind: d.kind, fromLocationId: d.fromLocationId, fromAspId: from.aspId, toLocationId: d.toLocationId, toAspId: d.kind === "return" ? null : to.aspId,
        ddtNumber: null, documentId: null, status: "draft", itemCount: 0, createdBy: ctx.uid, createdAt: FieldValue.serverTimestamp(),
        sentAt: null, confirmedAt: null, receivedAt: null, confirmedComplete: null,
      });
      return { shipmentId: ref.id };
    },
  }),
  sendShipment: op({
    roles: ASP_WH,
    schema: z.object({ shipmentId: z.string(), ddtNumber: z.string().trim().max(60).optional() }),
    handler: async (ctx, d) => {
      const ref = db.collection("shipments").doc(d.shipmentId);
      const s = (await ref.get()).data();
      if (!s || s.fromAspId !== ctx.orgId) fail("not-found", "shipment_not_found");
      if (s!.status !== "draft") fail("failed-precondition", "shipment_not_draft");
      if (s!.kind === "return" && !d.ddtNumber) fail("invalid-argument", "ddt_number_required");
      await ref.update({ status: "sent", sentAt: FieldValue.serverTimestamp(), ddtNumber: d.ddtNumber ?? null });
    },
  }),
  // Cancelling a draft writes a server void for every transfer_out / return_ship of the shipment.
  cancelShipment: op({
    roles: ["asp_admin", "asp_warehouse", "client_admin"],
    schema: z.object({ shipmentId: z.string() }),
    handler: async (ctx, d) => {
      const ref = db.collection("shipments").doc(d.shipmentId);
      const s = (await ref.get()).data();
      if (!s || (ctx.role !== "client_admin" && s.fromAspId !== ctx.orgId)) fail("not-found", "shipment_not_found");
      if (s!.status !== "draft") fail("failed-precondition", "shipment_not_draft");
      const evs = await db.collection("events").where("payload.shipmentId", "==", d.shipmentId).get();
      for (const e of evs.docs) {
        const x = e.data();
        if ((x.type === "transfer_out" || x.type === "return_ship") && !x.voided) await serverEvent(ctx, "void", x.locationId, x.aspId, { targetEventId: e.id });
      }
      await ref.update({ status: "cancelled" });
    },
  }),
  // §9.3: confirmed and extra pieces -> server return_confirm; missing stay in_return; differences -> alert.
  confirmReturn: op({
    roles: ["client_admin", "client_warehouse"],
    schema: z.object({ shipmentId: z.string(), confirmed: z.array(z.string()).max(2000), missing: z.array(z.string()).max(2000), extra: z.array(z.string().max(2000)).max(500) }),
    handler: async (ctx, d) => {
      const ref = db.collection("shipments").doc(d.shipmentId);
      const s = (await ref.get()).data();
      if (!s || s.kind !== "return") fail("not-found", "shipment_not_found");
      if (s!.status !== "sent" && s!.status !== "confirmed") fail("failed-precondition", "shipment_not_sent");
      const at = Timestamp.now();
      for (const itemId of d.confirmed) {
        const line = (await ref.collection("lines").doc(itemId).get()).data();
        if (!line) continue;
        await serverEvent(ctx, "return_confirm", s!.toLocationId, null, { shipmentId: d.shipmentId, targetItemId: itemId }, at, line.codeRaw);
        await ref.collection("lines").doc(itemId).update({ confirmedAt: FieldValue.serverTimestamp(), missing: false });
      }
      for (const itemId of d.missing) await ref.collection("lines").doc(itemId).set({ missing: true }, { merge: true });
      for (const codeRaw of d.extra) await serverEvent(ctx, "return_confirm", s!.toLocationId, null, { shipmentId: d.shipmentId, extra: true }, at, codeRaw);
      const complete = d.missing.length === 0 && d.extra.length === 0;
      await ref.update({ status: "confirmed", confirmedAt: FieldValue.serverTimestamp(), confirmedComplete: complete });
      if (!complete) {
        await db.collection("alerts").doc(`return-${d.shipmentId}`).set({
          kind: "ddt_return_difference", aspId: s!.fromAspId, locationId: s!.toLocationId, documentId: s!.documentId ?? null, shipmentId: d.shipmentId,
          detail: { missing: d.missing.length, extra: d.extra.length }, count: d.missing.length + d.extra.length,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), seenAt: null, closedAt: null, closedNote: null,
        }, { merge: true });
      }
    },
  }),
};

export const shipmentsRouter = makeRouter("shipments", shipments);
