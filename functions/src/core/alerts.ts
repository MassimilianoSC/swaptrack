import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";

type Doc = Record<string, unknown>;

// §11.4: creates or updates an alert. A difference found again reopens it (seen and closed cleared, as before)
// but keeps the date it was first created.
export async function upsertAlert(id: string, data: Doc): Promise<void> {
  const ref = db.collection("alerts").doc(id);
  await db.runTransaction(async (tx) => {
    const exists = (await tx.get(ref)).exists;
    tx.set(ref, {
      ...data, ...(exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(), seenAt: null, closedAt: null, closedNote: null,
    }, { merge: true });
  });
}

// D-29, §11.4 "creates or updates an alert": a check that finds no difference any more updates the open alert to
// count 0 with the new detail. It never closes it (closing stays a person's decision) and never creates one.
export async function zeroAlertIfOpen(id: string, detail: Doc): Promise<void> {
  const ref = db.collection("alerts").doc(id);
  await db.runTransaction(async (tx) => {
    const a = (await tx.get(ref)).data();
    if (!a || a.closedAt || a.count === 0) return;
    tx.update(ref, { count: 0, detail, updatedAt: FieldValue.serverTimestamp() });
  });
}
