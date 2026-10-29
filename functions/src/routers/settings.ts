import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { db, bucket } from "../core/admin";
import { fail } from "../core/errors";
import { makeRouter, op } from "../core/router";
import { adminLog } from "../core/adminLog";
import { getSettings } from "../core/settings";
import { conflictingRule, type SortingRule } from "../shared/sorting";

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg", "image/webp": "webp" };

const schemas = {
  branding: z.object({
    appName: z.string().trim().min(1).max(60),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    logo: z.object({ base64: z.string().max(700_000), contentType: z.string() }).nullable().optional(),
    removeLogo: z.boolean().optional(),
  }),
  auth: z.object({
    google: z.boolean(), microsoft: z.boolean(), mfaAdmins: z.boolean(),
    inactivityEnabled: z.boolean(), inactivityMinutes: z.number().int().min(5).max(480),
  }),
  app: z.object({ minVersion: z.string().trim().regex(/^(\d+\.\d+\.\d+)?$/), emailConfigured: z.boolean() }),
  privacy: z.object({
    texts: z.object({ it: z.string().max(50_000), en: z.string().max(50_000) }),
    bumpVersion: z.boolean(),
    retentionEnabled: z.boolean(),
    retentionDays: z.number().int().min(30).max(3650),
  }),
  importMappings: z.object({
    locations: z.record(z.string().max(200)).optional(),
    models: z.record(z.string().max(200)).optional(),
  }),
  photos: z.object({ mandatoryForDefective: z.boolean() }),
  itemFields: z.object({ fields: z.array(z.object({ key: z.string().trim().min(1).max(50), labels: z.object({ it: z.string().trim().min(1).max(80), en: z.string().trim().min(1).max(80) }), type: z.enum(["text", "number", "choice"]), options: z.array(z.string().max(80)).max(50).optional(), required: z.boolean() })).max(30) }),
  thresholds: z.object({ staleDays: z.number().int().min(1).max(365), transferDays: z.number().int().min(1).max(90) }),
  fieldPolicy: z.object({ pieceAtSiteNotInBom: z.enum(["accept_and_alert", "accept_silently"]) }),
  features: z.object({ aiDocumentExtraction: z.boolean() }),
};

type Name = keyof typeof schemas;

async function valueFor(name: Name, raw: unknown): Promise<Record<string, unknown>> {
  const parsed = schemas[name].safeParse(raw);
  if (!parsed.success) fail("invalid-argument", "invalid_data");
  const v = parsed.data as Record<string, unknown>;
  if (name === "branding") {
    const { logo, removeLogo, ...rest } = v as z.infer<typeof schemas.branding>;
    const current = await getSettings("branding");
    let logoPath = removeLogo ? null : current.logoPath;
    if (logo) {
      const ext = LOGO_TYPES[logo.contentType];
      if (!ext) fail("invalid-argument", "logo_type");
      logoPath = `branding/logo.${ext}`;
      await bucket().file(logoPath).save(Buffer.from(logo.base64, "base64"), { contentType: logo.contentType, resumable: false });
    }
    return { ...rest, logoPath };
  }
  if (name === "privacy") {
    const { bumpVersion, ...rest } = v as z.infer<typeof schemas.privacy>;
    const current = await getSettings("privacy");
    // Any change of the notice text forces a new acceptance (§4.15).
    const changed = rest.texts.it !== current.texts.it || rest.texts.en !== current.texts.en;
    return { ...rest, version: current.version + (bumpVersion || changed ? 1 : 0) };
  }
  if (name === "importMappings") {
    const current = await getSettings("importMappings");
    return { ...current, ...v };
  }
  return v;
}

const settings = {
  saveSettings: op({
    roles: ["client_admin"],
    schema: z.object({ name: z.enum(Object.keys(schemas) as [Name, ...Name[]]), value: z.unknown() }),
    handler: async (ctx, d) => {
      const value = await valueFor(d.name, d.value);
      await db.collection("settings").doc(d.name).set({ ...value, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await adminLog(ctx.uid!, "settings_changed", `settings/${d.name}`);
      return { ok: true };
    },
  }),
  saveSortingCategory: op({
    roles: ["client_admin"],
    schema: z.object({ id: z.string().optional(), labels: z.object({ it: z.string().trim().min(1).max(80), en: z.string().trim().min(1).max(80) }), active: z.boolean(), order: z.number().int().min(0).max(999) }),
    handler: async (ctx, d) => {
      const ref = d.id ? db.collection("sortingCategories").doc(d.id) : db.collection("sortingCategories").doc();
      await ref.set({ labels: d.labels, active: d.active, order: d.order, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await adminLog(ctx.uid!, "settings_changed", `sortingCategories/${ref.id}`);
      return { id: ref.id };
    },
  }),
  // §10: a rule with the same keys as an existing active rule is refused.
  saveSortingRule: op({
    roles: ["client_admin"],
    schema: z.object({ id: z.string().optional(), siteId: z.string().nullable(), modelId: z.string().nullable(), equipmentType: z.string().trim().max(120).nullable(), categoryId: z.string(), active: z.boolean() }),
    handler: async (ctx, d) => {
      if (!d.siteId && !d.modelId && !d.equipmentType) fail("invalid-argument", "rule_without_keys");
      if (!(await db.collection("sortingCategories").doc(d.categoryId).get()).exists) fail("not-found", "category_not_found");
      if (d.siteId && !(await db.collection("locations").doc(d.siteId).get()).exists) fail("not-found", "location_not_found");
      const all = (await db.collection("sortingRules").get()).docs.map((x) => ({ id: x.id, ...(x.data() as Omit<SortingRule, "id">) }));
      if (d.active && conflictingRule(all, { ...d, siteId: d.siteId || null, modelId: d.modelId || null, equipmentType: d.equipmentType || null })) fail("already-exists", "rule_duplicate");
      const ref = d.id ? db.collection("sortingRules").doc(d.id) : db.collection("sortingRules").doc();
      const { id: _id, ...v } = d;
      await ref.set({ ...v, siteId: d.siteId || null, modelId: d.modelId || null, equipmentType: d.equipmentType || null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await adminLog(ctx.uid!, "settings_changed", `sortingRules/${ref.id}`);
      return { id: ref.id };
    },
  }),
};

export const settingsRouter = makeRouter("settings", settings);
