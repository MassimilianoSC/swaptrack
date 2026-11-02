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
import { previousReportMonth } from "./shared/reportMonth";
import { authDisableDone } from "./shared/graceExpiry";
import { upsertAlert, zeroAlertIfOpen } from "./core/alerts";
import { docsByIds, placesByIds, orgNames, categoryLabels } from "./core/lookup";
import { computeReport, inScope, type ReportEvent } from "./shared/reportData";

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const GRACE_DAYS = 7;
const DAY = 24 * 3600 * 1000;
const ms = (t: unknown) => (t instanceof Timestamp ? t.toMillis() : 0);

// §4.8: after the grace period the Auth account of a deactivated user is disabled.
export async function runGraceExpiry(now = Date.now(), authApi: Pick<typeof auth, "updateUser"> = auth) {
  const cutoff = Timestamp.fromMillis(now - GRACE_DAYS * DAY);
  const snap = await db.collection("users").where("active", "==", false).where("disabledAt", "<=", cutoff).get();
  let n = 0, retry = 0;
  for (const d of snap.docs) {
    if (d.get("authDisabled") === true || d.get("deleted")) continue;
    const err = await authApi.updateUser(d.id, { disabled: true }).then(() => null, (e: unknown) => e);
    if (!authDisableDone(err)) { retry++; continue; }
    await d.ref.update({ authDisabled: true });
    n++;
  }
  logger.info("graceExpiry", { disabled: n, retryTomorrow: retry });
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

// Pieces waiting since before `cutoff`: new material at ASP warehouses (received_at_asp, flow new) and removed
// material waiting to be returned (sorted, defective, leftover). Used by the daily check and the monthly report.
async function staleItems(cutoff: Timestamp) {
  const newer = await db.collection("items").where("status", "==", "received_at_asp").where("flow", "==", "new").where("lastScannedAt", "<=", cutoff).get();
  const removed = [];
  for (const status of ["sorted", "defective", "leftover"]) {
    removed.push(...(await db.collection("items").where("status", "==", status).where("lastScannedAt", "<=", cutoff).get()).docs);
  }
  return { new: newer.docs, removed };
}

// §11.4 daily: stale_material (new material in ASP warehouses, removed material waiting to be returned);
// BOM check for sites with scans and no site_done in the last 24h (so between 24 and 48h after the last scan).
export async function runDailyChecks(now = Date.now()) {
  const thresholds = await getSettings("thresholds");
  const staleDays = thresholds.staleDays;
  const stale = Timestamp.fromMillis(now - staleDays * DAY);
  const grouped = new Map<string, { aspId: string | null; flow: "new" | "removed"; count: number }>();
  for (const [flow, docs] of Object.entries(await staleItems(stale)) as Array<["new" | "removed", FirebaseFirestore.QueryDocumentSnapshot[]]>) {
    for (const d of docs) {
      const loc = d.get("currentLocationId") as string | null;
      if (!loc) continue;
      const key = `${loc}|${flow}`;
      const prev = grouped.get(key);
      grouped.set(key, { aspId: d.get("currentAspId") ?? null, flow, count: (prev?.count ?? 0) + 1 });
    }
  }
  for (const [key, v] of grouped) {
    const [locationId, flow] = key.split("|") as [string, "new" | "removed"];
    await upsertAlert(alertId.stale(locationId, flow), {
      kind: "stale_material", aspId: v.aspId, locationId, documentId: null, shipmentId: null, flow,
      detail: { thresholdDays: staleDays, flow }, count: v.count,
    });
  }
  // D-29: an open stale alert whose warehouse has no stale piece any more goes to count 0.
  const openStale = await db.collection("alerts").where("kind", "==", "stale_material").where("closedAt", "==", null).get();
  for (const a of openStale.docs) {
    if (!grouped.has(`${a.get("locationId")}|${a.get("flow")}`)) await zeroAlertIfOpen(a.id, { thresholdDays: staleDays, flow: a.get("flow") });
  }
  // Transfer difference: shipments sent 7+ days ago with lines not arrived.
  const transferDays = thresholds.transferDays;
  const since = Timestamp.fromMillis(now - transferDays * DAY);
  const ships = await db.collection("shipments").where("kind", "==", "transfer").where("status", "==", "sent").where("sentAt", "<=", since).get();
  const notArrived = async (shipmentId: string) =>
    (await db.collection("shipments").doc(shipmentId).collection("lines").get()).docs.filter((l) => !l.get("arrivedAt")).length;
  for (const s of ships.docs) {
    const missing = await notArrived(s.id);
    if (missing > 0) {
      await upsertAlert(alertId.transfer(s.id), {
        kind: "transfer_difference", aspId: s.get("fromAspId"), locationId: s.get("toLocationId"), documentId: null, shipmentId: s.id,
        detail: { missing }, count: missing,
      });
    }
  }
  // D-29: an open transfer alert whose lines have all arrived since (the shipment may be received by now) goes to 0.
  const openTransfers = await db.collection("alerts").where("kind", "==", "transfer_difference").where("closedAt", "==", null).get();
  for (const a of openTransfers.docs) {
    if (a.get("count") !== 0 && !(await notArrived(String(a.get("shipmentId"))))) await zeroAlertIfOpen(a.id, { missing: 0 });
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
  const { label: month, start, end } = previousReportMonth(now);
  await produceReport("client", month, start, end).catch((e) => logger.warn("report:client", { e: String(e) }));
  const asps = await db.collection("organizations").where("type", "==", "asp").get();
  for (const a of asps.docs) {
    await produceReport(a.id, month, start, end).catch((e) => logger.warn("report:asp", { aspId: a.id, e: String(e) }));
  }
  logger.info("monthlyReports", { month, aspCount: asps.size });
}

// §13.4 (D-38): the report of one scope, each ASP only with its own data (R7). The numbers are computed by
// shared/reportData.ts from the events of the month; here only the data is loaded.
export async function produceReport(scope: string, month: string, start: Date, end: Date) {
  const range = (field: string) => db.collection(field === "scannedAt" ? "events" : "alerts")
    .where(field, ">=", Timestamp.fromDate(start)).where(field, "<", Timestamp.fromDate(end)).get();
  const events: ReportEvent[] = (await range("scannedAt")).docs.map((d) => {
    const e = d.data();
    return { id: d.id, type: e.type, at: ms(e.scannedAtEffective ?? e.scannedAt), itemId: e.itemId ?? null, aspId: e.aspId ?? null,
      locationId: e.locationId ?? null, codeRaw: e.codeRaw ?? null, voided: !!e.voided, payload: e.payload ?? {} };
  });
  // return_confirm is written by the server with aspId null: its ASP is the sender of the return shipment.
  const shipments = await docsByIds("shipments", events.filter((e) => e.type === "return_confirm").map((e) => e.payload.shipmentId ?? ""));
  const returnShipmentAsp = Object.fromEntries(Object.entries(shipments).map(([id, s]) => [id, s.fromAspId as string]));
  const own = events.filter((e) => inScope(e, scope, returnShipmentAsp));
  const lang = await getOrgLanguage(scope);
  const items = await docsByIds("items", own.map((e) => e.itemId ?? ""));
  const ofScope = (aspId: unknown) => scope === "client" || aspId === scope;
  const { staleDays } = await getSettings("thresholds");
  const stale = await staleItems(Timestamp.fromMillis(end.getTime() - staleDays * DAY));
  const alertsIn = async (field: string) => (await range(field)).docs.filter((d) => ofScope(d.get("aspId"))).length;
  const data = computeReport({
    scope, events, returnShipmentAsp,
    itemModels: Object.fromEntries(Object.entries(items).map(([id, it]) => [id, (it.model as string) ?? null])),
    places: await placesByIds(own.map((e) => e.locationId ?? "")),
    categories: await categoryLabels(lang),
    orgNames: await orgNames(),
    waiting: { newPieces: stale.new.filter((d) => ofScope(d.get("currentAspId"))).length,
      removedPieces: stale.removed.filter((d) => ofScope(d.get("currentAspId"))).length, thresholdDays: staleDays },
    alerts: { opened: await alertsIn("createdAt"), closed: await alertsIn("closedAt") },
  }, lang);
  const summary = data.summary;
  // P-64: an ASP's report shows its own name (the client's covers all ASPs and names none).
  const scopeName = scope === "client" ? null : ((await db.collection("organizations").doc(scope).get()).get("name") as string | undefined) ?? null;
  const pdfBuf = await buildReportPdf({ lang, scope, scopeName, month, data });
  const xlsxBuf = await buildReportXlsx({ lang, scope, scopeName, month, data });
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
  // Every (scope, dimension) that exists today or held counts before: a pair with no piece any more (an ASP left
  // with nothing, a category no longer used) is cleared, not left with its old counts.
  const pairs = new Set(total.keys());
  for (const d of (await db.collection("aggregates").get()).docs) {
    if (d.get("scope") && d.get("dimension")) pairs.add(`${d.get("scope")}\u0000${d.get("dimension")}`);
  }
  // Write 10 shards summing to the computed total: the whole total in shard 0, the others cleared.
  let batch = db.batch();
  let n = 0;
  for (const k of pairs) {
    const [scope, dimension] = k.split("\u0000");
    const m = total.get(k) ?? new Map<string, number>();
    for (let shard = 0; shard < SHARDS; shard++) {
      const counts: Record<string, number> = {};
      if (shard === 0) for (const [key, v] of m) counts[key] = v;
      batch.set(db.collection("aggregates").doc(`${scope}_${dimension}_${shard}`), { scope, dimension, shard, counts, recountedAt: FieldValue.serverTimestamp() });
      // A committed batch cannot take more writes: start a new one.
      if (++n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
    }
  }
  if (n) await batch.commit();
  logger.info("nightlyRecount", { items: items.size, aggregates: pairs.size * SHARDS });
}

const opts = { region: REGION, timeZone: "Europe/Rome" };
export const graceExpiry = onSchedule({ ...opts, schedule: "every day 03:00" }, () => runGraceExpiry());
export const retention = onSchedule({ ...opts, schedule: "every day 03:30" }, () => runRetention());
export const dailyChecks = onSchedule({ ...opts, schedule: "every day 04:00" }, () => runDailyChecks());
export const nightlyRecount = onSchedule({ ...opts, schedule: "every day 02:00" }, () => runNightlyRecount());
export const monthlyReports = onSchedule({ ...opts, schedule: "0 6 1 * *" }, () => runMonthlyReports());
