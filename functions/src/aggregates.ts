import { FieldValue } from "firebase-admin/firestore";
import { db } from "./core/admin";

// §13.1 aggregates: one doc per (scope, dimension, shard) with a map key -> counter; 10 shards summed when read.
// Incremented after the transaction commits; the nightly recount corrects drift.
export const SHARDS = 10;
type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const k = (v: unknown) => String(v ?? "none").replace(/[.~*/[\]]/g, "_");

export function cells(it: Doc | null): Record<string, string> {
  if (!it?.status) return {};
  const s = k(it.status);
  const out: Record<string, string> = {
    statusByFlow: `${k(it.flow)}|${s}`,
    statusByModel: `${k(it.modelId)}|${s}`,
    statusByEquipmentType: `${k(it.equipmentType)}|${s}`,
    statusByManufacturer: `${k(it.manufacturer)}|${s}`,
    [it.currentLocationType === "site" ? "statusBySite" : "statusByWarehouse"]: `${k(it.currentLocationId)}|${s}`,
    removedPreviouslyNew: `${k(it.previousFlow)}|${s}`,
  };
  if (it.sortingCategoryId) out.sortingCategory = `${k(it.sortingCategoryId)}|${s}`;
  if (it.currentRegion) out.statusByRegion = `${k(it.currentRegion)}|${s}`;
  return out;
}

export async function bumpAggregates(before: Doc | null, after: Doc | null) {
  const b = cells(before), a = cells(after);
  const scopes = (it: Doc | null) => (it ? ["client", it.currentAspId].filter(Boolean) as string[] : []);
  const delta = new Map<string, number>();
  const add = (cs: Record<string, string>, sc: string[], n: number) => sc.forEach((scope) => Object.entries(cs).forEach(([dim, key]) => {
    const id = `${scope}\u0000${dim}\u0000${key}`;
    delta.set(id, (delta.get(id) ?? 0) + n);
  }));
  add(b, scopes(before), -1);
  add(a, scopes(after), 1);
  const shard = Math.floor(Math.random() * SHARDS);
  const batch = db.batch();
  let n = 0;
  for (const [id, v] of delta) {
    if (!v) continue;
    const [scope, dim, key] = id.split("\u0000");
    batch.set(db.collection("aggregates").doc(`${scope}_${dim}_${shard}`), { scope, dimension: dim, shard, counts: { [key]: FieldValue.increment(v) } }, { merge: true });
    n++;
  }
  if (n) await batch.commit();
}
