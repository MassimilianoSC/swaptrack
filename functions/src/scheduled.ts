import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db, auth, REGION, bucket } from "./core/admin";
import { getSettings } from "./core/settings";
import { getOrgLanguage } from "./core/orgLang";
import { alertId } from "./shared/alertIds";
import { bomCheckForSite } from "./shared/bomCheck";
import { cells, SHARDS } from "./aggregates";
import { buildReportPdf, buildReportXlsx } from "./shared/reportBuilders";

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const GRACE_DAYS = 7;
const DAY = 24 * 3600 * 1000;

// §4.8: after the grace period the Auth account of a deactivated user is disabled.
export async function runGraceExpiry(now = Date.now()) {
  const cutoff = Timestamp.fromMillis(now - GRACE_DAYS * DAY);
  const snap = await db.collection("users").where("active", "==", false).where("disabledAt", "<=", cutoff).get();
  let n = 0;
  for (const d of snap.docs) {
    if (d.get("authDisabled") === true || d.get("deleted")) continue;
    await auth.updateUser(d.id, { disabled: true }).catch(() => undefined);
    await d.ref.update({ authDisabled: true });
    n++;
  }
  logger.info("graceExpiry", { disabled: n });
}

// R11 / §14: removes userId from old events. Off by default.
export async function runRetention(now = Date.now()) {
  const privacy = await getSettings("privacy");
  if (!privacy.retentionEnabled) return;
  const cutoff = Timestamp.fromMillis(now - privacy.retentionDays * DAY);
  let total = 0;
  for (;;) {
    const snap = await db.collection("events").where("scannedAt", "<", cutoff).where("userId", "!=", null).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { userId: FieldValue.delete() }));
    await batch.commit();
    total += snap.size;
  }
  logger.info("retention", { cleared: total });
}

// §11.4 daily: stale_material (new material in ASP warehouses, removed material waiting to be returned);
// BOM check for sites with scans and no site_done in the last 24h (so between 24 and 48h after the last scan).
export async function runDailyChecks(now = Date.now()) {
  const thresholds = await getSettings("thresholds");
  const staleDays = thresholds.staleDays;
  const stale = Timestamp.fromMillis(now - staleDays * DAY);
  const grouped = new Map<string, { aspId: string | null; flow: "new" | "removed"; count: number }>();
  // New material (received_at_asp, flow=new) at ASP warehouses.
  const newQ = await db.collection("items").where("status", "==", "received_at_asp").where("flow", "==", "new").where("lastScannedAt", "<=", stale).get();
  for (const d of newQ.docs) {
    const loc = d.get("currentLocationId") as string | null;
    if (!loc) continue;
    const key = `${loc}|new`;
    const prev = grouped.get(key);
    grouped.set(key, { aspId: d.get("currentAspId") ?? null, flow: "new", count: (prev?.count ?? 0) + 1 });
  }
  // Removed material (sorted/defective/leftover) waiting to be returned.
  for (const status of ["sorted", "defective", "leftover"]) {
    const q = await db.collection("items").where("status", "==", status).where("lastScannedAt", "<=", stale).get();
    for (const d of q.docs) {
      const loc = d.get("currentLocationId") as string | null;
      if (!loc) continue;
      const key = `${loc}|removed`;
      const prev = grouped.get(key);
      grouped.set(key, { aspId: d.get("currentAspId") ?? null, flow: "removed", count: (prev?.count ?? 0) + 1 });
    }
  }
  for (const [key, v] of grouped) {
    const [locationId, flow] = key.split("|") as [string, "new" | "removed"];
    await db.collection("alerts").doc(alertId.stale(locationId, flow)).set({
      kind: "stale_material", aspId: v.aspId, locationId, documentId: null, shipmentId: null, flow,
      detail: { thresholdDays: staleDays, flow }, count: v.count, createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(), seenAt: null, closedAt: null, closedNote: null,
    }, { merge: true });
  }
  // Transfer difference: shipments sent 7+ days ago with lines not arrived.
  const transferDays = thresholds.transferDays;
  const since = Timestamp.fromMillis(now - transferDays * DAY);
  const ships = await db.collection("shipments").where("kind", "==", "transfer").where("status", "==", "sent").where("sentAt", "<=", since).get();
  for (const s of ships.docs) {
    const linesS = await s.ref.collection("lines").get();
    const missing = linesS.docs.filter((l) => !l.get("arrivedAt")).length;
    if (missing > 0) {
      await db.collection("alerts").doc(alertId.transfer(s.id)).set({
        kind: "transfer_difference", aspId: s.get("fromAspId"), locationId: s.get("toLocationId"), documentId: null, shipmentId: s.id,
        detail: { missing }, count: missing, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        seenAt: null, closedAt: null, closedNote: null,
      }, { merge: true });
    }
  }
  // BOM check for sites with scans in the last 24-48h and no site_done in the last 24h.
  const windowStart = Timestamp.fromMillis(now - 48 * 3600 * 1000);
  const windowEnd = Timestamp.fromMillis(now - 24 * 3600 * 1000);
  const recent = await db.collection("events").where("scannedAt", ">=", windowStart).where("scannedAt", "<=", windowEnd).get();
  const sites = new Map<string, string>(); // locationId -> aspId
  for (const e of recent.docs) {
    const type = e.get("type") as string;
    if (!["remove_at_site", "install_at_site"].includes(type)) continue;
    sites.set(e.get("locationId"), e.get("aspId") ?? "");
  }
  // Skip sites that saw a site_done later than the window end.
  for (const [locationId, aspId] of sites) {
    const done = await db.collection("events").where("locationId", "==", locationId).where("type", "==", "site_done").where("scannedAt", ">", windowEnd).limit(1).get();
    if (!done.empty) continue;
    await bomCheckForSite(locationId, aspId).catch((e) => logger.warn("bomCheck", { e: String(e) }));
  }
  logger.info("dailyChecks", { stale: grouped.size, transfers: ships.size, bomSites: sites.size });
}

// §13.4: 1st of every month at 06:00 Europe/Rome; one PDF+Excel per scope.
export async function runMonthlyReports(now = new Date()) {
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth()).padStart(2, "0")}`;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  await produceReport("client", month, start, end).catch((e) => logger.warn("report:client", { e: String(e) }));
  const asps = await db.collection("organizations").where("type", "==", "asp").get();
  for (const a of asps.docs) {
    await produceReport(a.id, month, start, end).catch((e) => logger.warn("report:asp", { aspId: a.id, e: String(e) }));
  }
  logger.info("monthlyReports", { month, aspCount: asps.size });
}

export async function produceReport(scope: string, month: string, start: Date, end: Date) {
  // Collect numbers from events in the month (R7: filter by aspId for an ASP scope).
  const q = db.collection("events").where("scannedAt", ">=", Timestamp.fromDate(start)).where("scannedAt", "<", Timestamp.fromDate(end));
  const snap = await q.get();
  const byType = new Map<string, number>();
  for (const d of snap.docs) {
    const e = d.data();
    if (scope !== "client" && e.aspId !== scope) continue;
    byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
  }
  const summary = {
    received: byType.get("arrive_at_warehouse") ?? 0,
    installed: byType.get("install_at_site") ?? 0,
    removed: byType.get("remove_at_site") ?? 0,
    sorted: byType.get("classify") ?? 0,
    returned: byType.get("return_confirm") ?? 0,
  };
  const lang = await getOrgLanguage(scope);
  const byTypeArr: Array<[string, number]> = [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const pdfBuf = await buildReportPdf({ lang, scope, month, summary, byType: byTypeArr });
  const xlsxBuf = await buildReportXlsx({ lang, scope, month, summary, byType: byTypeArr });
  const pdfPath = `reports/${scope}/${month}.pdf`;
  const xlsxPath = `reports/${scope}/${month}.xlsx`;
  await bucket().file(pdfPath).save(pdfBuf, { contentType: "application/pdf", resumable: false });
  await bucket().file(xlsxPath).save(xlsxBuf, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", resumable: false });
  await db.collection("reports").add({ scope, month, language: lang, pdfPath, xlsxPath, summary, createdAt: FieldValue.serverTimestamp() });
}

// §13.1 nightly recount: rewrites `aggregates/*` from `items`.
export async function runNightlyRecount() {
  // (scope, dimension, key) -> count
  const total = new Map<string, Map<string, number>>();
  const items = await db.collection("items").get();
  for (const d of items.docs) {
    const it = d.data();
    const c = cells(it);
    const scopes = ["client", it.currentAspId].filter(Boolean) as string[];
    for (const scope of scopes) {
      for (const [dim, key] of Object.entries(c)) {
        const k = `${scope}\u0000${dim}`;
        if (!total.has(k)) total.set(k, new Map());
        const m = total.get(k)!;
        m.set(key, (m.get(key) ?? 0) + 1);
      }
    }
  }
  // Clear old aggregates: write 10 shards summing to the computed total.
  const batch = db.batch();
  let n = 0;
  for (const [k, m] of total) {
    const [scope, dimension] = k.split("\u0000");
    for (let shard = 0; shard < SHARDS; shard++) {
      const counts: Record<string, number> = {};
      // put the whole total in shard 0; others cleared.
      if (shard === 0) for (const [key, v] of m) counts[key] = v;
      batch.set(db.collection("aggregates").doc(`${scope}_${dimension}_${shard}`), { scope, dimension, shard, counts, recountedAt: FieldValue.serverTimestamp() });
      n++;
      if (n >= 400) { await batch.commit(); n = 0; }
    }
  }
  if (n) await batch.commit();
  logger.info("nightlyRecount", { items: items.size, aggregates: total.size * SHARDS });
}

const opts = { region: REGION, timeZone: "Europe/Rome" };
export const graceExpiry = onSchedule({ ...opts, schedule: "every day 03:00" }, () => runGraceExpiry());
export const retention = onSchedule({ ...opts, schedule: "every day 03:30" }, () => runRetention());
export const dailyChecks = onSchedule({ ...opts, schedule: "every day 04:00" }, () => runDailyChecks());
export const nightlyRecount = onSchedule({ ...opts, schedule: "every day 02:00" }, () => runNightlyRecount());
export const monthlyReports = onSchedule({ ...opts, schedule: "0 6 1 * *" }, () => runMonthlyReports());
