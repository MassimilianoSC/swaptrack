import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../core/admin";
import { fail } from "../core/errors";
import { makeRouter, op, Ctx } from "../core/router";
import { adminLog } from "../core/adminLog";
import { isClientRole } from "../shared/roles";
import { serverEvent } from "./items";

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function loadAnomaly(ctx: Ctx, id: string): Promise<Doc> {
  const s = await db.collection("anomalies").doc(id).get();
  if (!s.exists) fail("not-found", "anomaly_not_found");
  const a = s.data()!;
  if (!isClientRole(ctx.role) && a.aspId !== ctx.orgId) fail("not-found", "anomaly_not_found");
  return { id, ...a };
}

async function loadAlert(ctx: Ctx, id: string): Promise<Doc> {
  const s = await db.collection("alerts").doc(id).get();
  if (!s.exists) fail("not-found", "alert_not_found");
  const a = s.data()!;
  if (!isClientRole(ctx.role) && a.aspId !== ctx.orgId) fail("not-found", "alert_not_found");
  return { id, ...a };
}

const alerts = {
  markAlertSeen: op({
    roles: ["client_admin", "client_office", "client_warehouse", "asp_admin", "asp_warehouse"],
    schema: z.object({ alertId: z.string() }),
    handler: async (ctx, d) => {
      await loadAlert(ctx, d.alertId);
      await db.collection("alerts").doc(d.alertId).update({ seenAt: FieldValue.serverTimestamp() });
    },
  }),
  closeAlert: op({
    roles: ["client_admin", "client_warehouse", "asp_admin"],
    schema: z.object({ alertId: z.string(), note: z.string().max(500).optional() }),
    handler: async (ctx, d) => {
      const a = await loadAlert(ctx, d.alertId);
      // client_warehouse: return-shipment alerts only (§3.3).
      if (ctx.role === "client_warehouse" && a.kind !== "ddt_return_difference") fail("permission-denied", "forbidden");
      await db.collection("alerts").doc(d.alertId).update({ closedAt: FieldValue.serverTimestamp(), closedBy: ctx.uid, closedNote: d.note ?? null });
    },
  }),
  // §6.5 / §9.2: resolve `code_of_another_asp` by moving the piece to the scanning ASP via a server event
  // one instant before the triggering arrival, so the replay accepts the arrival normally.
  resolveAnomaly: op({
    roles: ["client_admin", "asp_admin"],
    schema: z.object({ anomalyId: z.string(), action: z.enum(["accept_move", "dismiss"]), reason: z.string().min(1).max(300) }),
    handler: async (ctx, d) => {
      const a = await loadAnomaly(ctx, d.anomalyId);
      if (a.resolution) fail("failed-precondition", "already_resolved");
      if (d.action === "accept_move") {
        if (a.type !== "code_of_another_asp") fail("invalid-argument", "invalid_data");
        if (ctx.role !== "client_admin") fail("permission-denied", "forbidden");
        if (!a.itemId || !a.eventId) fail("failed-precondition", "anomaly_incomplete");
        // Load the arrival event that triggered the anomaly.
        const ev = (await db.collection("events").doc(a.eventId).get()).data();
        if (!ev) fail("not-found", "event_not_found");
        const it = (await db.collection("items").doc(a.itemId).get()).data();
        if (!it) fail("not-found", "item_not_found");
        // Server event that moves ownership one instant before the arrival so replay accepts it (§8.2).
        // Using force_state(aspId=destination) is the SPEC-equivalent of a server transfer_out without a shipment.
        const arrivalMs = ev!.scannedAt?.toMillis?.() ?? Date.now();
        const beforeArrival = require("firebase-admin/firestore").Timestamp.fromMillis(arrivalMs - 1);
        await serverEvent(
          ctx,
          "force_state",
          it!.currentLocationId ?? ev!.locationId,
          it!.currentAspId ?? null,
          { targetItemId: a.itemId, aspId: ev!.aspId, reason: `resolve_code_of_another_asp:${a.id}` },
          beforeArrival,
        );
      }
      await db.collection("anomalies").doc(d.anomalyId).update({
        resolution: d.action === "accept_move" ? "forced" : "manual",
        resolvedAt: FieldValue.serverTimestamp(), resolvedBy: ctx.uid, resolvedReason: d.reason,
      });
      await adminLog(ctx.uid!, "anomaly_resolved", a.id, { type: a.type, action: d.action });
    },
  }),
};

export const alertsRouter = makeRouter("alerts", alerts);
