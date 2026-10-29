import { FieldValue, Transaction } from "firebase-admin/firestore";
import { db } from "./admin";

// §4.16: administration actions only, never workers' activity.
export function adminLog(actor: string, action: string, target: string | null, details: Record<string, unknown> = {}, tx?: Transaction) {
  const ref = db.collection("adminLog").doc();
  const doc = { actor, action, target, details, at: FieldValue.serverTimestamp() };
  if (tx) { tx.set(ref, doc); return Promise.resolve(); }
  return ref.set(doc).then(() => undefined);
}
