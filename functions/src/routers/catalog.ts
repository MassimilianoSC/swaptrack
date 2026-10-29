import { z } from "zod";
import { randomUUID } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../core/admin";
import { fail } from "../core/errors";
import { makeRouter, op } from "../core/router";
import { adminLog } from "../core/adminLog";
import { diffRow } from "../shared/importDiff";
import { locationIdFor, modelIdFor } from "../shared/policy";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { normalizeBarcode, NORM_VERSION } = require("../codeId.node.js");

const LOCATION_TYPES = ["client_warehouse", "asp_warehouse", "site"] as const;
const str = (max: number) => z.string().trim().max(max);
const locRow = z.object({
  code: str(200), name: str(200), type: z.string().trim(), asp: str(200).optional().default(""),
  address: str(300).optional().default(""), region: str(120).optional().default(""),
});
const modelRow = z.object({
  materialCode: str(200), model: str(200), manufacturer: str(200).optional().default(""), equipmentType: str(120).optional().default(""),
});
const importSchema = <T extends z.ZodTypeAny>(row: T) =>
  z.object({
    mode: z.enum(["preview", "commit", "deactivate"]),
    importId: z.string().min(1).max(64),
    rows: z.array(row).max(500).default([]),
    ids: z.array(z.string().max(300)).max(500).default([]),
  });

async function aspIndex() {
  const snap = await db.collection("organizations").where("type", "==", "asp").get();
  const byName = new Map<string, string>();
  const ids = new Set<string>();
  snap.docs.forEach((d) => { byName.set(String(d.get("name")).trim().toLowerCase(), d.id); ids.add(d.id); });
  return { byName, ids };
}

function validateLocation(r: z.infer<typeof locRow>, asps: Awaited<ReturnType<typeof aspIndex>>) {
  const errors: string[] = [];
  if (!r.code) errors.push("missing_code");
  if (!r.name) errors.push("missing_name");
  if (!(LOCATION_TYPES as readonly string[]).includes(r.type)) errors.push("invalid_type");
  let aspId: string | null = null;
  if (r.type !== "client_warehouse") {
    const key = r.asp.toLowerCase();
    aspId = asps.byName.get(key) ?? (asps.ids.has(r.asp) ? r.asp : null);
    if (!aspId) errors.push("unknown_asp");
  }
  return { errors, value: { code: r.code, name: r.name, type: r.type, aspId, address: r.address, region: r.region } };
}

async function existingMap(ids: string[], col: string) {
  if (!ids.length) return new Map<string, Record<string, unknown>>();
  const snaps = await db.getAll(...ids.map((id) => db.collection(col).doc(id)));
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s.data() as Record<string, unknown>]));
}

async function commitRows(col: string, rows: { id: string; value: Record<string, unknown>; isNew: boolean }[], importId: string) {
  const batch = db.batch();
  for (const r of rows) {
    const extra = r.isNew ? { active: true, createdAt: FieldValue.serverTimestamp() } : {};
    batch.set(db.collection(col).doc(r.id), { ...r.value, ...extra, importId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await batch.commit();
}

async function deactivateIds(col: string, ids: string[]) {
  const batch = db.batch();
  ids.forEach((id) => batch.update(db.collection(col).doc(id), { active: false, updatedAt: FieldValue.serverTimestamp() }));
  await batch.commit();
}

const catalog = {
  // §5: preview, explicit commit in chunks of 500, never deletes; re-running the same file changes nothing.
  importLocations: op({
    roles: ["client_admin"],
    rate: [200, 60],
    schema: importSchema(locRow),
    handler: async (ctx, d) => {
      if (d.mode === "deactivate") {
        await deactivateIds("locations", d.ids);
        await adminLog(ctx.uid!, "locations_deactivated", null, { count: d.ids.length, importId: d.importId });
        return { deactivated: d.ids.length };
      }
      const asps = await aspIndex();
      const checked = d.rows.map((r) => ({ id: r.code ? locationIdFor(r.code) : "", ...validateLocation(r, asps) }));
      const existing = await existingMap([...new Set(checked.filter((c) => c.id).map((c) => c.id))], "locations");
      const results = checked.map((c, i) => {
        const prev = existing.get(c.id);
        // A different ASP on an existing site is a reassignment, which moves pieces: use reassignSite (DECISIONS).
        if (prev && c.errors.length === 0 && prev.type === "site" && prev.aspId !== c.value.aspId) c.errors.push("asp_change_use_reassign");
        return { ...diffRow(i, c.id, c.value, c.errors, prev), unknownAsp: c.errors.includes("unknown_asp") ? d.rows[i].asp : null };
      });
      if (d.mode === "preview") return { results };
      const toWrite = results.filter((r) => r.status === "new" || r.status === "changed");
      await commitRows("locations", toWrite.map((r) => ({ id: r.key, value: r.value!, isNew: r.status === "new" })), d.importId);
      return { written: toWrite.length, errors: results.filter((r) => r.status === "error").length };
    },
  }),
  saveLocation: op({
    roles: ["client_admin"],
    schema: z.object({
      code: str(200).min(1), name: str(200).min(1), type: z.enum(LOCATION_TYPES), aspId: z.string().nullable(),
      address: str(300).default(""), region: str(120).default(""), active: z.boolean(), isNew: z.boolean(),
    }),
    handler: async (ctx, d) => {
      const id = locationIdFor(d.code);
      const ref = db.collection("locations").doc(id);
      const prev = await ref.get();
      if (d.isNew && prev.exists) fail("already-exists", "code_exists");
      if (!d.isNew && !prev.exists) fail("not-found", "location_not_found");
      const aspId = d.type === "client_warehouse" ? null : d.aspId;
      if (d.type !== "client_warehouse") {
        const org = aspId ? await db.collection("organizations").doc(aspId).get() : null;
        if (!org?.exists || org.get("type") !== "asp") fail("invalid-argument", "unknown_asp");
      }
      if (prev.exists && prev.get("type") === "site" && prev.get("aspId") !== aspId) fail("failed-precondition", "asp_change_use_reassign");
      if (prev.exists && prev.get("type") !== d.type) fail("failed-precondition", "type_change_not_allowed");
      await ref.set({
        code: d.code, name: d.name, type: d.type, aspId, address: d.address, region: d.region, active: d.active,
        updatedAt: FieldValue.serverTimestamp(), ...(prev.exists ? {} : { createdAt: FieldValue.serverTimestamp(), importId: null }),
      }, { merge: true });
      await adminLog(ctx.uid!, prev.exists ? "location_updated" : "location_created", id);
      return { id };
    },
  }),
  // §5: pieces removed_at_site move with the site through server force_state events (never by writing items).
  reassignSite: op({
    roles: ["client_admin"],
    schema: z.object({ siteId: z.string().min(1), aspId: z.string().min(1), reason: str(300).default("") }),
    handler: async (ctx, d) => {
      const ref = db.collection("locations").doc(d.siteId);
      const site = await ref.get();
      if (!site.exists || site.get("type") !== "site") fail("not-found", "location_not_found");
      const org = await db.collection("organizations").doc(d.aspId).get();
      if (!org.exists || org.get("type") !== "asp" || !org.get("active")) fail("invalid-argument", "unknown_asp");
      if (site.get("aspId") === d.aspId) return { moved: 0 };
      await ref.update({ aspId: d.aspId, updatedAt: FieldValue.serverTimestamp() });
      const items = await db.collection("items").where("currentLocationId", "==", d.siteId).where("status", "==", "removed_at_site").get();
      const now = Timestamp.now();
      for (let i = 0; i < items.docs.length; i += 400) {
        const batch = db.batch();
        for (const it of items.docs.slice(i, i + 400)) {
          batch.set(db.collection("events").doc(randomUUID()), {
            type: "force_state", source: "server", engine: null, codeRaw: null, codeId: null, normVersion: NORM_VERSION,
            locationId: d.siteId, aspId: d.aspId, orgId: ctx.orgId, userId: ctx.uid, scannedAt: now, clockOffsetMs: 0,
            offsetMeasuredAt: null, payload: { targetItemId: it.id, aspId: d.aspId, reason: "site_reassigned" },
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
      }
      await adminLog(ctx.uid!, "site_reassigned", d.siteId, { from: site.get("aspId"), to: d.aspId, pieces: items.size });
      return { moved: items.size };
    },
  }),
  importModels: op({
    roles: ["client_admin"],
    rate: [200, 60],
    schema: importSchema(modelRow),
    handler: async (ctx, d) => {
      if (d.mode === "deactivate") {
        await deactivateIds("models", d.ids);
        await adminLog(ctx.uid!, "models_deactivated", null, { count: d.ids.length });
        return { deactivated: d.ids.length };
      }
      const checked = d.rows.map((r) => {
        const code = normalizeBarcode(r.materialCode) as string;
        const errors = [!code && "missing_material_code", !r.model && "missing_model"].filter(Boolean) as string[];
        return { id: code ? modelIdFor(code) : "", errors, value: { materialCode: code, model: r.model, manufacturer: r.manufacturer, equipmentType: r.equipmentType } };
      });
      const existing = await existingMap([...new Set(checked.filter((c) => c.id).map((c) => c.id))], "models");
      const results = checked.map((c, i) => diffRow(i, c.id, c.value, c.errors, existing.get(c.id)));
      if (d.mode === "preview") return { results };
      const toWrite = results.filter((r) => r.status === "new" || r.status === "changed");
      await commitRows("models", toWrite.map((r) => ({ id: r.key, value: r.value!, isNew: r.status === "new" })), d.importId);
      return { written: toWrite.length, errors: results.filter((r) => r.status === "error").length };
    },
  }),
  saveModel: op({
    roles: ["client_admin"],
    schema: z.object({
      materialCode: str(200).min(1), model: str(200).min(1), manufacturer: str(200).default(""), equipmentType: str(120).default(""),
      active: z.boolean(), isNew: z.boolean(),
    }),
    handler: async (ctx, d) => {
      const code = normalizeBarcode(d.materialCode) as string;
      if (!code) fail("invalid-argument", "missing_material_code");
      const ref = db.collection("models").doc(modelIdFor(code));
      const prev = await ref.get();
      if (d.isNew && prev.exists) fail("already-exists", "code_exists");
      await ref.set({
        materialCode: code, model: d.model, manufacturer: d.manufacturer, equipmentType: d.equipmentType, active: d.active,
        updatedAt: FieldValue.serverTimestamp(), ...(prev.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      }, { merge: true });
      await adminLog(ctx.uid!, prev.exists ? "model_updated" : "model_created", ref.id);
      return { id: ref.id };
    },
  }),
};

export const catalogRouter = makeRouter("catalog", catalog);
