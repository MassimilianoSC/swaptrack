import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { fail } from "./errors";

// Fixed-window counter in `rateLimits` (server-only collection, DECISIONS b9).
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const window = Math.floor(Date.now() / 1000 / windowSec);
  const ref = db.collection("rateLimits").doc(`${key.replace(/\//g, "_").slice(0, 300)}_${windowSec}_${window}`);
  const count = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const n = (snap.exists ? (snap.get("count") as number) : 0) + 1;
    tx.set(ref, { count: n, expiresAt: new Date((window + 1) * windowSec * 1000), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return n;
  });
  if (count > limit) fail("resource-exhausted", "rate_limited");
}
