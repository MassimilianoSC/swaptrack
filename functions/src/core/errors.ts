import { HttpsError } from "firebase-functions/v2/https";

// Errors travel as codes; the app translates `errors.<code>` (R14).
export const fail = (
  kind: "invalid-argument" | "permission-denied" | "not-found" | "failed-precondition" | "already-exists" | "resource-exhausted" | "unauthenticated" | "unimplemented",
  code: string,
): never => {
  throw new HttpsError(kind, code);
};
