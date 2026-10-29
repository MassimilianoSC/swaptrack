import { beforeUserCreated, beforeUserSignedIn, HttpsError } from "firebase-functions/v2/identity";
import { db, REGION } from "./core/admin";

// Blocking functions (§4.4). Require Firebase Authentication with Identity Platform (§18).
// Admin SDK creations (invitations) do not trigger them: any other account creation is refused.
export const beforeCreate = beforeUserCreated({ region: REGION }, async (event) => {
  const email = event.data?.email?.toLowerCase();
  if (!email) throw new HttpsError("permission-denied", "no_active_account");
  const snap = await db.collection("users").where("email", "==", email).where("active", "==", true).limit(1).get();
  if (snap.empty) throw new HttpsError("permission-denied", "no_active_account");
  return;
});

// DECISIONS b8: any sign-in without an active user document is refused. Token refresh does not run this.
export const beforeSignIn = beforeUserSignedIn({ region: REGION }, async (event) => {
  const uid = event.data?.uid;
  const snap = uid ? await db.collection("users").doc(uid).get() : null;
  if (!snap?.exists || snap.get("deleted") || snap.get("active") !== true) {
    throw new HttpsError("permission-denied", "no_active_account");
  }
  return;
});
