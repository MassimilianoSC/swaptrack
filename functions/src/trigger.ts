import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { FieldValue, Timestamp, Transaction, DocumentReference } from "firebase-admin/firestore";
import { db, REGION } from "./core/admin";
import { replay, type ReplayEvent, type ItemState, type ShipmentInfo } from "./shared/stateMachine";
import { bumpAggregates } from "./aggregates";
import { bomCheckForSite } from "./shared/bomCheck";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { computeCodeId, normalizeBarcode } = require("./codeId.node.js");

const TYPES = ["remove_at_site", "install_at_site", "site_done", "arrive_at_warehouse", "classify", "transfer_out", "return_ship", "relabel", "void", "return_confirm", "force_state"];
const CLOCK_MS = 3 * 60 * 1000;
const DAY = 24 * 3600 * 1000;
const SITE_DONE_WAITS = 10;
const SITE_DONE_MAX_WAIT_MS = 10 * 60 * 1000;
const SITE_DONE_POLLS = 5;
const SITE_DONE_POLL_MS = 3000;
type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Transient errors are rethrown (retries on); permanent problems become anomalies (R5).
class Permanent extends Error {}

function anomaly(tx: Transaction | null, type: string, e: Doc, extra: Doc = {}) {
  // Detail texts never name another organization or its sites (R7).
  const doc = { type, eventId: e.id, codeId: e.codeId ?? null, itemId: extra.itemId ?? e.itemId ?? null, locationId: e.locationId ?? null,
    aspId: e.aspId ?? null, detail: extra.detail ?? type, openedAt: FieldValue.serverTimestamp(), resolution: null, resolvedAt: null, resolvedBy: null };
  // One anomaly per (event, type): a retry of the trigger rewrites the same document instead of duplicating it (R5).
  const ref = db.collection("anomalies").doc(`${e.id}_${type}`);
  return tx ? (tx.set(ref, doc), Promise.resolve()) : ref.set(doc).then(() => undefined);
}

const ms = (t: unknown) => (t instanceof Timestamp ? t.toMillis() : 0);

async function toMachine(e: Doc, locCache: Map<string, Doc>, shipCache: Map<string, ShipmentInfo | null>, tx: Transaction): Promise<ReplayEvent> {
  if (!locCache.has(e.locationId)) locCache.set(e.locationId, (await tx.get(db.collection("locations").doc(e.locationId))).data() ?? {});
  const loc = locCache.get(e.locationId)!;
  const sid = e.payload?.shipmentId as string | undefined;
  if (sid && !shipCache.has(sid)) {
    const s = (await tx.get(db.collection("shipments").doc(sid))).data();
    shipCache.set(sid, s ? { id: sid, kind: s.kind, fromAspId: s.fromAspId, toAspId: s.toAspId, toLocationId: s.toLocationId } : null);
  }
  return {
    id: e.id, type: e.type, source: e.source, at: ms(e.scannedAtEffective ?? e.scannedAt), createdAt: ms(e.createdAt), voided: !!e.voided,
    locationId: e.locationId, locationType: loc.type ?? "site", locationAspId: loc.aspId ?? null, aspId: e.aspId ?? null,
    payload: e.payload ?? {}, shipment: sid ? shipCache.get(sid) : null,
  };
}

// Replays all events of an item inside the transaction (§8.2). `current` has no itemId yet: added by hand.
async function replayItem(tx: Transaction, itemRef: DocumentReference, current: Doc | null, locs: Map<string, Doc>, ships: Map<string, ShipmentInfo | null>) {
  const itemSnap = await tx.get(itemRef);
  const evSnap = await tx.get(db.collection("events").where("itemId", "==", itemRef.id));
  const all = evSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Doc[];
  if (current && !all.some((x) => x.id === current.id)) all.push(current);
  const machine = await Promise.all(all.filter((x) => !x.voided && x.type !== "site_done" && x.type !== "void").map((x) => toMachine(x, locs, ships, tx)));
  const r = replay(machine, current?.id);
  return { before: itemSnap.exists ? (itemSnap.data() as Doc) : null, state: r.state, anomaly: r.anomaly };
}

function catalogFrom(e: Doc, model: Doc | null) {
  return model ? { modelId: model.id, materialCode: model.materialCode, model: model.model, manufacturer: model.manufacturer, equipmentType: model.equipmentType, needsModel: false } : null;
}

async function findModel(e: Doc): Promise<Doc | null> {
  if (e.payload?.modelId) { const m = await db.collection("models").doc(e.payload.modelId).get(); if (m.exists) return { id: m.id, ...m.data() }; }
  if (e.secondCodeRaw) {
    const q = await db.collection("models").where("materialCode", "==", normalizeBarcode(e.secondCodeRaw)).limit(1).get();
    if (!q.empty) return { id: q.docs[0].id, ...q.docs[0].data() };
  }
  // §6.4 / §11.2: expectedCodes lookup (one query).
  if (e.codeId) {
    const q = await db.collection("expectedCodes").where("codeId", "==", e.codeId).get();
    if (!q.empty) {
      // DDT wins over BOM; serial lines carry modelId or materialCode.
      q.docs.sort((a, b) => (a.get("kind") === "ddt_in" ? -1 : 1) - (b.get("kind") === "ddt_in" ? -1 : 1));
      const hint = q.docs[0].data();
      if (hint.modelId) {
        const m = await db.collection("models").doc(hint.modelId).get();
        if (m.exists) return { id: m.id, ...m.data() };
      }
      if (hint.materialCode) {
        const m = await db.collection("models").where("materialCode", "==", normalizeBarcode(hint.materialCode)).limit(1).get();
        if (!m.empty) return { id: m.docs[0].id, ...m.docs[0].data() };
      }
    }
  }
  return null;
}

function writeItem(tx: Transaction, ref: DocumentReference, before: Doc | null, state: ItemState, cat: Doc | null, region: string | null) {
  const derived = { ...state, statusSince: Timestamp.fromMillis(state.statusSince), lastScannedAt: state.lastScannedAt ? Timestamp.fromMillis(state.lastScannedAt) : null };
  const regionFields = region !== undefined ? { currentRegion: region } : {};
  if (!before) {
    tx.set(ref, { ...derived, modelId: null, materialCode: null, model: null, manufacturer: null, equipmentType: null, condition: null, extra: {},
      needsModel: true, photoPaths: [], mergedInto: null, ...(cat ?? {}), ...regionFields, createdAt: FieldValue.serverTimestamp() });
  } else {
    tx.update(ref, { ...derived, ...regionFields, ...(cat && !before.modelId ? cat : {}) });
  }
}

export async function processEvent(id: string): Promise<void> {
  const ref = db.collection("events").doc(id);
  const first = (await ref.get()).data();
  if (!first || first.processedAt) return;
  const e: Doc = { id, ...first };
  const mark = (extra: Doc) => ref.update({ processedAt: FieldValue.serverTimestamp(), ...extra });
  try {
    if (!TYPES.includes(e.type) || !(e.scannedAt instanceof Timestamp) || !e.locationId) throw new Permanent("malformed");
    const created = ms(e.createdAt) || Date.now();
    const effective = Timestamp.fromMillis(Math.min(ms(e.scannedAt), created));
    e.scannedAtEffective = effective;
    if (e.source !== "server") {
      if (Math.abs(Number(e.clockOffsetMs) || 0) > CLOCK_MS) await anomaly(null, "clock_suspicious", e);
      const loc = (await db.collection("locations").doc(e.locationId).get()).data();
      if (!loc) throw new Permanent("malformed");
      if (!loc.active) await anomaly(null, "location_inactive", e);
      if (loc.type !== "client_warehouse" && loc.aspId !== e.aspId) await anomaly(null, "location_of_another_asp", e);
      const user = (await db.collection("users").doc(String(e.userId)).get()).data();
      if (user && user.active === false && ms(user.disabledAt) && ms(e.scannedAt) > ms(user.disabledAt)) await anomaly(null, "event_after_deactivation", e);
    }

    if (e.type === "site_done") {
      // §11.3: BOM check at site_done. A phone back online sends its scans and the site_done together and their
      // triggers run in parallel: checking before the scans are processed gives a false bom_difference (P-57).
      // Wait for them here first (they usually take seconds; the emulator does not retry triggers), then by failing
      // transiently (the trigger retries), at most SITE_DONE_WAITS times or SITE_DONE_MAX_WAIT_MS after the event
      // reached the server; then check with what is there (R5: no endless retries).
      const pendingAt = async () => (await db.collection("events").where("locationId", "==", e.locationId).get()).docs
        .filter((x) => x.id !== id && x.get("type") !== "site_done" && !x.get("processedAt")).length;
      const waits = Number(first.bomCheckWaits ?? 0);
      const mayWait = waits < SITE_DONE_WAITS && Date.now() - created < SITE_DONE_MAX_WAIT_MS;
      let pending = await pendingAt();
      for (let i = 0; pending && mayWait && i < SITE_DONE_POLLS; i++) {
        await new Promise((r) => setTimeout(r, SITE_DONE_POLL_MS));
        pending = await pendingAt();
      }
      if (pending && mayWait) {
        await ref.update({ bomCheckWaits: waits + 1 });
        throw new Error(`site_done: ${pending} scans of the site still being processed`);
      }
      // Run outside the trigger transaction (reads are unbounded).
      await bomCheckForSite(String(e.locationId), String(e.aspId ?? "")).catch((err) => logger.warn("bomCheck", { e: String(err) }));
      await mark({ scannedAtEffective: effective, outcome: "ok" });
      return;
    }

    if (e.type === "void") {
      const targetRef = db.collection("events").doc(String(e.payload?.targetEventId));
      const targetItem = await db.runTransaction(async (tx) => {
        const t = (await tx.get(targetRef)).data();
        const me = (await tx.get(ref)).data();
        if (me?.processedAt) return null;
        const allowed = t && t.type !== "void" && (e.source === "server" ||
          (t.userId === e.userId && t.locationId === e.locationId && Math.abs(ms(e.scannedAt) - ms(t.scannedAt)) <= DAY));
        if (!allowed) { await anomaly(tx, "void_not_allowed", e); tx.update(ref, { processedAt: FieldValue.serverTimestamp(), scannedAtEffective: effective, outcome: "rejected" }); return null; }
        // Set even if the target is not processed yet: its own trigger then skips it (§8.2).
        tx.update(targetRef, { voided: true });
        tx.update(ref, { processedAt: FieldValue.serverTimestamp(), scannedAtEffective: effective, outcome: "ok", itemId: t.itemId ?? null });
        return (t.itemId as string) ?? null;
      });
      // Replay after the voided flag is committed, so the target is excluded.
      if (targetItem) {
        await db.runTransaction(async (tx) => {
          const itemRef = db.collection("items").doc(targetItem);
          const locs = new Map<string, Doc>(), ships = new Map<string, ShipmentInfo | null>();
          const r = await replayItem(tx, itemRef, null, locs, ships);
          if (r.state && r.before) {
            const region = (locs.get(String(r.state.currentLocationId))?.region ?? null) as string | null;
            writeItem(tx, itemRef, r.before, r.state, null, region);
            bumpLater.push([r.before, r.state, targetItem]);
          }
        });
        await flushBumps();
      }
      return;
    }

    let codeRaw = e.codeRaw as string | null;
    let itemId: string | null = e.payload?.targetItemId ?? null;
    if (e.type !== "force_state") {
      const own = computeCodeId(codeRaw) as string;
      if (own !== e.codeId && e.source !== "server") await anomaly(null, "code_id_mismatch", e);
      e.codeId = own;
      const asProduct = await db.collection("models").where("materialCode", "==", normalizeBarcode(codeRaw)).limit(1).get();
      if (!asProduct.empty) {
        await anomaly(null, "product_code_scanned_as_identity", e);
        await mark({ codeId: own, itemId: null, scannedAtEffective: effective, outcome: "product_code" });
        return;
      }
    }
    if (e.type === "relabel") codeRaw = String(e.payload?.oldCodeRaw ?? "");
    const lookupId = e.type === "force_state" ? null : (computeCodeId(codeRaw) as string);
    const model = e.type === "force_state" ? null : await findModel(e);

    const result = await db.runTransaction(async (tx) => {
      const me = (await tx.get(ref)).data();
      if (!me || me.processedAt) return null;
      if (me.voided) { tx.update(ref, { processedAt: FieldValue.serverTimestamp(), outcome: "voided" }); return null; }
      const codeRef = lookupId ? db.collection("codes").doc(lookupId) : null;
      const code = codeRef ? (await tx.get(codeRef)).data() : null;
      const newCodeRef = e.type === "relabel" ? db.collection("codes").doc(e.codeId) : null;
      const newCode = newCodeRef ? (await tx.get(newCodeRef)).data() : null;
      if (code?.itemId) itemId = code.itemId;
      if (e.type === "relabel") {
        if (!code) { await anomaly(tx, "unknown_code_where_known_expected", e); tx.update(ref, { processedAt: FieldValue.serverTimestamp(), scannedAtEffective: effective, outcome: "rejected" }); return null; }
        if (newCode?.active && newCode.itemId !== itemId) { await anomaly(tx, "conflicting_creation", e, { itemId }); tx.update(ref, { processedAt: FieldValue.serverTimestamp(), scannedAtEffective: effective, itemId, outcome: "rejected" }); return null; }
      }
      // Anomalies met while reading are written after the last read: the Admin SDK refuses a read after a write (P-16).
      const later: Array<[string, Doc]> = [];
      if (code && code.active === false && e.type !== "relabel") later.push(["old_label_used", { itemId }]);
      // Follow mergedInto (§6.5).
      let hops = 0;
      while (itemId && hops < 5) {
        const it = (await tx.get(db.collection("items").doc(itemId))).data();
        if (!it?.mergedInto) break;
        itemId = it.mergedInto; hops++;
      }
      if (hops >= 5) later.push(["merge_chain_suspicious", { itemId }]);
      const isNew = !itemId;
      if (isNew && e.type === "force_state") throw new Permanent("malformed");
      const itemRef = isNew ? db.collection("items").doc() : db.collection("items").doc(itemId!);
      const current = { ...me, id, scannedAtEffective: effective, codeId: e.codeId };
      const locs = new Map<string, Doc>(), ships = new Map<string, ShipmentInfo | null>();
      const r = await replayItem(tx, itemRef, current, locs, ships);
      // The shipment of a transfer_out / return_ship was read by the replay: no read from here on, only writes.
      const sid = e.payload?.shipmentId as string | undefined;
      const sh = sid && (e.type === "transfer_out" || e.type === "return_ship") ? ships.get(sid) ?? null : null;
      for (const [type, extra] of later) await anomaly(tx, type, e, extra);
      if (!r.state) {
        // §9.2: a forbidden event with no previous state (e.g. classify at a site on an unknown code).
        // The event is kept, an anomaly is raised, no item or code is created.
        if (r.anomaly) await anomaly(tx, r.anomaly, e, {});
        tx.update(ref, { itemId: null, codeId: e.codeId ?? null, processedAt: FieldValue.serverTimestamp(), scannedAtEffective: effective, outcome: r.anomaly ?? "rejected" });
        return null;
      }
      writeItem(tx, itemRef, r.before, r.state, catalogFrom(e, model), (locs.get(String(r.state.currentLocationId))?.region ?? null) as string | null);
      const codeFields = { itemId: itemRef.id, aspId: r.state.currentAspId, pendingAspId: r.state.pendingAspId };
      if (codeRef && !code) tx.set(codeRef, { raw: codeRaw, norm: normalizeBarcode(codeRaw), normVersion: e.normVersion ?? 1, active: true, replacedBy: null, createdAt: FieldValue.serverTimestamp(), ...codeFields });
      else if (codeRef && e.type !== "relabel") tx.update(codeRef, codeFields);
      if (e.type === "relabel" && codeRef && newCodeRef) {
        tx.update(codeRef, { ...codeFields, active: false, replacedBy: e.codeId });
        tx.set(newCodeRef, { raw: e.codeRaw, norm: normalizeBarcode(e.codeRaw), normVersion: e.normVersion ?? 1, active: true, replacedBy: null, createdAt: FieldValue.serverTimestamp(), ...codeFields });
      }
      if (sh && sid) {
        tx.set(db.collection("shipments").doc(sid).collection("lines").doc(itemRef.id), { codeRaw: e.codeRaw, model: r.before?.model ?? model?.model ?? null, addedAt: FieldValue.serverTimestamp(), fromAspId: sh.fromAspId, toAspId: sh.toAspId ?? null, kind: sh.kind }, { merge: true });
        tx.update(db.collection("shipments").doc(sid), { itemCount: FieldValue.increment(1) });
      }
      if (sid && e.type === "arrive_at_warehouse") tx.set(db.collection("shipments").doc(sid).collection("lines").doc(itemRef.id), { arrivedAt: FieldValue.serverTimestamp() }, { merge: true });
      // §9.2 (D-30): a piece confirmed at the client as extra of one return shipment while it was in another one:
      // the line of that other shipment is "confirmed elsewhere" (its confirmation then skips it).
      const elsewhere = e.type === "return_confirm" && r.before?.status === "in_return" && r.before.shipmentId && r.before.shipmentId !== sid ? r.before.shipmentId as string : null;
      if (elsewhere) tx.set(db.collection("shipments").doc(elsewhere).collection("lines").doc(itemRef.id), { confirmedElsewhere: sid ?? true }, { merge: true });
      if (r.anomaly) await anomaly(tx, r.anomaly, e, { itemId: itemRef.id });
      tx.update(ref, { itemId: itemRef.id, codeId: e.codeId ?? null, processedAt: FieldValue.serverTimestamp(), scannedAtEffective: effective, outcome: r.anomaly ?? "ok" });
      return { before: r.before, state: r.state, itemId: itemRef.id, cat: catalogFrom(e, model) };
    });
    if (result) { bumpLater.push([result.before, { ...result.state, ...(result.cat ?? {}) }, result.itemId]); await flushBumps(); }
  } catch (err) {
    if (err instanceof Permanent) {
      await anomaly(null, "malformed_event", e);
      await mark({ outcome: "malformed" });
      return;
    }
    throw err; // transient: retried
  }
}

const bumpLater: [Doc | null, Doc, string][] = [];
async function flushBumps() {
  while (bumpLater.length) { const [b, a] = bumpLater.shift()!; await bumpAggregates(b, a).catch((e) => logger.warn("aggregates", { e: String(e) })); }
}

export const onEventCreated = onDocumentCreated({ document: "events/{eventId}", region: REGION, retry: true }, async (ev) => {
  await processEvent(ev.params.eventId);
});
