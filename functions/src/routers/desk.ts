import { z } from "zod";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db, bucket } from "../core/admin";
import { fail } from "../core/errors";
import { makeRouter, op, Ctx } from "../core/router";
import { isClientRole } from "../shared/roles";
import { produceReport } from "../scheduled";
import { getOrgLanguage } from "../core/orgLang";
import { buildExportXlsx } from "../shared/reportBuilders";

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function assertScope(ctx: Ctx, scope: string) {
  if (scope === "client") { if (!isClientRole(ctx.role)) fail("permission-denied", "forbidden"); return; }
  if (ctx.role === "asp_admin" && scope === ctx.orgId) return;
  if (isClientRole(ctx.role)) return;
  fail("permission-denied", "forbidden");
}

const desk = {
  // §13.2 projection: never userId; events of other organizations shown as "another organization" (ASP roles).
  listEvents: op({
    roles: ["client_admin", "client_office", "client_warehouse", "asp_admin", "asp_warehouse"],
    rate: [120, 60],
    schema: z.object({
      itemId: z.string().optional(),
      locationId: z.string().optional(),
      aspId: z.string().optional(),
      from: z.number().int().optional(),
      to: z.number().int().optional(),
      max: z.number().int().min(1).max(500).default(200),
    }),
    handler: async (ctx, d) => {
      let q: FirebaseFirestore.Query = db.collection("events");
      if (d.itemId) q = q.where("itemId", "==", d.itemId);
      else if (d.locationId) q = q.where("locationId", "==", d.locationId);
      else if (d.aspId) q = q.where("aspId", "==", d.aspId);
      else if (!isClientRole(ctx.role)) q = q.where("aspId", "==", ctx.orgId);
      if (d.from) q = q.where("scannedAt", ">=", Timestamp.fromMillis(d.from));
      if (d.to) q = q.where("scannedAt", "<=", Timestamp.fromMillis(d.to));
      const snap = await q.limit(d.max).get();
      const client = isClientRole(ctx.role);
      return {
        events: snap.docs.map((x) => {
          const e = x.data();
          const own = client || e.aspId === ctx.orgId;
          return {
            id: x.id, type: e.type, scannedAt: (e.scannedAtEffective ?? e.scannedAt)?.toMillis?.() ?? null,
            source: e.source, locationId: own ? e.locationId : null, aspId: own ? e.aspId ?? null : null,
            organization: own ? e.aspId ?? "client" : "another", voided: !!e.voided, corrected: !!e.correction, itemId: e.itemId ?? null,
            payload: own ? e.payload ?? {} : {},
          };
        }),
      };
    },
  }),

  // §13.3 Excel export, headers in the organization's language (R14, D30).
  createExport: op({
    roles: ["client_admin", "client_office", "asp_admin"],
    rate: [10, 300],
    schema: z.object({
      scope: z.string().min(1),
      status: z.string().optional(),
      aspId: z.string().optional(),
      locationId: z.string().optional(),
      modelId: z.string().optional(),
      from: z.number().int().optional(),
      to: z.number().int().optional(),
      language: z.enum(["it", "en"]).optional(),
    }),
    handler: async (ctx, d) => {
      assertScope(ctx, d.scope);
      let q: FirebaseFirestore.Query = db.collection("items");
      if (d.scope !== "client") q = q.where("currentAspId", "==", d.scope);
      if (d.status) q = q.where("status", "==", d.status);
      if (d.locationId) q = q.where("currentLocationId", "==", d.locationId);
      if (d.modelId) q = q.where("modelId", "==", d.modelId);
      if (d.aspId && d.scope === "client") q = q.where("currentAspId", "==", d.aspId);
      const snap = await q.limit(10000).get();
      const lang = d.language ?? (await getOrgLanguage(d.scope));
      const rows = snap.docs.map((d2) => {
        const it = d2.data();
        const last = it.lastScannedAt?.toMillis?.() ? new Date(it.lastScannedAt.toMillis()).toISOString() : "";
        return {
          id: d2.id,
          status: it.status ?? null, flow: it.flow ?? null, model: it.model ?? null, materialCode: it.materialCode ?? null,
          manufacturer: it.manufacturer ?? null, equipmentType: it.equipmentType ?? null, location: it.currentLocationId ?? null,
          asp: it.currentAspId ?? null, sortingCategory: it.sortingCategoryId ?? null, lastScanned: last,
        };
      });
      const buf = await buildExportXlsx({ lang, rows });
      const path = `exports/${d.scope}/${Date.now()}.xlsx`;
      await bucket().file(path).save(buf, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", resumable: false });
      const ref = await db.collection("exports").add({ scope: d.scope, filter: d, language: lang, path, rowCount: snap.size, createdAt: FieldValue.serverTimestamp(), createdBy: ctx.uid });
      return { exportId: ref.id, path, rowCount: snap.size };
    },
  }),

  // §13.4 on-demand report (client roles only).
  generateReport: op({
    roles: ["client_admin", "client_office"],
    rate: [5, 3600],
    schema: z.object({ scope: z.string().min(1), year: z.number().int().min(2024).max(2100), month: z.number().int().min(1).max(12) }),
    handler: async (ctx, d) => {
      assertScope(ctx, d.scope);
      const start = new Date(Date.UTC(d.year, d.month - 1, 1));
      const end = new Date(Date.UTC(d.year, d.month, 1));
      const monthStr = `${d.year}-${String(d.month - 1).padStart(2, "0")}`;
      await produceReport(d.scope, monthStr, start, end);
      return { ok: true, scope: d.scope, month: monthStr };
    },
  }),
};

export const deskRouter = makeRouter("desk", desk);
