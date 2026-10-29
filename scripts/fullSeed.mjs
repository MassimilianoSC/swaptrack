// Full demo seed (SPEC §18). Writes items, codes, events (pre-processed), documents, shipments, alerts, anomalies.
// Invented data only. Emulators only (`demo-swaptrack`).
// Reuses the base seed (organizations, users, locations, models, settings) via scripts/seed.mjs.
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { randomUUID, createHash } from "node:crypto";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8180";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
const PROJECT = "demo-swaptrack";
initializeApp({ projectId: PROJECT });
const db = getFirestore();

const DAY = 24 * 3600 * 1000;
const now = Date.now();
const normalize = (s) => String(s ?? "").trim().replace(/^0+(?=\d)/, "").toUpperCase();
const codeId = (raw) => `cid_${createHash("sha1").update(`v1|${normalize(raw)}`).digest("hex").slice(0, 24)}`;
const locId = (code) => `loc_${encodeURIComponent(code)}`;
const mdlId = (code) => `mdl_${encodeURIComponent(code)}`;
const SHARDS = 10;

async function commitAll(writes) {
  for (let i = 0; i < writes.length; i += 450) {
    const b = db.batch();
    writes.slice(i, i + 450).forEach(([ref, data, kind]) => kind === "update" ? b.update(ref, data) : b.set(ref, data, { merge: true }));
    await b.commit();
  }
}

async function clearSeeded() {
  // Clears items / codes / events / documents / expectedCodes / shipments / anomalies / alerts / aggregates (keeps orgs/users/locations/models/settings).
  const cols = ["items", "codes", "events", "documents", "expectedCodes", "shipments", "anomalies", "alerts", "aggregates", "reports", "exports"];
  for (const c of cols) {
    const snap = await db.collection(c).get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = db.batch();
      for (const d of snap.docs.slice(i, i + 400)) b.delete(d.ref);
      await b.commit();
    }
  }
  // Lines are a subcollection of shipments: cleaned together with the parent.
}

function range(n) { return Array.from({ length: n }, (_, i) => i); }
const pick = (arr, i) => arr[i % arr.length];

// Each seeded event is "already processed": processedAt/scannedAtEffective set, so the trigger (if it fires) skips.
function eventDoc({ id, type, aspId, orgId, userId, locationId, scannedAt, codeRaw = null, payload = {}, source = "camera" }) {
  return [db.collection("events").doc(id), {
    type, source, engine: source === "camera" ? "fallback" : null,
    codeRaw, codeId: codeRaw ? codeId(codeRaw) : null, normVersion: 1, secondCodeRaw: null,
    locationId, aspId: aspId ?? null, orgId, userId, scannedAt: Timestamp.fromMillis(scannedAt), clockOffsetMs: 0, offsetMeasuredAt: null,
    payload, createdAt: Timestamp.fromMillis(scannedAt + 1000),
    processedAt: Timestamp.fromMillis(scannedAt + 2000), scannedAtEffective: Timestamp.fromMillis(scannedAt), itemId: payload.targetItemId ?? null, outcome: "ok",
  }];
}

function itemDoc(id, { status, flow, previousFlow = null, previousStatus = null, aspId, pendingAspId = null, locationId, locationType, siteOfOrigin = null, siteOfInstallation = null, model, lastScannedAt, shipmentId = null, sortingCategoryId = null, region = null }) {
  return [db.collection("items").doc(id), {
    status, statusSince: Timestamp.fromMillis(lastScannedAt), flow, previousFlow, previousStatus,
    currentLocationId: locationId, currentLocationType: locationType, currentAspId: aspId, pendingAspId,
    shipmentId, sortingCategoryId, siteOfOrigin, siteOfInstallation,
    lastEventId: null, lastScannedAt: Timestamp.fromMillis(lastScannedAt),
    modelId: model.id, materialCode: model.materialCode, model: model.model, manufacturer: model.manufacturer, equipmentType: model.equipmentType,
    needsModel: false, photoPaths: [], mergedInto: null, extra: {}, condition: null, currentRegion: region,
    createdAt: FieldValue.serverTimestamp(),
  }];
}

function codeDoc(raw, itemId, aspId, pendingAspId = null) {
  return [db.collection("codes").doc(codeId(raw)), { raw, norm: normalize(raw), normVersion: 1, itemId, aspId, pendingAspId, active: true, replacedBy: null, createdAt: FieldValue.serverTimestamp() }];
}

async function main() {
  console.log("Clearing previously seeded operational data...");
  await clearSeeded();

  // Load the catalog + locations + users written by scripts/seed.mjs.
  const orgs = (await db.collection("organizations").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const asps = orgs.filter((o) => o.type === "asp");
  const client = orgs.find((o) => o.type === "client");
  if (!client || asps.length < 3) throw new Error("Run scripts/seed.mjs first.");
  const locs = (await db.collection("locations").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const warehousesByAsp = Object.fromEntries(asps.map((a) => [a.id, locs.filter((l) => l.type === "asp_warehouse" && l.aspId === a.id)]));
  const sitesByAsp = Object.fromEntries(asps.map((a) => [a.id, locs.filter((l) => l.type === "site" && l.aspId === a.id)]));
  const clientWarehouse = locs.find((l) => l.type === "client_warehouse");
  const models = (await db.collection("models").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const users = (await db.collection("users").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const userBy = (orgId, roles) => users.find((u) => u.orgId === orgId && roles.includes(u.role));

  console.log(`${asps.length} ASPs, ${models.length} models, ${locs.length} locations.`);

  // ------- Items + codes + events (about 5,000 pieces across every state). -------
  const items = []; const codes = []; const events = [];
  const serial = (prefix, n) => `${prefix}-${String(n).padStart(6, "0")}`;
  let serialCounter = 0;
  const scenarios = [
    // [count, status, flow]
    [1500, "installed", "new"],
    [500, "received_at_asp", "new"],      // waiting to install
    [500, "sorted", "removed"],
    [300, "defective", "new"],
    [200, "leftover", "new"],
    [500, "removed_at_site", "removed"],
    [500, "returned", "removed"],
    [500, "in_transfer", "new"],
    [500, "in_return", "removed"],
  ];
  let countTotal = 0;
  for (const [count, status, flow] of scenarios) {
    for (let i = 0; i < count; i++) {
      const idx = countTotal + i;
      const asp = asps[idx % asps.length];
      const warehouse = pick(warehousesByAsp[asp.id], idx);
      const site = pick(sitesByAsp[asp.id], idx);
      const model = pick(models, idx);
      const raw = serial(asp.id === "org_asp_nord" ? "SNN" : asp.id === "org_asp_centro" ? "SNC" : "SNS", ++serialCounter);
      const itemId = `it_${raw}`;
      const warehouseUid = userBy(asp.id, ["asp_warehouse", "asp_admin"]).id;
      const technicianUid = userBy(asp.id, ["asp_technician"]).id;
      const base = now - (60 - (idx % 55)) * DAY; // spread over 2 months
      const push = (ev) => events.push(ev);
      const seq = { aspId: asp.id, orgId: asp.id, userId: warehouseUid };
      const addEvent = (type, locationId, at, payload = {}, uid = warehouseUid, codeRaw = raw) =>
        push(eventDoc({ id: randomUUID(), type, aspId: asp.id, orgId: asp.id, userId: uid, locationId, scannedAt: at, payload: { ...payload, targetItemId: itemId }, codeRaw }));
      // Build a valid sequence for each status.
      if (flow === "new") {
        addEvent("arrive_at_warehouse", warehouse.id, base, { flow: "new" });
        if (status === "installed") addEvent("install_at_site", site.id, base + 3 * DAY, {}, technicianUid);
        if (status === "defective") addEvent("classify", warehouse.id, base + 2 * DAY, { newClass: "defective" });
        if (status === "leftover") addEvent("classify", warehouse.id, base + 2 * DAY, { newClass: "leftover" });
        if (status === "in_transfer") {
          const otherAsp = asps[(idx + 1) % asps.length];
          const destWh = pick(warehousesByAsp[otherAsp.id], idx);
          const shipmentId = `sh_tr_${idx}`;
          addEvent("transfer_out", warehouse.id, base + 5 * DAY, { shipmentId });
        }
      } else {
        // removed flow
        addEvent("remove_at_site", site.id, base, {}, technicianUid);
        if (status !== "removed_at_site") addEvent("arrive_at_warehouse", warehouse.id, base + 1 * DAY);
        if (status === "sorted") addEvent("classify", warehouse.id, base + 2 * DAY, { categoryId: "cat_reuse" });
        if (status === "returned") {
          addEvent("classify", warehouse.id, base + 2 * DAY, { categoryId: "cat_scrap" });
          addEvent("return_ship", warehouse.id, base + 7 * DAY, { shipmentId: `sh_ret_old_${idx}` });
          events.push(eventDoc({ id: randomUUID(), type: "return_confirm", aspId: asp.id, orgId: client.id, userId: userBy(client.id, ["client_warehouse"]).id, locationId: clientWarehouse.id, scannedAt: base + 10 * DAY, source: "server", payload: { shipmentId: `sh_ret_old_${idx}`, targetItemId: itemId } }));
        }
        if (status === "in_return") {
          addEvent("classify", warehouse.id, base + 2 * DAY, { categoryId: "cat_refurbish" });
          addEvent("return_ship", warehouse.id, base + 5 * DAY, { shipmentId: `sh_ret_${idx}` });
        }
      }
      const sortingCategoryId = status === "sorted" ? "cat_reuse" : status === "returned" ? "cat_scrap" : status === "in_return" ? "cat_refurbish" : null;
      const previousFlow = idx % 10 === 0 && flow === "removed" ? "new" : null;
      const previousStatus = status === "in_transfer" || status === "in_return" ? (status === "in_transfer" ? "received_at_asp" : "sorted") : null;
      const location = status === "removed_at_site" || status === "installed" ? site : status === "returned" ? clientWarehouse : warehouse;
      items.push(itemDoc(itemId, {
        status, flow, previousFlow, previousStatus,
        aspId: status === "returned" ? asp.id : asp.id,
        pendingAspId: status === "in_transfer" ? asps[(idx + 1) % asps.length].id : null,
        locationId: location.id, locationType: location.type,
        siteOfOrigin: flow === "removed" ? site.id : null,
        siteOfInstallation: status === "installed" ? site.id : null,
        model, lastScannedAt: base + 10 * DAY, sortingCategoryId, region: location.region ?? null,
        shipmentId: status === "in_transfer" ? `sh_tr_${idx}` : status === "in_return" ? `sh_ret_${idx}` : null,
      }));
      codes.push(codeDoc(raw, itemId, asp.id, status === "in_transfer" ? asps[(idx + 1) % asps.length].id : null));
    }
    countTotal += count;
  }
  console.log(`Writing ${items.length} items, ${codes.length} codes, ${events.length} events...`);
  await commitAll(items);
  await commitAll(codes);
  await commitAll(events);

  // ------- Documents: 10 ddt_in, 5 ddt_return, 10 BOMs (some with differences). -------
  const docs = [];
  const expected = [];
  const createdAt = Timestamp.fromMillis(now - 30 * DAY);
  for (let i = 0; i < 10; i++) {
    const asp = asps[i % asps.length];
    const warehouse = warehousesByAsp[asp.id][0];
    const lines = range(5).map((j) => ({ kind: "serial", codeRaw: `DDT-${i}-${j}`, codeId: codeId(`DDT-${i}-${j}`), materialCode: null, modelId: null }));
    const docId = `doc_ddtin_${i}`;
    docs.push([db.collection("documents").doc(docId), {
      kind: "ddt_in", number: `DDT-IN-${100 + i}`, aspId: asp.id, locationId: warehouse.id,
      files: [], lines, linesSource: "manual", version: 1, status: i < 3 ? "checked" : "open", createdAt, updatedAt: createdAt, history: [], duplicateOf: null, shipmentId: null,
    }]);
    lines.forEach((l) => expected.push([db.collection("expectedCodes").doc(`${l.codeId}_${docId}`), { codeId: l.codeId, documentId: docId, kind: "ddt_in", aspId: asp.id, locationId: warehouse.id, materialCode: null, modelId: null, direction: null }]));
  }
  for (let i = 0; i < 5; i++) {
    const asp = asps[i % asps.length];
    const warehouse = warehousesByAsp[asp.id][0];
    const lines = range(4).map((j) => ({ kind: "serial", codeRaw: `DRT-${i}-${j}`, codeId: codeId(`DRT-${i}-${j}`), materialCode: null, modelId: null }));
    const docId = `doc_ddtret_${i}`;
    docs.push([db.collection("documents").doc(docId), {
      kind: "ddt_return", number: `DDT-RET-${200 + i}`, aspId: asp.id, locationId: warehouse.id, files: [], lines, linesSource: "manual", version: 1, status: "open", createdAt, updatedAt: createdAt, history: [], duplicateOf: null, shipmentId: null,
    }]);
  }
  for (let i = 0; i < 10; i++) {
    const asp = asps[i % asps.length];
    const site = sitesByAsp[asp.id][i];
    const lines = range(3).map((j) => ({ kind: "serial", codeRaw: `BOM-${i}-R-${j}`, codeId: codeId(`BOM-${i}-R-${j}`), direction: "remove" }))
      .concat(range(2).map((j) => ({ kind: "serial", codeRaw: `BOM-${i}-I-${j}`, codeId: codeId(`BOM-${i}-I-${j}`), direction: "install" })));
    const docId = `doc_bom_${i}`;
    docs.push([db.collection("documents").doc(docId), {
      kind: "bom", number: `BOM-${300 + i}`, aspId: asp.id, locationId: site.id, files: [], lines, linesSource: "manual", version: 1, status: "open", createdAt, updatedAt: createdAt, history: [], duplicateOf: null, shipmentId: null,
    }]);
    lines.forEach((l) => expected.push([db.collection("expectedCodes").doc(`${l.codeId}_${docId}`), { codeId: l.codeId, documentId: docId, kind: "bom", aspId: asp.id, locationId: site.id, materialCode: null, modelId: null, direction: l.direction }]));
  }
  await commitAll(docs);
  await commitAll(expected);

  // ------- Shipments: 5 transfers within + 3 between ASPs + 5 return shipments. -------
  const shipments = [];
  for (let i = 0; i < 5; i++) {
    const asp = asps[i % asps.length];
    const from = warehousesByAsp[asp.id][0];
    const to = warehousesByAsp[asp.id][1];
    shipments.push([db.collection("shipments").doc(`sh_in_${i}`), {
      kind: "transfer", fromLocationId: from.id, fromAspId: asp.id, toLocationId: to.id, toAspId: asp.id,
      ddtNumber: null, documentId: null, status: i < 3 ? "received" : "sent", itemCount: 2 + i,
      createdBy: userBy(asp.id, ["asp_warehouse", "asp_admin"]).id, createdAt, sentAt: createdAt, confirmedAt: null, receivedAt: i < 3 ? createdAt : null, confirmedComplete: null,
    }]);
  }
  for (let i = 0; i < 3; i++) {
    const from = asps[i % asps.length];
    const to = asps[(i + 1) % asps.length];
    const fromWh = warehousesByAsp[from.id][0];
    const toWh = warehousesByAsp[to.id][0];
    shipments.push([db.collection("shipments").doc(`sh_bt_${i}`), {
      kind: "transfer", fromLocationId: fromWh.id, fromAspId: from.id, toLocationId: toWh.id, toAspId: to.id,
      ddtNumber: null, documentId: null, status: "sent", itemCount: 3 + i, createdBy: users.find((u) => u.role === "client_admin").id, createdAt, sentAt: createdAt, confirmedAt: null, receivedAt: null, confirmedComplete: null,
    }]);
  }
  for (let i = 0; i < 5; i++) {
    const asp = asps[i % asps.length];
    const from = warehousesByAsp[asp.id][0];
    shipments.push([db.collection("shipments").doc(`sh_ret_${i * 100}`), {
      kind: "return", fromLocationId: from.id, fromAspId: asp.id, toLocationId: clientWarehouse.id, toAspId: null,
      ddtNumber: `R-${500 + i}`, documentId: null, status: i < 2 ? "confirmed" : "sent", itemCount: 10 + i,
      createdBy: userBy(asp.id, ["asp_warehouse"]).id, createdAt, sentAt: createdAt, confirmedAt: i < 2 ? createdAt : null, receivedAt: null, confirmedComplete: i === 0,
    }]);
  }
  await commitAll(shipments);

  // ------- Alerts (one per object, deterministic ids). -------
  const alerts = [];
  // stale_material on a couple of warehouses
  for (const a of asps.slice(0, 2)) {
    const wh = warehousesByAsp[a.id][0];
    alerts.push([db.collection("alerts").doc(`stale-${wh.id}-new`), {
      kind: "stale_material", aspId: a.id, locationId: wh.id, documentId: null, shipmentId: null, flow: "new",
      detail: { thresholdDays: 30, flow: "new" }, count: 12, createdAt, updatedAt: createdAt, seenAt: null, closedAt: null, closedNote: null,
    }]);
  }
  // ddt_in_difference on 2 DDTs
  for (let i = 0; i < 2; i++) {
    alerts.push([db.collection("alerts").doc(`ddt-doc_ddtin_${i}`), {
      kind: "ddt_in_difference", aspId: asps[i].id, locationId: warehousesByAsp[asps[i].id][0].id, documentId: `doc_ddtin_${i}`, shipmentId: null,
      detail: { missing: 2, unexpected: 1 }, count: 3, createdAt, updatedAt: createdAt, seenAt: null, closedAt: null, closedNote: null,
    }]);
  }
  // transfer_difference on one between-ASP transfer
  alerts.push([db.collection("alerts").doc(`transfer-sh_bt_0`), {
    kind: "transfer_difference", aspId: asps[0].id, locationId: warehousesByAsp[asps[1].id][0].id, documentId: null, shipmentId: "sh_bt_0",
    detail: { missing: 1 }, count: 1, createdAt, updatedAt: createdAt, seenAt: null, closedAt: null, closedNote: null,
  }]);
  // bom_difference on one BOM
  alerts.push([db.collection("alerts").doc(`bom-doc_bom_0`), {
    kind: "bom_difference", aspId: asps[0].id, locationId: sitesByAsp[asps[0].id][0].id, documentId: "doc_bom_0", shipmentId: null,
    detail: { missing: 1, unexpected: 0 }, count: 1, createdAt, updatedAt: createdAt, seenAt: null, closedAt: null, closedNote: null,
  }]);
  await commitAll(alerts);

  // ------- Anomalies (a few open ones). -------
  const anomalies = [];
  for (let i = 0; i < 6; i++) {
    const type = pick(["unknown_code_where_known_expected", "code_of_another_asp", "moved_without_transfer", "late_event"], i);
    anomalies.push([db.collection("anomalies").doc(`an_${i}`), {
      type, eventId: null, codeId: null, itemId: items[i * 100][0].id, locationId: items[i * 100][1].currentLocationId,
      aspId: asps[i % asps.length].id, detail: type, openedAt: createdAt, resolution: null, resolvedAt: null, resolvedBy: null,
    }]);
  }
  await commitAll(anomalies);

  // ------- Aggregate recount (§13.1): shard 0 per (scope, dimension); other shards empty. -------
  console.log("Recounting aggregates...");
  const totals = new Map();
  const add = (scope, dim, key) => {
    const id = `${scope}\u0000${dim}`;
    if (!totals.has(id)) totals.set(id, new Map());
    const m = totals.get(id);
    m.set(key, (m.get(key) ?? 0) + 1);
  };
  for (const [, it] of items) {
    const scopes = ["client", it.currentAspId].filter(Boolean);
    const k = (v) => String(v ?? "none").replace(/[.~*/[\]]/g, "_");
    const s = k(it.status);
    const dims = {
      statusByFlow: `${k(it.flow)}|${s}`,
      statusByModel: `${k(it.modelId)}|${s}`,
      statusByEquipmentType: `${k(it.equipmentType)}|${s}`,
      statusByManufacturer: `${k(it.manufacturer)}|${s}`,
      [it.currentLocationType === "site" ? "statusBySite" : "statusByWarehouse"]: `${k(it.currentLocationId)}|${s}`,
      removedPreviouslyNew: `${k(it.previousFlow)}|${s}`,
    };
    if (it.sortingCategoryId) dims.sortingCategory = `${k(it.sortingCategoryId)}|${s}`;
    if (it.currentRegion) dims.statusByRegion = `${k(it.currentRegion)}|${s}`;
    for (const scope of scopes) for (const [dim, key] of Object.entries(dims)) add(scope, dim, key);
  }
  const aggregateWrites = [];
  for (const [k, m] of totals) {
    const [scope, dimension] = k.split("\u0000");
    for (let shard = 0; shard < SHARDS; shard++) {
      aggregateWrites.push([db.collection("aggregates").doc(`${scope}_${dimension}_${shard}`), {
        scope, dimension, shard, counts: shard === 0 ? Object.fromEntries(m) : {}, recountedAt: FieldValue.serverTimestamp(),
      }]);
    }
  }
  await commitAll(aggregateWrites);

  console.log(`Full seed done: ${items.length} items, ${events.length} events, ${docs.length} documents, ${shipments.length} shipments, ${alerts.length} alerts, ${anomalies.length} anomalies, ${totals.size * SHARDS} aggregate docs.`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
